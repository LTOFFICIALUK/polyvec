# How to Create a Test Promo Code in Stripe

## Quick Answer: Create a 100% Discount Coupon

You can create a promo code that gives 100% off for testing, so you won't be charged anything.

## Step-by-Step Instructions

### 1. Go to Stripe Dashboard
- Navigate to: https://dashboard.stripe.com/coupons
- Make sure you're in **Test mode** (toggle in top right)

### 2. Create a New Coupon
1. Click **"Create coupon"** button (top right)
2. Fill in the details:
   - **Name**: `TEST-100-OFF` (or any name you like)
   - **Type**: Select **"Percentage"**
   - **Percent off**: Enter `100`
   - **Duration**: Select **"Once"** (for one-time discount) or **"Forever"** (for recurring discount)
   - **Redemption limits**: Leave empty (unlimited uses)
3. Click **"Create coupon"**

### 3. Create a Promo Code from the Coupon
1. After creating the coupon, you'll see it in the list
2. Click on the coupon you just created
3. Click **"Create promotion code"** button
4. Fill in:
   - **Code**: `TEST100` (or any code you want - this is what users will enter)
   - **Customer restrictions**: Leave empty (no restrictions)
   - **Expiration**: Leave empty (never expires) or set a future date
5. Click **"Create promotion code"**

### 4. Use the Promo Code in Checkout
1. When you go through the checkout flow
2. Click **"Add promotion code"** button (visible in the checkout page)
3. Enter your promo code: `TEST100`
4. The discount will be applied
5. Total will show **$0.00**

## Alternative: Use Stripe Test Cards (No Real Charges)

**Important**: If you're in **Test mode**, Stripe test cards won't charge real money anyway!

You can use these test cards:
- **Card**: `4242 4242 4242 4242`
- **Expiry**: Any future date (e.g., `12/34`)
- **CVC**: Any 3 digits (e.g., `123`)
- **ZIP**: Any 5 digits (e.g., `12345`)

Even without a promo code, test cards in test mode won't charge real money.

## Switch to Test Mode

Make sure you're in **Test mode**:
1. Go to Stripe Dashboard
2. Look for the toggle in the top right
3. Switch to **"Test mode"** (should show "Test mode" or have a toggle)
4. Your test keys should start with `sk_test_` and `pk_test_`

## For Production Testing

If you want to test in **Live mode** (production) without being charged:
1. Create the 100% discount coupon in **Live mode**
2. Use the promo code during checkout
3. This will work with real cards but charge $0.00

## Verify Promo Code Works

After creating the promo code:
1. Go through checkout flow
2. Click "Add promotion code"
3. Enter your code
4. Verify the total changes to $0.00
5. Complete the checkout
6. Check that the webhook processes it correctly
7. Verify user is upgraded to Pro plan

## Notes

- **Test mode**: No real charges, even without promo code
- **Live mode**: Promo code needed to avoid real charges
- **Promo codes**: Can be used multiple times (unless you set limits)
- **Coupons**: Can be reused to create multiple promo codes

