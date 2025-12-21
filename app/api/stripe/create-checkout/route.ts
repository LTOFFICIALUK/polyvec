import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

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

/**
 * POST /api/stripe/create-checkout
 * 
 * Creates a Stripe Checkout session for plan upgrade
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
    const { plan } = body

    if (plan !== 'pro') {
      return NextResponse.json(
        { error: 'Invalid plan. Only "pro" plan is available for purchase.' },
        { status: 400 }
      )
    }

    // Get user email for checkout
    const db = (await import('@/lib/db')).getDbPool()
    const userResult = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const userEmail = userResult.rows[0].email

    // Initialize Stripe
    const stripe = getStripe()

    // Create Stripe Checkout Session
    // Get base URL - prioritize NEXT_PUBLIC_BASE_URL over VERCEL_URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription', // Use 'subscription' for recurring, 'payment' for one-time
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PolyTrade Pro',
              description: 'Automated Trading Strategies - Trade 24/7 with TradingView signals',
            },
            unit_amount: 4900, // $49.00 in cents
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      customer_email: userEmail,
      metadata: {
        user_id: userId.toString(),
        plan_tier: 'pro',
      },
      success_url: `${baseUrl}/terminal?upgrade=success`,
      cancel_url: `${baseUrl}/terminal?upgrade=cancelled`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    })
  } catch (error: any) {
    console.error('[Stripe Checkout] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

