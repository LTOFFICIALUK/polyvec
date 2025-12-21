# Environment Variables Needed for Plan System

## Add These to Your `.env.local` File

```env
# ============================================
# STRIPE PAYMENT INTEGRATION
# ============================================
# Get these from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_... # Use sk_live_... for production
STRIPE_PUBLISHABLE_KEY=pk_test_... # Use pk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_... # Get from Stripe Dashboard > Webhooks > Your endpoint

# ============================================
# PAYMENT VERIFICATION SECRETS
# ============================================
# Generated secure tokens (already generated for you):
PAYMENT_VERIFICATION_SECRET=xEM9TdYJP/jNfdv5FikRolnayYlOrtTXgilIoRpIEIU=
SYSTEM_TOKEN=SWpLHR0b1vn4n48W97NwsOzSFTlhhLyGoDHC6xwUVgA=

# ============================================
# BASE URL (for Stripe redirects)
# ============================================
# For local development, you can omit this (defaults to localhost:3000)
# For production, set to your domain:
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
# Or Vercel will automatically set VERCEL_URL in production
```

## Steps to Complete Setup

1. **Install Stripe package** (if not already installed):
   ```bash
   npm install stripe
   ```

2. **Get Stripe API Keys**:
   - Go to https://dashboard.stripe.com/apikeys
   - Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)
   - Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - Add them to `.env.local`

3. **Set Up Stripe Webhook**:
   - Go to https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - URL: `https://yourdomain.com/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the **Signing secret** (starts with `whsec_`)
   - Add to `STRIPE_WEBHOOK_SECRET` in `.env.local`

4. **Run Database Migration** (for payments table):
   ```bash
   # On VPS
   ssh root@206.189.70.100
   PGPASSWORD='6Te4WfZi*V/r' psql -h localhost -U polytrade -d polytrade -f database/migrations/007_add_payments_table.sql
   ```

5. **Test the Integration**:
   - Use Stripe test cards (see STRIPE_SETUP.md)
   - Test webhook delivery in Stripe Dashboard

## Security Notes

- ✅ **PAYMENT_VERIFICATION_SECRET** and **SYSTEM_TOKEN** are already generated and secure
- ✅ Never commit `.env.local` to version control
- ✅ Use test keys (`sk_test_`, `pk_test_`) for development
- ✅ Use live keys (`sk_live_`, `pk_live_`) only in production
- ✅ Webhook signature verification is already implemented

## What's Already Done

✅ Secure plan upgrade endpoint (`/api/user/plan/upgrade`)  
✅ Secure plan downgrade endpoint (`/api/user/plan/downgrade`)  
✅ Stripe webhook handler (`/api/stripe/webhook`)  
✅ Stripe checkout creation (`/api/stripe/create-checkout`)  
✅ Frontend integration in plan selection modal  
✅ Database migration files created  
✅ Payment verification tokens generated  

## Next Steps

1. Add the environment variables above to `.env.local`
2. Install Stripe package: `npm install stripe`
3. Set up Stripe webhook in dashboard
4. Run database migration on VPS
5. Test with Stripe test cards

See `STRIPE_SETUP.md` for detailed setup instructions.

