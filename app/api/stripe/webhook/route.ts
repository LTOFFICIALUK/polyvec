import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/lib/db'
import Stripe from 'stripe'
import {
  sendWelcomeProEmail,
  sendPaymentConfirmationEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
} from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

// Initialize Stripe (lazy initialization to avoid build-time errors)
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
  })
}

const getWebhookSecret = () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }
  return secret
}

/**
 * POST /api/stripe/webhook
 * 
 * Handles Stripe webhook events for payment processing
 * SECURITY: Verifies Stripe signature before processing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      console.error('[Stripe Webhook] Missing signature')
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      )
    }

    // Get webhook secret
    const webhookSecret = getWebhookSecret()

    // Verify webhook signature
    let event: Stripe.Event
    try {
      const stripe = getStripe()
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err: any) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message)
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err.message}` },
        { status: 400 }
      )
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        // Get customer email and metadata
        const customerEmail = session.customer_email || session.customer_details?.email
        const planTier = session.metadata?.plan_tier || 'pro'
        const userId = session.metadata?.user_id

        if (!userId) {
          console.error('[Stripe Webhook] Missing user_id in session metadata:', session.id)
          return NextResponse.json(
            { error: 'Missing user_id' },
            { status: 400 }
          )
        }

        // Verify payment was successful
        if (session.payment_status !== 'paid') {
          console.warn('[Stripe Webhook] Payment not completed:', session.id, session.payment_status)
          return NextResponse.json({ received: true })
        }

        // Get payment intent details
        const paymentIntentId = session.payment_intent as string
        const amount = session.amount_total || 0 // Amount in cents

        console.log('[Stripe Webhook] Processing successful payment:', {
          sessionId: session.id,
          userId,
          planTier,
          amount,
          paymentIntentId,
        })

        // Update user's plan
        const db = getDbPool()
        
        // Update plan
        await db.query(
          `UPDATE users 
           SET plan_tier = $1, 
               plan_updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [planTier, parseInt(userId)]
        )

        // Record payment
        await db.query(
          `INSERT INTO payments (
            user_id, 
            plan_tier, 
            amount, 
            currency, 
            payment_intent_id, 
            payment_method, 
            status, 
            reason,
            completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
          ON CONFLICT (payment_intent_id) DO NOTHING`,
          [
            parseInt(userId),
            planTier,
            amount,
            session.currency?.toUpperCase() || 'USD',
            paymentIntentId,
            'stripe',
            'completed',
            'upgrade',
          ]
        )

        // Create or update subscription if it's a recurring payment
        if (session.subscription) {
          const stripe = getStripe()
          const subscriptionId = typeof session.subscription === 'string' 
            ? session.subscription 
            : (session.subscription as any).id
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          
          // Type assertion for subscription properties (Stripe types can be inconsistent)
          const subData = subscription as any
          
          // Convert Stripe timestamps to Date objects, only if valid
          const periodStart = subData.current_period_start && subData.current_period_start > 0
            ? new Date(subData.current_period_start * 1000)
            : null
          const periodEnd = subData.current_period_end && subData.current_period_end > 0
            ? new Date(subData.current_period_end * 1000)
            : null

          await db.query(
            `INSERT INTO subscriptions (
              user_id,
              plan_tier,
              subscription_id,
              payment_method,
              status,
              current_period_start,
              current_period_end,
              cancel_at_period_end
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (subscription_id) 
            DO UPDATE SET
              status = EXCLUDED.status,
              current_period_start = EXCLUDED.current_period_start,
              current_period_end = EXCLUDED.current_period_end,
              cancel_at_period_end = EXCLUDED.cancel_at_period_end,
              updated_at = CURRENT_TIMESTAMP`,
            [
              parseInt(userId),
              planTier,
              subscription.id,
              'stripe',
              subscription.status,
              periodStart,
              periodEnd,
              subData.cancel_at_period_end || false,
            ]
          )
        }

        console.log('[Stripe Webhook] Successfully upgraded user:', userId)
        
        // Send welcome email and payment confirmation
        if (customerEmail) {
          try {
            // Get user name from database
            const userResult = await db.query(
              'SELECT email FROM users WHERE id = $1',
              [parseInt(userId)]
            )
            const userEmail = userResult.rows[0]?.email || customerEmail
            
            // Send welcome email
            await sendWelcomeProEmail(userEmail)
            
            // Send payment confirmation
            await sendPaymentConfirmationEmail(userEmail, {
              amount,
              currency: session.currency?.toUpperCase() || 'USD',
              planName: planTier === 'pro' ? 'PolyTrade Pro' : 'PolyTrade Free',
            })
          } catch (emailError: any) {
            console.error('[Stripe Webhook] Failed to send emails:', emailError.message)
            // Don't fail the webhook if email fails
          }
        }
        
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        
        const db = getDbPool()

        // Type assertion for subscription properties
        const subData = subscription as any

        // First, try to get user_id from subscription metadata
        let userId = subscription.metadata?.user_id

        // If not in metadata, look it up from our subscriptions table
        if (!userId) {
          const subResult = await db.query(
            'SELECT user_id FROM subscriptions WHERE subscription_id = $1',
            [subscription.id]
          )

          if (subResult.rows.length === 0) {
            console.error('[Stripe Webhook] Subscription not found in database:', subscription.id)
            return NextResponse.json({ received: true })
          }

          userId = subResult.rows[0].user_id.toString()
        }

        // Convert Stripe timestamps to Date objects, only if valid
        const periodStart = subData.current_period_start && subData.current_period_start > 0
          ? new Date(subData.current_period_start * 1000)
          : null
        const periodEnd = subData.current_period_end && subData.current_period_end > 0
          ? new Date(subData.current_period_end * 1000)
          : null

        // Update subscription status
        await db.query(
          `UPDATE subscriptions 
           SET status = $1,
               current_period_start = COALESCE($2, current_period_start),
               current_period_end = COALESCE($3, current_period_end),
               cancel_at_period_end = $4,
               cancelled_at = CASE WHEN $1 IN ('canceled', 'cancelled') THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE subscription_id = $5`,
          [
            subscription.status,
            periodStart,
            periodEnd,
            subData.cancel_at_period_end || false,
            subscription.id,
          ]
        )

        // If subscription is cancelled, deleted, unpaid, or past_due, downgrade user immediately
        const shouldDowngrade = 
          subscription.status === 'canceled' || 
          subscription.status === 'unpaid' || 
          subscription.status === 'past_due' ||
          event.type === 'customer.subscription.deleted'

        if (shouldDowngrade) {
          await db.query(
            `UPDATE users 
             SET plan_tier = 'free', 
                 plan_updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [parseInt(userId)]
          )

          console.log('[Stripe Webhook] Downgraded user due to subscription cancellation:', {
            userId,
            subscriptionId: subscription.id,
            status: subscription.status,
            eventType: event.type,
          })
          
          // Send cancellation email
          try {
            const userResult = await db.query(
              'SELECT email FROM users WHERE id = $1',
              [parseInt(userId)]
            )
            const userEmail = userResult.rows[0]?.email
            
            if (userEmail) {
              const cancellationDate = periodEnd 
                ? new Date(periodEnd).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })
                : undefined
              
              await sendSubscriptionCancelledEmail(userEmail, {
                planName: 'PolyTrade Pro',
                cancellationDate,
              })
            }
          } catch (emailError: any) {
            console.error('[Stripe Webhook] Failed to send cancellation email:', emailError.message)
            // Don't fail the webhook if email fails
          }
        }

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const invoiceData = invoice as any
        const subscriptionId = invoiceData.subscription as string | null

        if (!subscriptionId) {
          return NextResponse.json({ received: true })
        }

        const db = getDbPool()
        const subResult = await db.query(
          'SELECT user_id, status FROM subscriptions WHERE subscription_id = $1',
          [subscriptionId]
        )

        if (subResult.rows.length === 0) {
          console.warn('[Stripe Webhook] Payment failed but subscription not found:', subscriptionId)
          return NextResponse.json({ received: true })
        }

        const userId = subResult.rows[0].user_id
        const currentStatus = subResult.rows[0].status

        // Count failed payment attempts for this subscription
        const failedPaymentsResult = await db.query(
          `SELECT COUNT(*) as failed_count 
           FROM payments 
           WHERE user_id = $1 
           AND status = 'failed' 
           AND reason = 'subscription_renewal'
           AND created_at > NOW() - INTERVAL '30 days'`,
          [userId]
        )

        const failedCount = parseInt(failedPaymentsResult.rows[0]?.failed_count || '0')

        // Record the failed payment
        const paymentIntentId = invoiceData.payment_intent 
          ? (typeof invoiceData.payment_intent === 'string' 
              ? invoiceData.payment_intent 
              : invoiceData.payment_intent?.id || null)
          : null

        await db.query(
          `INSERT INTO payments (
            user_id,
            plan_tier,
            amount,
            currency,
            payment_intent_id,
            payment_method,
            status,
            reason,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            userId,
            'pro',
            invoice.amount_due || 0,
            invoice.currency?.toUpperCase() || 'USD',
            paymentIntentId,
            'stripe',
            'failed',
            'subscription_renewal',
            JSON.stringify({
              invoice_id: invoice.id,
              subscription_id: subscriptionId,
              attempt_number: failedCount + 1,
              failure_reason: invoiceData.last_payment_error?.message || 'Payment failed',
            }),
          ]
        )

        // Update subscription status to past_due
        await db.query(
          `UPDATE subscriptions 
           SET status = 'past_due',
               updated_at = CURRENT_TIMESTAMP
           WHERE subscription_id = $1`,
          [subscriptionId]
        )

        // Auto-downgrade after 3 failed attempts
        if (failedCount + 1 >= 3) {
          await db.query(
            `UPDATE users 
             SET plan_tier = 'free', 
                 plan_updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [userId]
          )

          await db.query(
            `UPDATE subscriptions 
             SET status = 'expired',
                 updated_at = CURRENT_TIMESTAMP
             WHERE subscription_id = $1`,
            [subscriptionId]
          )

          console.warn('[Stripe Webhook] Auto-downgraded user after 3 failed payments:', {
            userId,
            subscriptionId,
            failedAttempts: failedCount + 1,
            invoiceId: invoice.id,
          })
        } else {
          console.warn('[Stripe Webhook] Payment failed for user:', {
            userId,
            subscriptionId,
            failedAttempts: failedCount + 1,
            totalAllowed: 3,
            invoiceId: invoice.id,
          })
        }
        
        // Send payment failed email
        try {
          const userResult = await db.query(
            'SELECT email FROM users WHERE id = $1',
            [userId]
          )
          const userEmail = userResult.rows[0]?.email
          
          if (userEmail) {
            await sendPaymentFailedEmail(userEmail, {
              amount: invoice.amount_due || 0,
              currency: invoice.currency?.toUpperCase() || 'USD',
              planName: 'PolyTrade Pro',
              attemptNumber: failedCount + 1,
              maxAttempts: 3,
            })
          }
        } catch (emailError: any) {
          console.error('[Stripe Webhook] Failed to send payment failed email:', emailError.message)
          // Don't fail the webhook if email fails
        }

        break
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[Stripe Webhook] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

