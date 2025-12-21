#!/bin/bash

# Setup script for VPS database
# Run this on your VPS to set up the database and run migrations

VPS_IP="206.189.70.100"
DB_USER="polytrade"
DB_NAME="polytrade"
DB_PASSWORD="<YOUR_DB_PASSWORD>"

echo "Setting up database on VPS..."

# Connect to VPS and run setup
ssh -o StrictHostKeyChecking=no root@${VPS_IP} << 'ENDSSH'
  # Install PostgreSQL if not already installed
  if ! command -v psql &> /dev/null; then
    echo "Installing PostgreSQL..."
    apt-get update
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
  fi

  # Create database and user if they don't exist
  sudo -u postgres psql << 'PSQL'
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'polytrade') THEN
        CREATE DATABASE polytrade;
      END IF;
    END
    \$\$;

    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'polytrade') THEN
        CREATE USER polytrade WITH PASSWORD '<YOUR_DB_PASSWORD>';
      END IF;
    END
    \$\$;

    GRANT ALL PRIVILEGES ON DATABASE polytrade TO polytrade;
    ALTER DATABASE polytrade OWNER TO polytrade;
PSQL

  echo "Database setup complete!"
ENDSSH

echo ""
echo "To run migrations, copy the migration file to VPS and run:"
echo "scp database/migrations/004_create_users.sql root@${VPS_IP}:/tmp/"
echo "ssh root@${VPS_IP} 'psql -U polytrade -d polytrade -h localhost -f /tmp/004_create_users.sql'"
echo ""
echo "Or run migrations automatically via the application on first signup."
