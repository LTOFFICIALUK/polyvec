#!/bin/bash

# Quick script to run the migration only
# Usage: ./scripts/run-migration-only.sh

DB_HOST="${DB_HOST:-206.189.70.100}"
DB_USER="${DB_USER:-polytrade}"
DB_NAME="${DB_NAME:-polytrade}"

echo "🔄 Running custodial wallet migration..."
echo ""

read -sp "Enter database password: " DB_PASSWORD
echo ""

PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/migrations/005_add_custodial_wallets.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
else
    echo ""
    echo "❌ Migration failed. Check the error above."
    exit 1
fi

