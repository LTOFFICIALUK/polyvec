#!/bin/bash

# Quick script to delete test user only
# Usage: ./scripts/delete-user-only.sh

DB_HOST="${DB_HOST:-206.189.70.100}"
DB_USER="${DB_USER:-polytrade}"
DB_NAME="${DB_NAME:-polytrade}"

echo "🗑️  Deleting test user: everythingsimpleinc1@gmail.com"
echo ""

read -sp "Enter database password: " DB_PASSWORD
echo ""

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME <<EOF
-- Delete the test user
DELETE FROM users WHERE email = 'everythingsimpleinc1@gmail.com';

-- Verify deletion
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ User deleted successfully'
    ELSE '❌ User still exists'
  END as status
FROM users
WHERE email = 'everythingsimpleinc1@gmail.com';
EOF

echo ""
echo "✅ Done!"

