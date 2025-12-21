import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * POST /api/user/plan/upgrade
 * SECURE ENDPOINT: Only callable after payment verification
 * 
 * This endpoint requires a payment verification token/signature to prevent
 * unauthorized plan upgrades. The payment processor (Stripe, etc.) should
 * call this endpoint with proper verification.
 * 
 * SECURITY REQUIREMENTS:
 * - Must include payment verification token/signature
 * - Must verify payment was successful
 * - Must verify payment amount matches plan price
 * - Should be called server-to-server from payment webhook
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
      plan, 
      paymentIntentId, 
      paymentVerificationToken,
      amount,
      currency = 'USD'
    } = body

    // SECURITY: Validate required payment verification fields
    if (!paymentIntentId || !paymentVerificationToken) {
      console.error('[Plan Upgrade] Missing payment verification:', { userId, plan })
      return NextResponse.json(
        { error: 'Payment verification required. Cannot upgrade without verified payment.' },
        { status: 400 }
      )
    }

    // SECURITY: Verify payment token matches expected format
    // In production, verify this token against your payment processor (Stripe, etc.)
    const expectedVerificationToken = process.env.PAYMENT_VERIFICATION_SECRET
    if (!expectedVerificationToken) {
      console.error('[Plan Upgrade] Payment verification secret not configured')
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 500 }
      )
    }

    // SECURITY: Verify the payment verification token
    // This should be a signed token from your payment processor
    // For now, we'll use a simple comparison - in production, use proper signature verification
    if (paymentVerificationToken !== expectedVerificationToken) {
      console.error('[Plan Upgrade] Invalid payment verification token:', { userId, plan })
      return NextResponse.json(
        { error: 'Invalid payment verification. Upgrade denied.' },
        { status: 403 }
      )
    }

    // SECURITY: Verify plan and amount match
    if (!plan || (plan !== 'free' && plan !== 'pro')) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "free" or "pro"' },
        { status: 400 }
      )
    }

    // SECURITY: Verify payment amount matches plan price
    const expectedAmount = plan === 'pro' ? 4900 : 0 // $49.00 in cents
    if (plan === 'pro' && amount !== expectedAmount) {
      console.error('[Plan Upgrade] Amount mismatch:', { userId, plan, amount, expectedAmount })
      return NextResponse.json(
        { error: 'Payment amount does not match plan price' },
        { status: 400 }
      )
    }

    // SECURITY: Only allow upgrades, not downgrades via this endpoint
    // Users can downgrade to free through a separate process if needed
    const db = getDbPool()
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
    
    // Only allow upgrading to pro, not downgrading
    if (plan === 'free' && currentPlan === 'pro') {
      return NextResponse.json(
        { error: 'Cannot downgrade through this endpoint. Contact support to downgrade.' },
        { status: 400 }
      )
    }

    // SECURITY: Log the upgrade for audit purposes
    console.log('[Plan Upgrade] Verified upgrade:', {
      userId,
      from: currentPlan,
      to: plan,
      paymentIntentId,
      timestamp: new Date().toISOString()
    })

    // Update user's plan in database
    await db.query(
      `UPDATE users 
       SET plan_tier = $1, 
           plan_updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [plan, userId]
    )

    // TODO: Store payment record in a payments/subscriptions table for audit trail
    // await db.query(
    //   `INSERT INTO payments (user_id, plan_tier, amount, payment_intent_id, status, created_at)
    //    VALUES ($1, $2, $3, $4, 'completed', CURRENT_TIMESTAMP)`,
    //   [userId, plan, amount, paymentIntentId]
    // )

    return NextResponse.json({
      success: true,
      plan: plan,
      message: 'Plan upgraded successfully',
    })
  } catch (error: any) {
    console.error('[Plan Upgrade] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upgrade plan' },
      { status: 500 }
    )
  }
}

