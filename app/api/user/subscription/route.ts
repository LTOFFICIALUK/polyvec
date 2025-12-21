import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

// Initialize Stripe (lazy initialization)
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
  })
}

/**
 * GET /api/user/subscription
 * 
 * Gets the current user's subscription details
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Verify token and get userId
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const db = getDbPool()

    // Get user's active subscription from database
    const subResult = await db.query(
      `SELECT 
        id,
        plan_tier,
        subscription_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        cancelled_at,
        created_at,
        updated_at
      FROM subscriptions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1`,
      [userId]
    )

    if (subResult.rows.length === 0) {
      return NextResponse.json({
        subscription: null,
        message: 'No subscription found',
      })
    }

    const dbSubscription = subResult.rows[0]

    // Fetch latest subscription data from Stripe for accurate dates
    let stripeSubscription: any = null
    if (dbSubscription.subscription_id) {
      try {
        const stripe = getStripe()
        stripeSubscription = await stripe.subscriptions.retrieve(dbSubscription.subscription_id)
      } catch (error: any) {
        console.warn('[Get Subscription] Failed to fetch from Stripe:', error.message)
        // Fall back to database data if Stripe fetch fails
      }
    }

    // Use Stripe data if available, otherwise use database data
    const subscription = stripeSubscription 
      ? {
          id: dbSubscription.id,
          planTier: dbSubscription.plan_tier,
          subscriptionId: dbSubscription.subscription_id,
          status: stripeSubscription.status,
          currentPeriodStart: stripeSubscription.current_period_start 
            ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
            : dbSubscription.current_period_start,
          currentPeriodEnd: stripeSubscription.current_period_end
            ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
            : dbSubscription.current_period_end,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end ?? dbSubscription.cancel_at_period_end,
          cancelledAt: dbSubscription.cancelled_at,
          createdAt: dbSubscription.created_at,
          updatedAt: dbSubscription.updated_at,
        }
      : {
          id: dbSubscription.id,
          planTier: dbSubscription.plan_tier,
          subscriptionId: dbSubscription.subscription_id,
          status: dbSubscription.status,
          currentPeriodStart: dbSubscription.current_period_start,
          currentPeriodEnd: dbSubscription.current_period_end,
          cancelAtPeriodEnd: dbSubscription.cancel_at_period_end,
          cancelledAt: dbSubscription.cancelled_at,
          createdAt: dbSubscription.created_at,
          updatedAt: dbSubscription.updated_at,
        }

    return NextResponse.json({
      subscription,
    })
  } catch (error: any) {
    console.error('[Get Subscription] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get subscription' },
      { status: 500 }
    )
  }
}

