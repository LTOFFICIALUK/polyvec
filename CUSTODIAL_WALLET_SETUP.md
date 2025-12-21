# Custodial Wallet System Setup

This document describes the custodial wallet system that allows users to trade without connecting their own wallets.

## Overview

When a user creates an account, the platform automatically:
1. Generates a unique Ethereum wallet for the user
2. Encrypts and stores the private key securely in the database
3. Allows users to deposit USDC.e and POL for trading
4. Enables fast trading execution without wallet confirmations

## Architecture

### Database Schema

The system adds the following to the `users` table:
- `wallet_address` - The user's custodial wallet address
- `encrypted_private_key` - Encrypted private key (AES-256-GCM)
- `key_iv`, `key_auth_tag`, `key_salt` - Encryption components
- `wallet_created_at` - Timestamp when wallet was created

New tables:
- `user_balances` - Tracks USDC.e and POL balances per user
- `deposits` - History of all deposits

### Security

- Private keys are encrypted using AES-256-GCM
- Each user's key is encrypted with a unique derived key (PBKDF2)
- Master secret stored in `TRADING_KEY_SECRET` environment variable
- Keys are only decrypted when needed for signing transactions

## Setup Instructions

### 1. Environment Variables

Add to your `.env.local` and VPS environment:

```bash
# Use the same secret as ws-service for compatibility
TRADING_KEY_SECRET=your-very-long-random-secret-at-least-32-characters
# OR use a separate secret for Next.js app
WALLET_ENCRYPTION_SECRET=your-very-long-random-secret-at-least-32-characters
```

**Generate a secure secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Run Database Migration

On your VPS, run the migration:

```bash
psql -h 206.189.70.100 -U polytrade -d polytrade -f database/migrations/005_add_custodial_wallets.sql
```

Or manually execute the SQL in `database/migrations/005_add_custodial_wallets.sql`

### 3. Verify Setup

After signup, check that:
- User has a `wallet_address` in the database
- `user_balances` record is created with 0 balances
- Private key is encrypted (not visible in plaintext)

## User Flow

### 1. Account Creation
- User signs up with email/password
- System generates wallet automatically
- Wallet address returned to client (private key never exposed)

### 2. Depositing Funds
- User sends USDC.e or POL to their custodial wallet address
- System monitors blockchain for deposits
- Balances updated automatically

### 3. Trading
- User places order through UI
- System uses custodial wallet private key to sign
- No wallet confirmation needed (faster execution)
- Balances deducted after successful trade

## API Endpoints

### Get User Wallet
```
GET /api/user/wallet
Returns: { wallet_address: string }
```

### Get Balances
```
GET /api/user/balances
Returns: { usdc_balance: number, pol_balance: number }
```

### Deposit (Future)
```
POST /api/deposits/initiate
Body: { token_type: 'USDC' | 'POL', amount: number }
Returns: { deposit_address: string, qr_code: string }
```

## Security Considerations

1. **Private Key Storage**: Never log or expose private keys
2. **Encryption**: Always encrypt before storage
3. **Access Control**: Only authenticated users can access their wallet
4. **Audit Logging**: All wallet operations should be logged
5. **Backup**: Ensure database backups include encrypted keys

## Future Enhancements

- Automatic deposit detection via blockchain monitoring
- Withdrawal functionality
- Trading fee collection to platform wallet
- Multi-signature support for additional security

