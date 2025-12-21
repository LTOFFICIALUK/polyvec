# How to Send a Test Webhook from Stripe Dashboard

## Step-by-Step Instructions

### 1. Go to Stripe Dashboard (Not Workbench)
- Open: https://dashboard.stripe.com/webhooks
- Make sure you're logged into your Stripe account
- **Important**: This is different from the Workbench/PolyVec interface you're currently viewing

### 2. Find Your Webhook Endpoint
- You should see a list of webhook endpoints
- Look for: `polyvec-payments` or `https://polyvec.com/api/stripe/webhook`
- Click on it to open the details

### 3. Send Test Webhook
Once you're on the webhook details page:

**Option A: From the Webhook Details Page**
- Look for a button labeled **"Send test webhook"** or **"Send test event"**
- It's usually at the top right of the page
- Click it

**Option B: From the Event Deliveries Tab**
- Click the **"Event deliveries"** tab
- Look for a **"Send test webhook"** button (usually top right)
- Click it

### 4. Select Event Type
- A modal/popup will appear
- Select: `checkout.session.completed`
- Click **"Send test webhook"** or **"Send"**

### 5. Verify Delivery
- Go back to the **"Event deliveries"** tab
- You should see a new entry appear
- Status should be `200 OK` (green) if successful
- Click on it to see the full request/response details

## Alternative: If You Don't See "Send Test Webhook" Button

If you can't find the button, try this:

1. **Go to Stripe Dashboard > Developers > Webhooks**
2. Click on your webhook endpoint
3. Look for **"Send test webhook"** in the top right
4. Or try: **"..." menu** (three dots) → **"Send test webhook"**

## Visual Guide

The button is typically located:
- **Top right** of the webhook details page
- **Above** the "Event deliveries" list
- Sometimes in a **"..." menu** (three dots)

## Troubleshooting

**Still can't find it?**
- Make sure you're in **Stripe Dashboard** (dashboard.stripe.com), not Workbench
- Try refreshing the page
- Check that you have the correct permissions in your Stripe account
- The button might be labeled differently: "Send test event", "Test webhook", or "Send sample event"

## What to Look For After Sending

1. **In Stripe Dashboard:**
   - New entry in "Event deliveries" tab
   - Status: `200 OK` (success) or error code
   - Click entry to see request/response details

2. **In Vercel Logs:**
   - Go to Vercel Dashboard > Your Project > Deployments > Latest
   - Click "Functions" or "Logs"
   - Look for: `[Stripe Webhook] Processing successful payment`

3. **In Your Database:**
   - Check `payments` table for new record
   - Check `users` table for plan_tier update

