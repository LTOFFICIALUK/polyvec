# Quick Setup Guide - Custodial Wallets

## ✅ What I've Done

1. ✅ Generated secure `TRADING_KEY_SECRET` (64 characters)
2. ✅ Created migration script (`005_add_custodial_wallets.sql`)
3. ✅ Created setup scripts for easy execution
4. ✅ Created user deletion script

## 🚀 Setup Steps (Run These Now)

### Step 1: Add Secret to .env.local

Add this line to your `.env.local` file (create it if it doesn't exist):

```bash
TRADING_KEY_SECRET=<YOUR_TRADING_KEY_SECRET>
```

**Location:** Project root directory (same level as `package.json`)

### Step 2: Delete Test User

Run this script to delete your test account:

```bash
./scripts/delete-user-only.sh
```

Or manually on VPS:
```bash
psql -h 206.189.70.100 -U polytrade -d polytrade
# Then run:
DELETE FROM users WHERE email = 'everythingsimpleinc1@gmail.com';
```

### Step 3: Run Migration

Run the migration to add wallet columns and tables:

```bash
./scripts/run-migration-only.sh
```

Or manually on VPS:
```bash
psql -h 206.189.70.100 -U polytrade -d polytrade -f database/migrations/005_add_custodial_wallets.sql
```

### Step 4: Set Secret on VPS (Important!)

SSH into your VPS and set the environment variable:

```bash
ssh root@206.189.70.100

# Add to environment
export TRADING_KEY_SECRET=<YOUR_TRADING_KEY_SECRET>

# Or add to your app's .env file or systemd service
```

**Important:** The VPS needs this secret to encrypt/decrypt wallet private keys!

## ✅ Verification

After completing the steps above:

1. **Check migration:**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'users' AND column_name LIKE '%wallet%';
   ```
   Should show: `wallet_address`, `encrypted_private_key`, `key_iv`, `key_auth_tag`, `key_salt`

2. **Check tables:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('user_balances', 'deposits');
   ```
   Should show both tables.

3. **Verify test user deleted:**
   ```sql
   SELECT COUNT(*) FROM users WHERE email = 'everythingsimpleinc1@gmail.com';
   ```
   Should return: `0`

## 🎯 Ready to Test

Once all steps are complete, you can:

1. Sign up with your email
2. Wallet will be created automatically
3. Verify with: `SELECT wallet_address FROM users WHERE email = 'your-email';`

## 📝 All-in-One Script

If you prefer, run the complete setup script:

```bash
./scripts/setup-custodial-wallets.sh
```

This will:
- Check for TRADING_KEY_SECRET
- Delete test user
- Run migration
- Verify everything

## ⚠️ Important Notes

- The `TRADING_KEY_SECRET` must be the **same** on both local and VPS
- Never commit the secret to git (already in .gitignore)
- Keep a secure backup of the secret
- If you lose the secret, you cannot decrypt existing wallets

