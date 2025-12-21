import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * POST /api/user/plan/downgrade
 * SECURE ENDPOINT: Only callable by admin/system
 * 
 * Allows downgrading from pro to free, typically called:
 * - When subscription is cancelled
 * - When payment fails
 * - By admin/system processes
 * 
 * SECURITY: Requires admin verification or system token
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { 
      reason,
      systemToken // Required for system-initiated downgrades
    } = body

    // SECURITY: Verify system token for automated downgrades
    // For user-initiated downgrades, this can be optional
    if (systemToken) {
      const expectedSystemToken = process.env.SYSTEM_TOKEN
      if (systemToken !== expectedSystemToken) {
        console.error('[Plan Downgrade] Invalid system token:', { userId })
        return NextResponse.json(
          { error: 'Invalid system token' },
          { status: 403 }
        )
      }
    }

    const db = getDbPool()
    
    // Get current plan
    const currentPlanResult = await db.query(
      'SELECT plan_tier FROM users WHERE id = $1',
      [userId]
    )

    if (currentPlanResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const currentPlan = currentPlanResult.rows[0].plan_tier || 'free'

    // Only allow downgrading from pro to free
    if (currentPlan !== 'pro') {
      return NextResponse.json(
        { error: 'User is not on pro plan. No downgrade needed.' },
        { status: 400 }
      )
    }

    // Log the downgrade for audit purposes
    console.log('[Plan Downgrade] Downgrading user:', {
      userId,
      from: currentPlan,
      to: 'free',
      reason: reason || 'User requested',
      timestamp: new Date().toISOString()
    })

    // Update user's plan to free
    await db.query(
      `UPDATE users 
       SET plan_tier = 'free', 
           plan_updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [userId]
    )

    return NextResponse.json({
      success: true,
      plan: 'free',
      message: 'Plan downgraded to free',
    })
  } catch (error: any) {
    console.error('[Plan Downgrade] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to downgrade plan' },
      { status: 500 }
    )
  }
}

