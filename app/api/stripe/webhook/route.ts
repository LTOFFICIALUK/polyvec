import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/lib/db'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

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

    // Verify webhook signature
    let event: Stripe.Event
    try {
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
          const subscriptionId = typeof session.subscription === 'string' 
            ? session.subscription 
            : (session.subscription as any).id
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          
          // Type assertion for subscription properties (Stripe types can be inconsistent)
          const subData = subscription as any
          
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
              new Date((subData.current_period_start || 0) * 1000),
              new Date((subData.current_period_end || 0) * 1000),
              subData.cancel_at_period_end || false,
            ]
          )
        }

        console.log('[Stripe Webhook] Successfully upgraded user:', userId)
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.user_id

        if (!userId) {
          console.error('[Stripe Webhook] Missing user_id in subscription metadata:', subscription.id)
          return NextResponse.json({ received: true })
        }

        const db = getDbPool()

        // Type assertion for subscription properties
        const subData = subscription as any

        // Update subscription status
        await db.query(
          `UPDATE subscriptions 
           SET status = $1,
               current_period_start = $2,
               current_period_end = $3,
               cancel_at_period_end = $4,
               cancelled_at = CASE WHEN $1 = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE subscription_id = $5`,
          [
            subscription.status,
            new Date((subData.current_period_start || 0) * 1000),
            new Date((subData.current_period_end || 0) * 1000),
            subData.cancel_at_period_end || false,
            subscription.id,
          ]
        )

        // If subscription is cancelled or expired, downgrade user
        if (subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'past_due') {
          await db.query(
            `UPDATE users 
             SET plan_tier = 'free', 
                 plan_updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [parseInt(userId)]
          )

          console.log('[Stripe Webhook] Downgraded user due to subscription status:', userId, subscription.status)
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
          'SELECT user_id FROM subscriptions WHERE subscription_id = $1',
          [subscriptionId]
        )

        if (subResult.rows.length > 0) {
          const userId = subResult.rows[0].user_id
          
          // Optionally downgrade user or send notification
          // For now, just log it
          console.warn('[Stripe Webhook] Payment failed for user:', userId, invoice.id)
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

