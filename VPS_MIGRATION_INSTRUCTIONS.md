# VPS Database Migration: Trading Fees Table

This guide shows you how to add the `trading_fees` table to your VPS PostgreSQL database.

## Quick Method: Automated Script

Run the automated script from your local machine:

```bash
bash scripts/setup-trading-fees-migration.sh
```

This script will:
1. Transfer the migration file to your VPS
2. Run the migration on your VPS database
3. Verify the table was created successfully

**Requirements:**
- SSH access to your VPS (IP: 206.189.70.100)
- Database credentials configured

## Manual Method: SSH into VPS

If you prefer to run it manually:

### Step 1: Transfer Migration File

```bash
# From your local machine
scp database/migrations/013_create_trading_fees.sql root@206.189.70.100:/tmp/
```

### Step 2: SSH into VPS

```bash
ssh root@206.189.70.100
```

### Step 3: Run Migration

```bash
# Navigate to your project directory (if needed)
cd /path/to/your/project

# Run the migration
psql -U polyvec -d polyvec -f /tmp/013_create_trading_fees.sql
```

**If prompted for password:** Enter your PostgreSQL password.

### Step 4: Verify Table Created

```bash
# Check if table exists
psql -U polyvec -d polyvec -c "\d trading_fees"

# Check table structure
psql -U polyvec -d polyvec -c "SELECT COUNT(*) FROM trading_fees;"
```

Expected output:
- Table structure showing all columns
- Count should be 0 (new table)

## Alternative: Direct SQL Execution

If you have direct database access:

```bash
# Connect to database
psql -U polyvec -d polyvec

# Then paste the SQL from database/migrations/013_create_trading_fees.sql
# Or run:
\i /tmp/013_create_trading_fees.sql
```

## Troubleshooting

### "Password authentication failed"
- Check your database user and password
- Verify `.env.local` on VPS has correct `DATABASE_URL`

### "Permission denied"
- Make sure the database user has CREATE TABLE privileges
- Run: `GRANT ALL PRIVILEGES ON DATABASE polyvec TO polyvec;`

### "Table already exists"
- The migration uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times
- If you want to recreate, first drop: `DROP TABLE IF EXISTS trading_fees;`

### "Connection refused"
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Verify database exists: `psql -U polyvec -l`

## Verification

After migration, verify the table:

```sql
-- Check table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'trading_fees';

-- Check indexes
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'trading_fees';

-- Check structure
\d trading_fees
```

## What This Migration Does

Creates the `trading_fees` table with:
- User tracking (user_id, wallet_address)
- Trade details (trade_amount, fee_amount, fee_rate)
- Transaction info (transaction_hash, order_id)
- Trade metadata (token_id, side, shares, price)
- Status tracking (collected, failed, pending)
- Timestamps (created_at, collected_at)
- Proper indexes for fast queries

## Next Steps

After migration:
1. ✅ Table is created
2. ✅ Fee collection will automatically record to this table
3. ✅ Admin dashboard can view fees in the "Fees" tab
4. ✅ All future fee collections will be tracked

## Rollback (if needed)

If you need to remove the table:

```sql
DROP TABLE IF EXISTS trading_fees CASCADE;
```

**Warning:** This will delete all fee records. Only do this if you're sure.

