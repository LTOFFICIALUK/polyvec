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
  console.log('[Get Subscription] ====== ENDPOINT CALLED ======')
  try {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      console.log('[Get Subscription] No auth token found')
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Verify token and get userId
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number
    console.log('[Get Subscription] User ID:', userId)

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
        
        // Log the full subscription object to debug
        console.log('[Get Subscription] Full Stripe subscription:', JSON.stringify({
          id: stripeSubscription.id,
          current_period_end: stripeSubscription.current_period_end,
          current_period_start: stripeSubscription.current_period_start,
          status: stripeSubscription.status,
          type: typeof stripeSubscription.current_period_end,
        }, null, 2))
      } catch (error: any) {
        console.warn('[Get Subscription] Failed to fetch from Stripe:', error.message)
        // Fall back to database data if Stripe fetch fails
      }
    } else {
      console.log('[Get Subscription] No subscription_id in database')
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
      if (!dateValue) {
        console.log('[Get Subscription] convertDbDate: dateValue is null/undefined')
        return null
      }
      
      console.log('[Get Subscription] convertDbDate input:', {
        value: dateValue,
        type: typeof dateValue,
        isDate: dateValue instanceof Date,
        constructor: dateValue?.constructor?.name,
      })
      
      try {
        let date: Date
        
        // Handle different input types
        if (dateValue instanceof Date) {
          // Already a Date object
          date = dateValue
        } else if (typeof dateValue === 'string') {
          // String - could be ISO string or PostgreSQL timestamp
          date = new Date(dateValue)
        } else if (typeof dateValue === 'number') {
          // Number - could be timestamp in seconds or milliseconds
          date = dateValue > 1000000000000 
            ? new Date(dateValue) // milliseconds
            : new Date(dateValue * 1000) // seconds
        } else {
          // Try to convert whatever it is
          date = new Date(dateValue)
        }
        
        // Validate the date
        if (isNaN(date.getTime())) {
          console.warn('[Get Subscription] convertDbDate: Invalid date after conversion', dateValue)
          return null
        }
        
        // Check if it's epoch (Jan 1, 1970)
        if (date.getTime() === 0) {
          console.warn('[Get Subscription] convertDbDate: Date is epoch (0)', dateValue)
          return null
        }
        
        const isoString = date.toISOString()
        console.log('[Get Subscription] convertDbDate success:', {
          input: dateValue,
          output: isoString,
          date: date.toString(),
        })
        
        return isoString
      } catch (error) {
        console.error('[Get Subscription] Error converting database date:', dateValue, error)
        return null
      }
    }

    // Use Stripe data if available, otherwise use database data
    let currentPeriodEnd: string | null = null
    let currentPeriodStart: string | null = null

    // Always try database first as fallback, then Stripe
    console.log('[Get Subscription] Database raw values:', {
      periodEnd: dbSubscription.current_period_end,
      periodStart: dbSubscription.current_period_start,
      periodEndType: typeof dbSubscription.current_period_end,
      periodStartType: typeof dbSubscription.current_period_start,
    })

    // Try database first
    currentPeriodEnd = convertDbDate(dbSubscription.current_period_end)
    currentPeriodStart = convertDbDate(dbSubscription.current_period_start)
    
    console.log('[Get Subscription] Database conversion result:', {
      periodEnd: currentPeriodEnd,
      periodStart: currentPeriodStart,
    })

    // If we have Stripe data, prefer it (more accurate)
    if (stripeSubscription) {
      const stripePeriodEnd = convertStripeTimestamp(stripeSubscription.current_period_end)
      const stripePeriodStart = convertStripeTimestamp(stripeSubscription.current_period_start)
      
      console.log('[Get Subscription] Stripe conversion result:', {
        periodEnd: stripePeriodEnd,
        periodStart: stripePeriodStart,
        rawPeriodEnd: stripeSubscription.current_period_end,
        rawPeriodStart: stripeSubscription.current_period_start,
      })
      
      // Use Stripe data if conversion succeeded
      if (stripePeriodEnd) {
        currentPeriodEnd = stripePeriodEnd
        console.log('[Get Subscription] Using Stripe periodEnd:', currentPeriodEnd)
      }
      if (stripePeriodStart) {
        currentPeriodStart = stripePeriodStart
        console.log('[Get Subscription] Using Stripe periodStart:', currentPeriodStart)
      }
    }

    // Fallback: If we still don't have dates, calculate from subscription creation date
    // (30 days for monthly subscription)
    if (!currentPeriodEnd && dbSubscription.created_at) {
      try {
        const createdAt = new Date(dbSubscription.created_at)
        if (!isNaN(createdAt.getTime()) && createdAt.getTime() > 0) {
          // Add 30 days for monthly subscription
          const calculatedEnd = new Date(createdAt)
          calculatedEnd.setDate(calculatedEnd.getDate() + 30)
          currentPeriodEnd = calculatedEnd.toISOString()
          console.log('[Get Subscription] Calculated periodEnd from created_at:', currentPeriodEnd)
        }
      } catch (error) {
        console.warn('[Get Subscription] Failed to calculate periodEnd from created_at:', error)
      }
    }

    // Prioritize database status if it's 'past_due' (for testing scenarios)
    // Otherwise, use Stripe status if available, then fall back to database
    let finalStatus = dbSubscription.status
    if (stripeSubscription?.status && dbSubscription.status !== 'past_due') {
      // Only use Stripe status if database status is not 'past_due'
      // This allows testing payment failures by setting database to 'past_due'
      finalStatus = stripeSubscription.status
    }

    const subscription = {
      id: dbSubscription.id,
      planTier: dbSubscription.plan_tier,
      subscriptionId: dbSubscription.subscription_id,
      status: finalStatus,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end ?? dbSubscription.cancel_at_period_end,
      cancelledAt: dbSubscription.cancelled_at,
      createdAt: dbSubscription.created_at,
      updatedAt: dbSubscription.updated_at,
    }

    console.log('[Get Subscription] Final subscription object:', {
      ...subscription,
      currentPeriodEnd,
      currentPeriodStart,
    })

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

