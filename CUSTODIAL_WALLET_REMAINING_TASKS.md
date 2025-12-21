# Custodial Wallet System - Remaining Tasks

## ✅ Completed

1. ✅ Database migration for custodial wallets
2. ✅ Wallet generation utilities
3. ✅ Encryption/decryption system (AES-256-GCM)
4. ✅ Automatic wallet creation on signup
5. ✅ API endpoints for wallet address and balances
6. ✅ Database schema for balances and deposits

## 🔄 In Progress / Remaining

### 1. Deposit System (High Priority)

**What's needed:**
- Blockchain monitoring service to detect deposits
- Deposit initiation endpoint
- Automatic balance updates when deposits are detected

**Files to create:**
- `app/api/deposits/initiate/route.ts` - Generate deposit addresses/QR codes
- `lib/blockchain-monitor.ts` - Monitor Polygon for USDC.e and POL deposits
- Background job/service to check for new deposits and update balances

**Implementation approach:**
```typescript
// Monitor deposits by:
// 1. Polling Polygon RPC for recent transactions to user wallets
// 2. Filtering for USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) and POL transfers
// 3. Updating user_balances table when deposits detected
// 4. Creating deposit records in deposits table
```

### 2. Balance Tracking System (High Priority)

**What's needed:**
- Real-time balance updates after trades
- Balance synchronization with blockchain
- Balance display in UI

**Files to update:**
- `app/api/user/balances/route.ts` - Already created, may need blockchain sync
- `components/BalanceDisplay.tsx` - New component to show balances
- Update `components/Header.tsx` to show custodial wallet balances

**Implementation approach:**
```typescript
// After each trade:
// 1. Calculate new balances based on trade execution
// 2. Update user_balances table
// 3. Optionally sync with blockchain for verification
```

### 3. Trading Flow Update (Critical)

**What's needed:**
- Replace Phantom wallet connection with custodial wallet
- Use stored private key for signing orders
- Remove wallet confirmation prompts (faster execution)

**Files to update:**
- `components/TradingPanel.tsx` - Use custodial wallet instead of Phantom
- `lib/polymarket-order-signing.ts` - Add function to sign with private key
- `app/api/trade/place-order/route.ts` - Use custodial wallet for signing

**Implementation approach:**
```typescript
// New flow:
// 1. User places order through UI
// 2. Backend retrieves user's custodial wallet private key
// 3. Backend signs order using private key (no user confirmation)
// 4. Submit signed order to Polymarket
// 5. Update balances after successful trade
```

### 4. UI Updates (Medium Priority)

**What's needed:**
- Remove "Connect Wallet" button (replaced with custodial wallet)
- Show custodial wallet address in user profile
- Deposit interface for sending USDC.e/POL
- Balance display components

**Files to create/update:**
- `components/CustodialWalletInfo.tsx` - Display wallet address and balances
- `components/DepositModal.tsx` - Show deposit address and QR code
- `app/profile/page.tsx` - User profile with wallet info
- Update `components/Header.tsx` - Show custodial balances

### 5. Security & Monitoring (Medium Priority)

**What's needed:**
- Audit logging for wallet operations
- Rate limiting on trading endpoints
- Monitoring for suspicious activity
- Backup/restore procedures for encrypted keys

**Files to create:**
- `lib/wallet-audit.ts` - Log all wallet operations
- `lib/rate-limiter.ts` - Prevent abuse
- Monitoring dashboard/endpoints

### 6. Testing & Validation (High Priority)

**What's needed:**
- Test wallet generation on signup
- Test deposit detection
- Test trading with custodial wallet
- Test balance updates

**Test scenarios:**
1. Sign up new user → verify wallet created
2. Deposit USDC.e → verify balance updated
3. Place trade → verify uses custodial wallet
4. Check balances → verify correct amounts

## 🚀 Quick Start for Testing

### Step 1: Delete Test User
```bash
# Option 1: Run SQL script on VPS
psql -h 206.189.70.100 -U polytrade -d polytrade -f scripts/delete-test-user.sql

# Option 2: Use shell script
./scripts/delete-test-user.sh
```

### Step 2: Set Environment Variable
```bash
# On VPS and locally
export TRADING_KEY_SECRET="your-32-character-secret-here"
# Or add to .env.local
```

### Step 3: Run Migration (if not done)
```bash
psql -h 206.189.70.100 -U polytrade -d polytrade -f database/migrations/005_add_custodial_wallets.sql
```

### Step 4: Test Signup
1. Sign up with email/password
2. Check database: `SELECT wallet_address FROM users WHERE email = 'your-email@example.com'`
3. Verify wallet address exists and is unique

## 📋 Priority Order

1. **Trading Flow Update** - Most critical for functionality
2. **Deposit System** - Needed for users to fund accounts
3. **Balance Tracking** - Needed to show user funds
4. **UI Updates** - Improve user experience
5. **Security & Monitoring** - Production readiness

## 🔐 Security Checklist

- [ ] TRADING_KEY_SECRET is set and secure (32+ characters)
- [ ] Database backups include encrypted keys
- [ ] Private keys never logged or exposed
- [ ] Rate limiting on sensitive endpoints
- [ ] Audit logging for all wallet operations
- [ ] Access control verified (users can only access their own wallet)

