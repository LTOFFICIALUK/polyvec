# Manual Setup Steps - Run These Commands

Since the scripts require database password input, here are the exact commands to run:

## ✅ Step 1: Already Done
- ✅ TRADING_KEY_SECRET added to .env.local
- ✅ Scripts created and updated with correct secret

## 🔧 Step 2: Delete Test User

Run this on your VPS or locally (if you have psql access):

```bash
psql -h 206.189.70.100 -U polytrade -d polytrade
```

Then execute:
```sql
DELETE FROM users WHERE email = 'everythingsimpleinc1@gmail.com';

-- Verify
SELECT COUNT(*) FROM users WHERE email = 'everythingsimpleinc1@gmail.com';
-- Should return: 0
```

Exit psql: `\q`

## 🔧 Step 3: Run Migration

```bash
psql -h 206.189.70.100 -U polytrade -d polytrade -f database/migrations/005_add_custodial_wallets.sql
```

Or if you're already in psql:
```sql
\i database/migrations/005_add_custodial_wallets.sql
```

## 🔧 Step 4: Set Secret on VPS

SSH into your VPS:
```bash
ssh root@206.189.70.100
```

Then run ONE of these options:

### Option A: Add to .bashrc (Recommended - Persistent)
```bash
echo 'export TRADING_KEY_SECRET=<YOUR_TRADING_KEY_SECRET>' >> ~/.bashrc
source ~/.bashrc
```

### Option B: Export for current session
```bash
export TRADING_KEY_SECRET=<YOUR_TRADING_KEY_SECRET>
```

### Option C: Add to systemd service (if using systemd)
Edit your service file:
```bash
nano /etc/systemd/system/your-app.service
```

Add this line in the `[Service]` section:
```
Environment="TRADING_KEY_SECRET=<YOUR_TRADING_KEY_SECRET>"
```

Then reload:
```bash
systemctl daemon-reload
systemctl restart your-app
```

## ✅ Verification

After completing all steps:

1. **Check migration:**
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'users' AND column_name LIKE '%wallet%';
   ```
   Should show: wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt

2. **Check tables:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('user_balances', 'deposits');
   ```
   Should show both tables.

3. **Verify secret on VPS:**
   ```bash
   echo $TRADING_KEY_SECRET
   ```
   Should output: `<YOUR_TRADING_KEY_SECRET>`

## 🎯 Ready to Test

Once all steps are complete:
1. Restart your Next.js app (if running)
2. Sign up with your email
3. Wallet will be created automatically
4. Verify: `SELECT wallet_address FROM users WHERE email = 'your-email';`

