# Stripe Quick Setup Guide

## Step 1: Add Your Stripe Keys to `.env.local`

I'll help you add these. You've already provided:
- ✅ Publishable Key: Get from Stripe Dashboard
- ✅ Secret Key: Get from Stripe Dashboard

## Step 2: Set Up Stripe Webhook (IMPORTANT!)

### What is a Webhook?
A webhook is how Stripe tells your server "Hey, someone just paid!" so your server can automatically upgrade the user.

### How to Set It Up:

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com/webhooks
2. **Click "Add endpoint"** (top right)
3. **Enter your webhook URL**:
   - If you're on Vercel: `https://your-vercel-domain.vercel.app/api/stripe/webhook`
   - If you have a custom domain: `https://yourdomain.com/api/stripe/webhook`
   - **What's your production domain?** (e.g., `polytrade.com` or `your-app.vercel.app`)
4. **Select these events** (click "Select events"):
   - ✅ `checkout.session.completed` - When payment succeeds
   - ✅ `customer.subscription.updated` - When subscription changes
   - ✅ `customer.subscription.deleted` - When subscription cancelled
   - ✅ `invoice.payment_failed` - When payment fails
5. **Click "Add endpoint"**
6. **Copy the "Signing secret"**:
   - Click on your newly created webhook endpoint
   - Click "Reveal" next to "Signing secret"
   - Copy the secret (starts with `whsec_`)
   - Add it to `.env.local` as `STRIPE_WEBHOOK_SECRET`

## Step 3: Understanding the Other Variables

### PAYMENT_VERIFICATION_SECRET
- **What it is**: A secret token to verify payments are legitimate
- **Generate with**: `openssl rand -base64 32`
- **What it does**: Prevents fake payment requests from upgrading users
- **Just add it to `.env.local`** - no setup needed!

### SYSTEM_TOKEN
- **What it is**: A secret token for system/admin operations
- **Generate with**: `openssl rand -base64 32`
- **What it does**: Allows automated system processes to downgrade users (e.g., when subscription expires)
- **Just add it to `.env.local`** - no setup needed!

### NEXT_PUBLIC_BASE_URL
- **What it is**: Your website's URL (where users get redirected after payment)
- **What to set**:
  - **If on Vercel**: You can leave this empty - Vercel auto-sets `VERCEL_URL`
  - **If custom domain**: Set to `https://yourdomain.com`
  - **For local testing**: Leave empty (defaults to `http://localhost:3000`)
- **Example**: `NEXT_PUBLIC_BASE_URL=https://polytrade.com`

## Step 4: Complete `.env.local` File

Add all of these to your `.env.local`:

```env
# Stripe Keys (get from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_live_... # Your Stripe secret key
STRIPE_PUBLISHABLE_KEY=pk_live_... # Your Stripe publishable key
STRIPE_WEBHOOK_SECRET=whsec_... # Get this from Stripe Dashboard after setting up webhook

# Generated Security Tokens (generate with: openssl rand -base64 32)
PAYMENT_VERIFICATION_SECRET=<generate-with-openssl-rand-base64-32>
SYSTEM_TOKEN=<generate-with-openssl-rand-base64-32>

# Base URL (optional - set if you have a custom domain)
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

## Step 5: Test It!

1. Deploy your app to production
2. Try upgrading a test account
3. Check Stripe Dashboard > Webhooks to see if events are being received
4. Check your server logs to see if webhooks are being processed

## Need Help?

**What's your production domain?** I can help you set the exact webhook URL and base URL.

