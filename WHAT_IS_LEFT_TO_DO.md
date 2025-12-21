# What's Left To Do

## 🎯 Critical - Must Complete

### 1. Test Payment System in Production ⚠️ **NEXT STEP**
**Status**: Needs Testing
**Time**: 15-30 minutes

**What to do**:
1. **Test webhook endpoint**:
   - Go to Stripe Dashboard > Webhooks > `polyvec-payments`
   - Click "Send test webhook"
   - Select `checkout.session.completed`
   - Verify it returns `200 OK`
   - Check Vercel logs to confirm it was processed

2. **Test full checkout flow**:
   - Use a test account (or create one)
   - Click "Upgrade to Pro" → Stripe Checkout
   - Use test card: `4242 4242 4242 4242`
   - Verify redirect to `/terminal?upgrade=success`
   - Verify user is upgraded to Pro
   - Verify access to `/strategies` page

3. **Test subscription cancellation**:
   - As Pro user, click "Manage Subscription"
   - Cancel subscription in Stripe Portal
   - Verify user is downgraded to Free immediately
   - Check database to confirm plan_tier updated

**Why this is critical**: The payment system is built but needs verification that it works end-to-end in production.

---

## 🟡 Important - Should Do Soon

### 2. Handle Failed Payments Better
**Status**: Partially Implemented
**Time**: 1-2 hours

**Current state**: Failed payments are logged but users aren't notified

**What to add**:
- Show in-app notification when payment fails
- Auto-downgrade after 3 failed payment attempts
- Send email notification (if email system is set up)

**Files to update**:
- `app/api/stripe/webhook/route.ts` - Enhance `invoice.payment_failed` handler

---

### 3. Subscription Status Display
**Status**: Missing
**Time**: 1-2 hours

**What to add**:
- Show subscription end date in plan modal
- Show "Cancels on [date]" if subscription is set to cancel
- Show renewal date for active subscriptions

**Files to update**:
- `components/PlanSelectionModal.tsx` - Fetch and display subscription details
- `app/api/user/subscription/route.ts` - New endpoint to get subscription details

---

## 🟢 Nice to Have - Can Do Later

### 4. Email Notifications
**Status**: Not Implemented
**Time**: 3-4 hours

**What to add**:
- Welcome email when user upgrades to Pro
- Payment confirmation email
- Reminder before subscription renews
- Notification if payment fails

**Requires**: Email service setup (SendGrid, Resend, etc.)

---

### 5. Payment History Page
**Status**: Missing
**Time**: 2-3 hours

**What to create**:
- `/payments` or `/billing` page
- Show all payment transactions
- Show subscription history
- Download invoices (if using Stripe invoices)

**Files to create**:
- `app/payments/page.tsx` - Payment history page
- `app/api/user/payments/route.ts` - Get user's payment history

---

### 6. Admin Dashboard
**Status**: Not Implemented
**Time**: 4-6 hours

**What to create**:
- View all subscriptions
- View payment history
- Manually upgrade/downgrade users
- View revenue metrics

**Files to create**:
- `app/admin/page.tsx` - Admin dashboard
- `app/api/admin/*` - Admin API endpoints

---

## ✅ Already Complete

- ✅ Payment system core functionality
- ✅ Stripe integration (checkout, webhooks, portal)
- ✅ Plan selection modal
- ✅ Access control for strategies page
- ✅ Subscription cancellation handling
- ✅ Database migrations
- ✅ Environment variables configured
- ✅ Security (secrets removed from codebase)
- ✅ Test scripts cleaned up

---

## 📊 Summary

**Critical (Do Now)**:
- [ ] Test payment system in production (15-30 min)

**Important (Do Soon)**:
- [ ] Better failed payment handling (1-2 hours)
- [ ] Subscription status display (1-2 hours)

**Nice to Have (Do Later)**:
- [ ] Email notifications (3-4 hours)
- [ ] Payment history page (2-3 hours)
- [ ] Admin dashboard (4-6 hours)

**Total Critical + Important**: ~2-3 hours of work
**Total Nice to Have**: ~9-13 hours of work

---

## 🚀 Recommended Next Steps

1. **Test the payment system** (15-30 min) - This is the most important
2. **Add subscription status display** (1-2 hours) - Improves UX
3. **Enhance failed payment handling** (1-2 hours) - Better user experience

Everything else can wait until you have real users and feedback.

