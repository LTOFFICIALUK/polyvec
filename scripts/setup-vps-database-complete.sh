#!/bin/bash

# Complete VPS Database Setup Script
# This script sets up PostgreSQL, creates the database, user, and runs migrations

VPS_IP="206.189.70.100"
DB_USER="polytrade"
DB_NAME="polytrade"
DB_PASSWORD="6Te4WfZi*V/r"
SSH_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFmlZdeNLM+kUP1MphMWK4eYD948vZuq7bXTUsZXsNE3 BLclipproject@gmail.com"

echo "=========================================="
echo "VPS Database Setup Script"
echo "=========================================="
echo ""

# Create temporary migration file content
MIGRATION_SQL=$(cat << 'MIGRATION_EOF'
-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Create email_list table for newsletter signups
CREATE TABLE IF NOT EXISTS email_list (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(100) DEFAULT 'landing_page'
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_email_list_email ON email_list(email);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
MIGRATION_EOF
)

echo "Connecting to VPS and setting up database..."
echo ""

ssh -o StrictHostKeyChecking=no root@${VPS_IP} << ENDSSH
  set -e
  
  echo "Step 1: Installing PostgreSQL if needed..."
  if ! command -v psql &> /dev/null; then
    echo "Installing PostgreSQL..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
    echo "✓ PostgreSQL installed"
  else
    echo "✓ PostgreSQL already installed"
  fi
  
  echo ""
  echo "Step 2: Configuring PostgreSQL for remote connections..."
  # Update pg_hba.conf to allow password authentication
  if ! grep -q "^host.*all.*all.*0.0.0.0/0.*md5" /etc/postgresql/*/main/pg_hba.conf 2>/dev/null; then
    echo "host    all             all             0.0.0.0/0               md5" >> /etc/postgresql/*/main/pg_hba.conf
  fi
  
  # Update postgresql.conf to listen on all addresses
  POSTGRESQL_CONF="/etc/postgresql/*/main/postgresql.conf"
  if [ -f /etc/postgresql/*/main/postgresql.conf ]; then
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /etc/postgresql/*/main/postgresql.conf 2>/dev/null || true
    systemctl restart postgresql
    echo "✓ PostgreSQL configured for remote connections"
  fi
  
  echo ""
  echo "Step 3: Creating database and user..."
  sudo -u postgres psql << PSQL
    -- Create database if not exists
    SELECT 'CREATE DATABASE ${DB_NAME}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\\gexec
    
    -- Create user if not exists
    DO \\$\\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '${DB_USER}') THEN
        CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
      ELSE
        ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
      END IF;
    END
    \\$\\$;
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
    ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
    
    -- Grant schema privileges
    \\c ${DB_NAME}
    GRANT ALL ON SCHEMA public TO ${DB_USER};
    ALTER SCHEMA public OWNER TO ${DB_USER};
PSQL
  
  echo "✓ Database and user created"
  
  echo ""
  echo "Step 4: Running migrations..."
  sudo -u postgres psql -d ${DB_NAME} << MIGRATION
${MIGRATION_SQL}
MIGRATION
  
  echo "✓ Migrations completed"
  
  echo ""
  echo "Step 5: Verifying setup..."
  sudo -u postgres psql -d ${DB_NAME} -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'email_list');" || echo "Warning: Could not verify tables"
  
  echo ""
  echo "=========================================="
  echo "✓ Database setup complete!"
  echo "=========================================="
  echo ""
  echo "Database: ${DB_NAME}"
  echo "User: ${DB_USER}"
  echo "Host: ${VPS_IP}"
  echo "Port: 5432"
  echo ""
ENDSSH

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ VPS database setup completed successfully!"
  echo ""
  echo "You can now test the connection by:"
  echo "1. Restarting your dev server: npm run dev"
  echo "2. Trying to sign up a new user on the landing page"
  echo ""
else
  echo ""
  echo "✗ Setup failed. Please check the error messages above."
  echo ""
  echo "You can also set up manually by:"
  echo "1. SSH into the VPS: ssh root@${VPS_IP}"
  echo "2. Run the SQL commands manually"
  echo ""
fi

