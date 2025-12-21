#!/bin/bash

# Configure PostgreSQL to accept remote connections

VPS_IP="206.189.70.100"

echo "Configuring PostgreSQL for remote connections on VPS..."

ssh -o StrictHostKeyChecking=no root@${VPS_IP} << 'ENDSSH'
  set -e
  
  echo "Step 1: Finding PostgreSQL configuration directory..."
  PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
  PG_CONF_DIR="/etc/postgresql/${PG_VERSION}/main"
  
  if [ ! -d "$PG_CONF_DIR" ]; then
    # Try alternative location
    PG_CONF_DIR=$(find /etc/postgresql -name postgresql.conf -type f | head -1 | xargs dirname)
  fi
  
  if [ -z "$PG_CONF_DIR" ] || [ ! -d "$PG_CONF_DIR" ]; then
    echo "Error: Could not find PostgreSQL configuration directory"
    exit 1
  fi
  
  echo "Using PostgreSQL config directory: $PG_CONF_DIR"
  
  echo ""
  echo "Step 2: Configuring postgresql.conf to listen on all addresses..."
  POSTGRESQL_CONF="${PG_CONF_DIR}/postgresql.conf"
  
  # Update listen_addresses
  if grep -q "^listen_addresses" "$POSTGRESQL_CONF"; then
    sed -i "s/^listen_addresses.*/listen_addresses = '*'/" "$POSTGRESQL_CONF"
  else
    echo "listen_addresses = '*'" >> "$POSTGRESQL_CONF"
  fi
  
  echo "✓ Updated listen_addresses"
  
  echo ""
  echo "Step 3: Configuring pg_hba.conf to allow remote connections..."
  PG_HBA="${PG_CONF_DIR}/pg_hba.conf"
  
  # Remove existing entries for our IP range if they exist
  sed -i '/^host.*all.*all.*0\.0\.0\.0\/0.*md5/d' "$PG_HBA" 2>/dev/null || true
  
  # Add entry for remote connections
  if ! grep -q "^host.*all.*all.*0\.0\.0\.0/0.*md5" "$PG_HBA"; then
    echo "" >> "$PG_HBA"
    echo "# Allow remote connections" >> "$PG_HBA"
    echo "host    all             all             0.0.0.0/0               md5" >> "$PG_HBA"
  fi
  
  echo "✓ Updated pg_hba.conf"
  
  echo ""
  echo "Step 4: Checking firewall (ufw)..."
  if command -v ufw &> /dev/null; then
    ufw allow 5432/tcp || echo "Note: ufw might not be active"
  fi
  
  echo ""
  echo "Step 5: Restarting PostgreSQL..."
  systemctl restart postgresql
  sleep 2
  
  if systemctl is-active --quiet postgresql; then
    echo "✓ PostgreSQL restarted successfully"
  else
    echo "⚠ Warning: PostgreSQL might not have restarted properly"
    systemctl status postgresql
  fi
  
  echo ""
  echo "Step 6: Verifying configuration..."
  echo "Listen addresses:"
  sudo -u postgres psql -c "SHOW listen_addresses;" || echo "Could not verify"
  
  echo ""
  echo "✓ PostgreSQL configured for remote connections"
  echo ""
  echo "You can now connect from your local machine using:"
  echo "postgresql://polytrade:PASSWORD@206.189.70.100:5432/polytrade"
ENDSSH

echo ""
echo "✓ Configuration complete!"
echo ""
echo "Test the connection with:"
echo "psql 'postgresql://polytrade:<YOUR_PASSWORD_URL_ENCODED>@<YOUR_VPS_IP>:5432/polytrade'"

