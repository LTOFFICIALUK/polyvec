#!/bin/bash

# Setup script for custodial wallet system
# This script helps set up the environment and run migrations

set -e

echo "🔐 Custodial Wallet System Setup"
echo "=================================="
echo ""

# Database connection details
DB_HOST="${DB_HOST:-206.189.70.100}"
DB_USER="${DB_USER:-polytrade}"
DB_NAME="${DB_NAME:-polytrade}"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client tools."
    exit 1
fi

# Step 1: Check environment variable
echo "Step 1: Checking TRADING_KEY_SECRET..."
if [ -z "$TRADING_KEY_SECRET" ]; then
    echo "⚠️  TRADING_KEY_SECRET not set in environment"
    echo ""
    echo "Using existing secret (add this to your .env.local and VPS environment):"
    echo "TRADING_KEY_SECRET=<YOUR_TRADING_KEY_SECRET>"
    echo ""
    read -p "Press Enter to continue after adding TRADING_KEY_SECRET to your environment..."
else
    echo "✅ TRADING_KEY_SECRET is set"
fi

# Step 2: Delete test user
echo ""
echo "Step 2: Deleting test user..."
read -sp "Enter database password: " DB_PASSWORD
echo ""

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME <<EOF
-- Delete test user
DELETE FROM users WHERE email = 'everythingsimpleinc1@gmail.com';

-- Verify deletion
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ Test user deleted successfully'
    ELSE '⚠️  User still exists: ' || COUNT(*)::text
  END as status
FROM users
WHERE email = 'everythingsimpleinc1@gmail.com';
EOF

# Step 3: Run migration
echo ""
echo "Step 3: Running migration..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/migrations/005_add_custodial_wallets.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully"
else
    echo "❌ Migration failed"
    exit 1
fi

# Step 4: Verify migration
echo ""
echo "Step 4: Verifying migration..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME <<EOF
-- Check if columns exist
SELECT 
  CASE 
    WHEN COUNT(*) = 5 THEN '✅ All wallet columns exist'
    ELSE '⚠️  Missing columns: ' || (5 - COUNT(*))::text
  END as status
FROM information_schema.columns
WHERE table_name = 'users' 
  AND column_name IN ('wallet_address', 'encrypted_private_key', 'key_iv', 'key_auth_tag', 'key_salt');

-- Check if tables exist
SELECT 
  CASE 
    WHEN COUNT(*) = 2 THEN '✅ All tables exist'
    ELSE '⚠️  Missing tables: ' || (2 - COUNT(*))::text
  END as status
FROM information_schema.tables
WHERE table_name IN ('user_balances', 'deposits');
EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Ensure TRADING_KEY_SECRET is set in your .env.local file"
echo "2. Ensure TRADING_KEY_SECRET is set on your VPS/server"
echo "3. Sign up with your email to test wallet creation"
echo "4. Verify wallet was created: SELECT wallet_address FROM users WHERE email = 'your-email';"

