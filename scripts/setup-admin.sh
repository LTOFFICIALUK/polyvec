#!/bin/bash

# Script to set up admin access for a user
# Usage: ./scripts/setup-admin.sh <email>

VPS_IP="${VPS_IP:-206.189.70.100}"
DB_USER="${DB_USER:-polyvec}"
DB_NAME="${DB_NAME:-polyvec}"
DB_PASSWORD="${DB_PASSWORD}"

if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: DB_PASSWORD environment variable is required"
  echo "Usage: DB_PASSWORD='your-password' ./scripts/setup-admin.sh <email>"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: ./scripts/setup-admin.sh <email>"
  echo "Example: ./scripts/setup-admin.sh admin@example.com"
  exit 1
fi

EMAIL="$1"

echo "========================================="
echo "Setting up Admin Access"
echo "========================================="
echo ""
echo "Email: ${EMAIL}"
echo ""

# Run migration and set admin status
ssh root@${VPS_IP} << EOF
  # Run migration
  echo "Running database migration..."
  PGPASSWORD='${DB_PASSWORD}' psql -h localhost -U ${DB_USER} -d ${DB_NAME} << PSQL
    -- Add admin columns if not exist
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITH TIME ZONE;
    
    -- Set user as admin
    UPDATE users SET is_admin = TRUE WHERE email = '${EMAIL}';
    
    -- Verify
    SELECT id, email, is_admin, is_banned FROM users WHERE email = '${EMAIL}';
PSQL

  echo ""
  echo "✅ Admin access granted to ${EMAIL}"
EOF

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "You can now access the admin dashboard at:"
echo "  https://polyvec.com/admin"
echo ""
echo "Or locally at:"
echo "  http://localhost:3000/admin"
echo ""

