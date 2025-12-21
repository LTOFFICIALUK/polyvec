# Next Steps to Complete Payment System

## 🎯 Critical Testing (Do This First)

### 1. Test Webhook Endpoint (10 minutes)
**Why**: This is the most critical part - it's how Stripe tells your server that a payment succeeded.

**Steps**:
1. **Deploy to production** (if not already deployed)
   - Push your latest code to trigger a Vercel deployment
   - Wait for deployment to complete

2. **Test webhook delivery**:
   - Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
   - Click on your webhook endpoint (`polyvec-payments`)
   - Click **"Send test webhook"** button
   - Select event: `checkout.session.completed`
   - Click **"Send test webhook"**
   - Check the response - should show `200 OK`

3. **Verify webhook is processed**:
   - Check Vercel logs (Dashboard > Your Project > Deployments > Latest > Functions Logs)
   - Look for log entries like: `[Stripe Webhook] Processing successful payment`
   - If you see errors, check the logs for details

4. **Check database** (optional but recommended):
   - Verify that a test payment record was created in the `payments` table
   - Check that the user's `plan_tier` was updated to `pro`

### 2. Test Full Checkout Flow (15 minutes)
**Why**: End-to-end test ensures the entire user journey works.

**Steps**:
1. **Use a test account** (or create one)
   - Make sure the account is on the `free` plan

2. **Start checkout**:
   - Go to your production site
   - Click "Choose Plan" (from header dropdown or profile page)
   - Click "Upgrade to Pro"
   - You should be redirected to Stripe Checkout

3. **Complete test payment**:
   - Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)
   - Click "Pay"

4. **Verify success**:
   - You should be redirected back to `/terminal?upgrade=success`
   - Should see success toast: "🎉 Payment successful! Your Pro plan is now active."
   - Check that you can now access `/strategies` page
   - Check your profile - should show "Pro" plan

5. **Verify webhook processed**:
   - Check Stripe Dashboard > Webhooks > Your endpoint
   - Should see a successful `checkout.session.completed` event
   - Check Vercel logs to confirm webhook was received

### 3. Test Subscription Management (5 minutes)
**Why**: Users need to be able to cancel/update their subscriptions.

**Steps**:
1. **Open subscription management**:
   - As a Pro user, open "Choose Plan" modal
   - Click "Manage Subscription" button
   - Should redirect to Stripe Customer Portal

2. **Test cancellation** (optional):
   - In Stripe Portal, you can cancel subscription
   - This should trigger a webhook event
   - User should be downgraded to `free` plan

## 🔍 Verification Checklist

After testing, verify:

- [ ] Webhook receives `checkout.session.completed` events
- [ ] User is upgraded to `pro` after successful payment
- [ ] User can access `/strategies` page after upgrade
- [ ] Success toast appears after payment
- [ ] User can open "Manage Subscription" portal
- [ ] Database shows payment record in `payments` table
- [ ] Database shows subscription record in `subscriptions` table
- [ ] User's `plan_tier` is updated in `users` table

## 🐛 Troubleshooting

### Webhook not receiving events?
- Check webhook URL is correct: `https://polyvec.com/api/stripe/webhook`
- Verify webhook is enabled in Stripe Dashboard
- Check Vercel logs for errors
- Verify `STRIPE_WEBHOOK_SECRET` is correct in Vercel

### Payment succeeds but user not upgraded?
- Check Vercel logs for webhook processing errors
- Verify webhook signature verification is working
- Check database connection is working
- Verify `user_id` is in session metadata

### Can't access strategies page after upgrade?
- Check `AuthContext` is refreshing user data
- Verify `user.plan_tier === 'pro'` in the database
- Check browser console for errors
- Try logging out and back in

## 📊 Monitoring

After going live, monitor:

1. **Stripe Dashboard**:
   - Payments > All payments
   - Webhooks > Your endpoint (check for failed deliveries)

2. **Vercel Logs**:
   - Check for webhook processing errors
   - Monitor API route performance

3. **Database**:
   - Check `payments` table for successful payments
   - Check `subscriptions` table for active subscriptions
   - Monitor `users` table for plan upgrades

## ✅ Once Testing is Complete

After all tests pass:
- ✅ Payment system is production-ready
- ✅ Users can upgrade to Pro
- ✅ Subscriptions are managed automatically
- ✅ Webhooks are processing correctly

## 🚀 Optional Enhancements (Later)

These can be added after the system is working:
- Email notifications (welcome, payment confirmations)
- Subscription status display (end date, renewal date)
- Payment history page
- Admin dashboard for managing subscriptions

