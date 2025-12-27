import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/user/wallet
 * Get the user's custodial wallet address
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

    // Verify token
    let userId: number
    try {
      const { payload } = await jwtVerify(token, secret)
      userId = payload.userId as number
    } catch (jwtError: any) {
      console.error('[Wallet API] JWT verification error:', jwtError)
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    let db
    try {
      db = getDbPool()
    } catch (dbError: any) {
      console.error('[Wallet API] Database connection error:', dbError)
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    let result
    try {
      result = await db.query(
        'SELECT wallet_address FROM users WHERE id = $1',
        [userId]
      )
    } catch (queryError: any) {
      console.error('[Wallet API] Database query error:', queryError)
      return NextResponse.json(
        { error: 'Failed to fetch wallet address' },
        { status: 500 }
      )
    }

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const walletAddress = result.rows[0].wallet_address
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet not found. Please contact support.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      wallet_address: walletAddress,
    })
  } catch (error: any) {
    console.error('[Wallet API] Unexpected error:', error)
    // Log more details for debugging
    if (error.code) {
      console.error('[Wallet API] Error code:', error.code)
    }
    if (error.message) {
      console.error('[Wallet API] Error message:', error.message)
    }
    // Return a more graceful error instead of 500
    return NextResponse.json(
      { error: 'Failed to get wallet address' },
      { status: 500 }
    )
  }
}

