# Environment Setup for Custodial Wallets

## Existing Secret

Using your existing TRADING_KEY_SECRET:

```
TRADING_KEY_SECRET=a18192d1f072a905a934c3c6f486fe62aadcfc0abc18fdc1098a62d27257d1db
```

## Local Development (.env.local)

Add this to your `.env.local` file in the project root:

```bash
TRADING_KEY_SECRET=442767b0ff8db8909dfe8de0e1a747bc5ef6290cd3cd4492bbe42554becb5f68
```

**Important:** This file should already be in `.gitignore` - never commit secrets to git!

## VPS/Production Environment

Set this environment variable on your VPS:

```bash
# SSH into your VPS
ssh root@206.189.70.100

# Add to environment (choose one method):

# Method 1: Add to .bashrc or .profile
echo 'export TRADING_KEY_SECRET=442767b0ff8db8909dfe8de0e1a747bc5ef6290cd3cd4492bbe42554becb5f68' >> ~/.bashrc
source ~/.bashrc

# Method 2: Add to systemd service (if running as service)
# Edit your service file and add:
# Environment="TRADING_KEY_SECRET=442767b0ff8db8909dfe8de0e1a747bc5ef6290cd3cd4492bbe42554becb5f68"

# Method 3: Add to .env file in your app directory
echo 'TRADING_KEY_SECRET=442767b0ff8db8909dfe8de0e1a747bc5ef6290cd3cd4492bbe42554becb5f68' >> /path/to/your/app/.env
```

## Verify Setup

After setting the environment variable, restart your application and test:

1. Sign up with a new email
2. Check database: `SELECT wallet_address FROM users WHERE email = 'your-email';`
3. Should see a wallet address (0x...)

## Security Notes

- ⚠️ **NEVER** commit this secret to git
- ⚠️ **NEVER** share this secret publicly
- ⚠️ Keep backups of this secret in a secure password manager
- ✅ Use the same secret on both local and VPS for compatibility
- ✅ The secret is used to encrypt/decrypt private keys - losing it means losing access to wallets

