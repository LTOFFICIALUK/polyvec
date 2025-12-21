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
        console.log('[Get Subscription] Stripe subscription data:', {
          subscription_id: stripeSubscription.id,
          current_period_end: stripeSubscription.current_period_end,
          current_period_start: stripeSubscription.current_period_start,
          status: stripeSubscription.status,
        })
      } catch (error: any) {
        console.warn('[Get Subscription] Failed to fetch from Stripe:', error.message)
        // Fall back to database data if Stripe fetch fails
      }
    }

    // Helper to convert Stripe timestamp to ISO string
    const convertStripeTimestamp = (timestamp: number | null | undefined): string | null => {
      if (!timestamp || timestamp === 0) {
        console.warn('[Get Subscription] Missing or zero timestamp:', timestamp)
        return null
      }
      try {
        // Stripe timestamps are in seconds, convert to milliseconds
        const date = new Date(timestamp * 1000)
        if (isNaN(date.getTime())) {
          console.error('[Get Subscription] Invalid timestamp:', timestamp)
          return null
        }
        // Check if date is epoch (Jan 1, 1970) - indicates invalid timestamp
        if (date.getTime() === 0) {
          console.error('[Get Subscription] Timestamp is epoch (0):', timestamp)
          return null
        }
        return date.toISOString()
      } catch (error) {
        console.error('[Get Subscription] Error converting timestamp:', timestamp, error)
        return null
      }
    }

    // Helper to check if database date is valid
    const isValidDate = (dateValue: any): boolean => {
      if (!dateValue) return false
      try {
        const date = new Date(dateValue)
        const isValid = !isNaN(date.getTime()) && date.getTime() > 0
        if (!isValid) {
          console.warn('[Get Subscription] Invalid database date:', dateValue, '->', date.toISOString())
        }
        return isValid
      } catch (error) {
        console.warn('[Get Subscription] Error parsing database date:', dateValue, error)
        return false
      }
    }

    // Helper to convert database date to ISO string
    const convertDbDate = (dateValue: any): string | null => {
      if (!dateValue) return null
      try {
        // If it's already an ISO string, return it
        if (typeof dateValue === 'string' && dateValue.includes('T')) {
          const date = new Date(dateValue)
          if (!isNaN(date.getTime()) && date.getTime() > 0) {
            return dateValue
          }
        }
        // Otherwise, try to convert it
        const date = new Date(dateValue)
        if (!isNaN(date.getTime()) && date.getTime() > 0) {
          return date.toISOString()
        }
        return null
      } catch (error) {
        console.warn('[Get Subscription] Error converting database date:', dateValue, error)
        return null
      }
    }

    // Use Stripe data if available, otherwise use database data
    let currentPeriodEnd: string | null = null
    let currentPeriodStart: string | null = null

    if (stripeSubscription) {
      // Prefer Stripe data (most accurate)
      currentPeriodEnd = convertStripeTimestamp(stripeSubscription.current_period_end)
      currentPeriodStart = convertStripeTimestamp(stripeSubscription.current_period_start)
      
      console.log('[Get Subscription] Stripe conversion result:', {
        periodEnd: currentPeriodEnd,
        periodStart: currentPeriodStart,
      })
      
      // Fall back to database if Stripe conversion failed
      if (!currentPeriodEnd) {
        currentPeriodEnd = convertDbDate(dbSubscription.current_period_end)
        console.log('[Get Subscription] Using database periodEnd:', currentPeriodEnd)
      }
      if (!currentPeriodStart) {
        currentPeriodStart = convertDbDate(dbSubscription.current_period_start)
        console.log('[Get Subscription] Using database periodStart:', currentPeriodStart)
      }
    } else {
      // Use database data
      console.log('[Get Subscription] No Stripe subscription, using database data')
      currentPeriodEnd = convertDbDate(dbSubscription.current_period_end)
      currentPeriodStart = convertDbDate(dbSubscription.current_period_start)
      console.log('[Get Subscription] Database dates:', {
        periodEnd: currentPeriodEnd,
        periodStart: currentPeriodStart,
      })
    }

    const subscription = {
      id: dbSubscription.id,
      planTier: dbSubscription.plan_tier,
      subscriptionId: dbSubscription.subscription_id,
      status: stripeSubscription?.status || dbSubscription.status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end ?? dbSubscription.cancel_at_period_end,
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

