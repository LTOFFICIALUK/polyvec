import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/user/plan
 * Get user's current plan
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

    // Get user's plan from database
    const db = getDbPool()
    const result = await db.query(
      `SELECT plan_tier FROM users WHERE id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const planTier = result.rows[0].plan_tier || 'free'

    return NextResponse.json({
      success: true,
      plan: planTier,
    })
  } catch (error: any) {
    console.error('[Get Plan] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get plan' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user/plan
 * SECURITY: Users cannot directly change their plan.
 * Plan changes must go through payment verification.
 * This endpoint is disabled for security - use /api/user/plan/upgrade instead.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Direct plan changes are not allowed. Please use the payment flow to upgrade.',
      redirectTo: '/checkout'
    },
    { status: 403 }
  )
}

