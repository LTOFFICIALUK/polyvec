import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

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

    // Get user's active subscription
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

    const subscription = subResult.rows[0]

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        planTier: subscription.plan_tier,
        subscriptionId: subscription.subscription_id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelledAt: subscription.cancelled_at,
        createdAt: subscription.created_at,
        updatedAt: subscription.updated_at,
      },
    })
  } catch (error: any) {
    console.error('[Get Subscription] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get subscription' },
      { status: 500 }
    )
  }
}

