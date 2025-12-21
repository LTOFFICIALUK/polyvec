import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import Stripe from 'stripe'
import { getDbPool } from '@/lib/db'

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
 * POST /api/stripe/create-portal
 * 
 * Creates a Stripe Customer Portal session for subscription management
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

    // Get user's subscription from database
    // Allow both 'active' and 'past_due' statuses - users with failed payments should still be able to update payment method
    const db = getDbPool()
    const subResult = await db.query(
      'SELECT subscription_id FROM subscriptions WHERE user_id = $1 AND status IN ($2, $3) ORDER BY created_at DESC LIMIT 1',
      [userId, 'active', 'past_due']
    )

    if (subResult.rows.length === 0 || !subResult.rows[0].subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      )
    }

    const subscriptionId = subResult.rows[0].subscription_id

    // Get subscription from Stripe to get customer ID
    const stripe = getStripe()
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const customerId = subscription.customer as string

    // Get base URL - prioritize NEXT_PUBLIC_BASE_URL over VERCEL_URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/terminal`,
    })

    return NextResponse.json({
      success: true,
      url: portalSession.url,
    })
  } catch (error: any) {
    console.error('[Stripe Portal] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    )
  }
}

