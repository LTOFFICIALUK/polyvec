#!/bin/bash

# Complete setup script - deletes user, runs migration, and sets up environment
# Usage: ./scripts/run-all-setup.sh

set -e

DB_HOST="${DB_HOST:-206.189.70.100}"
DB_USER="${DB_USER:-polytrade}"
DB_NAME="${DB_NAME:-polytrade}"
TRADING_KEY_SECRET="<YOUR_TRADING_KEY_SECRET>"

echo "🚀 Complete Custodial Wallet Setup"
echo "===================================="
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client tools."
    exit 1
fi

# Step 1: Delete test user
echo "Step 1: Deleting test user..."
read -sp "Enter database password: " DB_PASSWORD
echo ""

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME <<EOF
-- Delete the test user
DELETE FROM users WHERE email = 'everythingsimpleinc1@gmail.com';

-- Verify deletion
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ Test user deleted successfully'
    ELSE '⚠️  User still exists'
  END as status
FROM users
WHERE email = 'everythingsimpleinc1@gmail.com';
EOF

# Step 2: Run migration
echo ""
echo "Step 2: Running migration..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/migrations/005_add_custodial_wallets.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully"
else
    echo "❌ Migration failed"
    exit 1
fi

# Step 3: Verify migration
echo ""
echo "Step 3: Verifying migration..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME <<EOF
-- Check if columns exist
SELECT 
  CASE 
    WHEN COUNT(*) = 5 THEN '✅ All wallet columns exist'
    ELSE '⚠️  Missing columns'
  END as status
FROM information_schema.columns
WHERE table_name = 'users' 
  AND column_name IN ('wallet_address', 'encrypted_private_key', 'key_iv', 'key_auth_tag', 'key_salt');

-- Check if tables exist
SELECT 
  CASE 
    WHEN COUNT(*) = 2 THEN '✅ All tables exist (user_balances, deposits)'
    ELSE '⚠️  Missing tables'
  END as status
FROM information_schema.tables
WHERE table_name IN ('user_balances', 'deposits');
EOF

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Add to .env.local: TRADING_KEY_SECRET=$TRADING_KEY_SECRET"
echo "2. Set on VPS: export TRADING_KEY_SECRET=$TRADING_KEY_SECRET"
echo "3. Restart your application"
echo "4. Sign up to test wallet creation"

