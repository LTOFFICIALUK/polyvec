#!/bin/bash
# VPS TimescaleDB Setup Script for DigitalOcean Droplet
# Run this script on your VPS after SSH'ing in

set -e  # Exit on any error

echo "🚀 Setting up TimescaleDB on VPS..."
echo ""

# Step 1: Update system
echo "📦 Updating package list..."
sudo apt update

# Step 2: Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Step 3: Install TimescaleDB
echo "📦 Installing TimescaleDB extension..."

# Add TimescaleDB repository
sudo sh -c "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"

# Add GPG key
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo apt-key add -

# Update and install
sudo apt update
sudo apt install -y timescaledb-2-postgresql-16

# Tune PostgreSQL for TimescaleDB
echo "⚙️  Tuning PostgreSQL for TimescaleDB..."
sudo timescaledb-tune --quiet --yes

# Step 4: Configure PostgreSQL
echo "⚙️  Configuring PostgreSQL..."

# Enable TimescaleDB in postgresql.conf
PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
CONF_FILE="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"

if ! grep -q "shared_preload_libraries = 'timescaledb'" "$CONF_FILE"; then
  echo "shared_preload_libraries = 'timescaledb'" | sudo tee -a "$CONF_FILE" > /dev/null
fi

# Enable remote connections (for Railway to connect)
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"

# Backup original
sudo cp "$PG_HBA" "${PG_HBA}.backup"

# Add connection rule (allow all IPs - we'll secure with password)
if ! grep -q "host    polytrade" "$PG_HBA"; then
  echo "host    polytrade    polytrade    0.0.0.0/0    md5" | sudo tee -a "$PG_HBA" > /dev/null
fi

# Update postgresql.conf to listen on all addresses
if ! grep -q "^listen_addresses = '*'" "$CONF_FILE"; then
  sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$CONF_FILE"
fi

# Step 5: Restart PostgreSQL
echo "🔄 Restarting PostgreSQL..."
sudo systemctl restart postgresql
sudo systemctl enable postgresql

# Step 6: Generate secure password
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
echo ""
echo "✅ Database password generated: ${DB_PASSWORD}"
echo "⚠️  SAVE THIS PASSWORD - you'll need it for Railway!"
echo ""

# Step 7: Create database and user
echo "🗄️  Creating database and user..."
sudo -u postgres psql <<EOF
CREATE DATABASE polytrade;
CREATE USER polytrade WITH PASSWORD '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE polytrade TO polytrade;
ALTER DATABASE polytrade OWNER TO polytrade;
\q
EOF

# Step 8: Enable TimescaleDB extension
echo "🔧 Enabling TimescaleDB extension..."
sudo -u postgres psql -d polytrade <<EOF
CREATE EXTENSION IF NOT EXISTS timescaledb;
\q
EOF

# Step 9: Configure firewall (if ufw is active)
echo "🔥 Configuring firewall..."
if sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 5432/tcp
  echo "✅ Firewall rule added for PostgreSQL (port 5432)"
else
  echo "ℹ️  Firewall not active, skipping..."
fi

# Step 10: Get VPS IP
VPS_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip)

echo ""
echo "========================================="
echo "✅ TimescaleDB setup complete!"
echo "========================================="
echo ""
echo "📋 Connection Details:"
echo "   Host: ${VPS_IP}"
echo "   Port: 5432"
echo "   Database: polytrade"
echo "   User: polytrade"
echo "   Password: ${DB_PASSWORD}"
echo ""
echo "🔗 DATABASE_URL for Railway:"
echo "   postgresql://polytrade:${DB_PASSWORD}@${VPS_IP}:5432/polytrade"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "   1. Copy the DATABASE_URL above"
echo "   2. Add it to Railway ws-service environment variables"
echo "   3. Restart the Railway ws-service"
echo ""
echo "🧪 Test connection from your local machine:"
echo "   psql 'postgresql://polytrade:${DB_PASSWORD}@${VPS_IP}:5432/polytrade' -c 'SELECT version();'"
echo ""

