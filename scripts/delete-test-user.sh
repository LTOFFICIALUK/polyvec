#!/bin/bash

# Script to delete test user from database
# Usage: ./scripts/delete-test-user.sh

# Database connection details
DB_HOST="${DB_HOST:-206.189.70.100}"
DB_USER="${DB_USER:-polytrade}"
DB_NAME="${DB_NAME:-polytrade}"

echo "🗑️  Deleting test user: everythingsimpleinc1@gmail.com"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client tools."
    echo ""
    echo "Alternative: Run the SQL manually on your VPS:"
    echo "  psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f scripts/delete-test-user.sql"
    exit 1
fi

# Prompt for password
read -sp "Enter database password: " DB_PASSWORD
echo ""

# Run the deletion
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME <<EOF
-- Delete the test user
DELETE FROM users WHERE email = 'everythingsimpleinc1@gmail.com';

-- Verify deletion
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ User deleted successfully'
    ELSE '❌ User still exists: ' || COUNT(*)::text
  END as status
FROM users
WHERE email = 'everythingsimpleinc1@gmail.com';

-- Show remaining users
SELECT 'Remaining users:' as info;
SELECT id, email, wallet_address, created_at 
FROM users 
ORDER BY created_at DESC 
LIMIT 10;
EOF

echo ""
echo "✅ Done!"

