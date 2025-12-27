#!/bin/bash

# Script to run trading_fees table migration on VPS PostgreSQL database
# This adds the trading_fees table to track platform fee collections

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# VPS Configuration
VPS_IP="${VPS_IP:-206.189.70.100}"
VPS_USER="${VPS_USER:-root}"
DB_NAME="${DB_NAME:-polyvec}"
DB_USER="${DB_USER:-polyvec}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Trading Fees Migration Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "This script will add the trading_fees table to your VPS PostgreSQL database."
echo ""
echo "VPS IP: ${VPS_IP}"
echo "Database: ${DB_NAME}"
echo "Database User: ${DB_USER}"
echo ""

# Check if migration file exists
MIGRATION_FILE="database/migrations/013_create_trading_fees.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ Migration file not found: ${MIGRATION_FILE}${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Transferring migration file to VPS...${NC}"

# Transfer migration file to VPS
scp "$MIGRATION_FILE" ${VPS_USER}@${VPS_IP}:/tmp/013_create_trading_fees.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migration file transferred${NC}"
else
    echo -e "${RED}❌ Failed to transfer migration file${NC}"
    echo -e "${YELLOW}   Make sure you have SSH access to the VPS${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 2: Running migration on VPS database...${NC}"

# SSH into VPS and run migration
ssh ${VPS_USER}@${VPS_IP} << EOF
    echo "Running migration on VPS..."
    
    # Check if database exists
    if ! psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT 1" > /dev/null 2>&1; then
        echo "Error: Cannot connect to database ${DB_NAME} as user ${DB_USER}"
        echo "Please check your database credentials"
        exit 1
    fi
    
    # Run the migration
    echo "Executing migration: 013_create_trading_fees.sql"
    psql -U ${DB_USER} -d ${DB_NAME} -f /tmp/013_create_trading_fees.sql
    
    if [ \$? -eq 0 ]; then
        echo "✅ Migration completed successfully"
        
        # Verify table was created
        echo ""
        echo "Verifying table creation..."
        TABLE_EXISTS=\$(psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trading_fees');")
        
        if [ "\$TABLE_EXISTS" = " t" ] || [ "\$TABLE_EXISTS" = "t" ]; then
            echo "✅ trading_fees table exists"
            
            # Show table structure
            echo ""
            echo "Table structure:"
            psql -U ${DB_USER} -d ${DB_NAME} -c "\d trading_fees"
            
            # Count existing records (should be 0 for new table)
            RECORD_COUNT=\$(psql -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM trading_fees;")
            echo ""
            echo "Current records in trading_fees: \$RECORD_COUNT"
        else
            echo "⚠️  Warning: Table verification failed"
        fi
        
        # Clean up
        rm -f /tmp/013_create_trading_fees.sql
    else
        echo "❌ Migration failed"
        exit 1
    fi
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Migration completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "The trading_fees table has been added to your VPS database."
    echo "Fee collections will now be automatically tracked."
    echo ""
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ Migration failed${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Please check the error messages above and try again."
    exit 1
fi

