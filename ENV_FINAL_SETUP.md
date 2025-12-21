# Final Environment Variables Setup

## ✅ Your Complete `.env.local` Configuration

Add/update these in your `.env.local` file:

```env
# ============================================
# STRIPE PAYMENT INTEGRATION
# ============================================
STRIPE_SECRET_KEY=sk_live_... # Your Stripe secret key from dashboard
STRIPE_PUBLISHABLE_KEY=pk_live_... # Your Stripe publishable key from dashboard
STRIPE_WEBHOOK_SECRET=whsec_... # Your webhook secret from Stripe dashboard

# ============================================
# PAYMENT VERIFICATION SECRETS
# ============================================
PAYMENT_VERIFICATION_SECRET=xEM9TdYJP/jNfdv5FikRolnayYlOrtTXgilIoRpIEIU=
SYSTEM_TOKEN=SWpLHR0b1vn4n48W97NwsOzSFTlhhLyGoDHC6xwUVgA=

# ============================================
# BASE URL (for Stripe redirects)
# ============================================
NEXT_PUBLIC_BASE_URL=https://polyvec.com
```

## ✅ What's Configured

- **Stripe Keys**: ✅ Added
- **Webhook Secret**: ✅ `whsec_7efEeD8eauQwebiM0A5TTuGldlPeVSpO`
- **Webhook URL**: ✅ `https://polyvec.com/api/stripe/webhook`
- **Base URL**: ✅ `https://polyvec.com`
- **Security Tokens**: ✅ Generated and ready

## 🎯 Next Steps

1. **Add all variables to `.env.local`** (copy the block above)

2. **Run database migration** (for payments table):
   ```bash
   ssh root@206.189.70.100
   PGPASSWORD='6Te4WfZi*V/r' psql -h localhost -U polytrade -d polytrade -f database/migrations/007_add_payments_table.sql
   ```

3. **Deploy to production** (if not already deployed)

4. **Test the webhook**:
   - Go to Stripe Dashboard > Webhooks > polyvec-payments
   - Click "Send test webhook"
   - Select `checkout.session.completed`
   - Check your server logs to see if it's received

5. **Test a real payment**:
   - Try upgrading a test account
   - Use a test card: `4242 4242 4242 4242`
   - Verify the user gets upgraded automatically

## 🔒 Security Checklist

- ✅ Webhook signature verification enabled
- ✅ Payment verification tokens set
- ✅ System tokens for automated operations
- ✅ Direct plan changes disabled (only through payments)
- ✅ All sensitive keys in `.env.local` (not committed)

## 📝 Webhook Details

- **Name**: polyvec-payments
- **Destination ID**: we_1SgpbkH3Qk6brCbgMg9BLdpV
- **URL**: https://polyvec.com/api/stripe/webhook
- **Events**: 
  - checkout.session.completed
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_failed

Everything is ready! Just add the variables to `.env.local` and you're good to go! 🚀

