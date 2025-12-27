# Platform Fee Collection Implementation

## Overview
This implementation adds a 2.5% platform fee collection system for all BUY trades on the platform. The fee is collected after successful trade execution.

## How It Works

### Trade Flow with Fees

1. **User places BUY order** (e.g., $10 worth of shares)
2. **Pre-trade validation**: System checks if user has enough balance for:
   - Trade amount: $10.00
   - Platform fee (2.5%): $0.25
   - **Total needed**: $10.25
3. **If insufficient balance**: User sees clear error message:
   ```
   Insufficient balance for trade and fees. You need $10.25 ($10.00 for trade + $0.25 fee), 
   but you only have $X.XX. Please deposit $Y.YY more.
   ```
4. **If sufficient balance**: Trade proceeds normally
5. **After successful trade**: Platform fee ($0.25) is automatically transferred to platform fee wallet
6. **Fee collection is non-blocking**: If fee transfer fails, trade still succeeds (logged for admin review)

### SELL Orders
- SELL orders do NOT charge platform fees (user is selling shares, not spending USDC)
- Only BUY orders are subject to the 2.5% fee

## Configuration Required

### Environment Variable
Add the following to your `.env.local` file:

```bash
PLATFORM_FEE_WALLET_ADDRESS=0x97e656303F2e61cc87c9C94557e41c65c5c30691
```

**Important**: 
- This wallet address is configured and will receive all platform fees
- This wallet should be properly secured
- Fees are automatically collected after successful BUY trades

## Files Modified/Created

### New Files
1. **`lib/trade-fees.ts`** - Fee calculation utilities
   - `calculatePlatformFee()` - Calculates 2.5% fee
   - `calculateTotalWithFee()` - Calculates total needed (trade + fee)
   - `getPlatformFeeWallet()` - Gets platform fee wallet from env

2. **`app/api/trade/collect-fee/route.ts`** - Fee collection endpoint
   - Handles USDC.e transfer from user wallet to platform fee wallet
   - Validates balance before transferring
   - Returns transaction hash on success

### Modified Files
1. **`app/api/trade/place-order/route.ts`**
   - Added pre-trade balance validation (checks trade + fee)
   - Returns `INSUFFICIENT_BALANCE_FOR_FEES` error with detailed breakdown
   - Logs fee collection info (actual collection happens in frontend)

2. **`components/TradingPanel.tsx`**
   - Calculates and displays fee information before placing order
   - Shows total amount needed (trade + fee) in order summary
   - Handles `INSUFFICIENT_BALANCE_FOR_FEES` error with user-friendly message
   - Calls `/api/trade/collect-fee` after successful BUY orders
   - Fee collection errors are non-blocking (trade already succeeded)

## Error Messages

### Insufficient Balance for Fees
```
Insufficient balance for trade and fees. You need $10.25 ($10.00 for trade + $0.25 fee), 
but you only have $9.50. Please deposit $0.75 more.
```

### Fee Collection Failed (Non-blocking)
- Trade still succeeds
- Error is logged server-side for admin review
- User is not notified (to avoid confusion)

## Testing Checklist

- [ ] Set `PLATFORM_FEE_WALLET_ADDRESS` in environment
- [ ] Test BUY order with sufficient balance (should succeed + collect fee)
- [ ] Test BUY order with insufficient balance (should show clear error)
- [ ] Test BUY order where balance covers trade but not fee (should show fee error)
- [ ] Test SELL order (should not charge fee)
- [ ] Verify fee is transferred to platform wallet after successful trade
- [ ] Check transaction hash is logged correctly

## Fee Calculation Examples

| Trade Amount | Fee (2.5%) | Total Needed |
|-------------|------------|--------------|
| $10.00      | $0.25      | $10.25       |
| $100.00     | $2.50      | $102.50      |
| $1,000.00   | $25.00     | $1,025.00    |

## Security Considerations

1. **Fee wallet security**: Platform fee wallet should be:
   - Stored securely (hardware wallet recommended)
   - Monitored regularly
   - Backed up properly

2. **Balance validation**: Pre-trade checks prevent:
   - Failed trades due to insufficient funds
   - User confusion about why trades fail

3. **Non-blocking fee collection**: 
   - Trade succeeds even if fee collection fails
   - Failed fee collections are logged for manual review
   - Prevents user frustration from fee collection issues

## Future Enhancements

- [ ] Admin dashboard to view fee collection statistics
- [ ] Automatic retry mechanism for failed fee collections
- [ ] Fee collection history in user profile
- [ ] Configurable fee rate (currently hardcoded at 2.5%)
- [ ] Fee collection for SELL orders (if needed)

