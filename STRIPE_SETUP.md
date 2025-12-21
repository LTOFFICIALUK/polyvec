# Stripe Integration Setup Guide

## Environment Variables Required

Add these to your `.env.local` file:

```env
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_... # Use sk_live_... for production
STRIPE_PUBLISHABLE_KEY=pk_test_... # Use pk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_... # Get from Stripe Dashboard > Webhooks

# Payment Verification (generated secrets)
PAYMENT_VERIFICATION_SECRET=<generated-secret-below>
SYSTEM_TOKEN=<generated-secret-below>

# Base URL for redirects
NEXT_PUBLIC_BASE_URL=https://yourdomain.com # Or use VERCEL_URL in production
```

## Generated Secrets

Run these commands to generate secure tokens:

```bash
# Generate PAYMENT_VERIFICATION_SECRET
openssl rand -base64 32

# Generate SYSTEM_TOKEN
openssl rand -base64 32
```

Add the generated values to your `.env.local` file.

## Stripe Dashboard Setup

### 1. Create Products and Prices

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Click "Add product"
3. Name: "PolyTrade Pro"
4. Description: "Automated Trading Strategies - Trade 24/7 with TradingView signals"
5. Pricing: $49.00 USD, Recurring monthly
6. Save the Price ID (you'll use this later if you want to use Price IDs instead of price_data)

### 2. Set Up Webhooks

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the "Signing secret" (starts with `whsec_`) and add to `STRIPE_WEBHOOK_SECRET`

### 3. Test Mode vs Live Mode

- **Test Mode**: Use `sk_test_...` and `pk_test_...` keys for development
- **Live Mode**: Use `sk_live_...` and `pk_live_...` keys for production

## Testing

### Test Cards (Test Mode Only)

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

Use any future expiry date, any CVC, and any ZIP code.

### Test Webhook Events

1. Go to Stripe Dashboard > Webhooks
2. Click on your webhook endpoint
3. Click "Send test webhook"
4. Select event type (e.g., `checkout.session.completed`)
5. Review the webhook payload

## Security Notes

1. **Never commit `.env.local`** to version control
2. **Use different keys** for test and production
3. **Verify webhook signatures** - already implemented in the webhook handler
4. **Use HTTPS** in production for webhook endpoints
5. **Monitor webhook logs** in Stripe Dashboard for failed deliveries

## Database Migrations

Run the payments table migration:

```bash
# On VPS
ssh root@206.189.70.100
PGPASSWORD='your-password' psql -h localhost -U polytrade -d polytrade -f database/migrations/007_add_payments_table.sql
```

## How It Works

1. User clicks "Upgrade to Pro" in plan selection modal
2. Frontend calls `/api/stripe/create-checkout`
3. Server creates Stripe Checkout session with user metadata
4. User is redirected to Stripe Checkout page
5. After payment, Stripe sends webhook to `/api/stripe/webhook`
6. Webhook handler verifies signature and upgrades user plan
7. User is redirected back to app with success message

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook URL is correct in Stripe Dashboard
2. Verify webhook secret matches `STRIPE_WEBHOOK_SECRET`
3. Check server logs for webhook errors
4. Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

### Payment Succeeds But User Not Upgraded

1. Check webhook logs in Stripe Dashboard
2. Verify webhook handler is receiving events
3. Check database for payment records
4. Verify user_id is in session metadata

### Testing Locally

Use Stripe CLI to forward webhooks to localhost:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

This will give you a webhook signing secret to use in `.env.local` for local testing.

