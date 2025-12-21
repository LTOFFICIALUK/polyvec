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
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const db = getDbPool()
    const result = await db.query(
      'SELECT wallet_address FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0 || !result.rows[0].wallet_address) {
      return NextResponse.json(
        { error: 'Wallet not found. Please contact support.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      wallet_address: result.rows[0].wallet_address,
    })
  } catch (error: any) {
    console.error('[Wallet API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get wallet' },
      { status: 500 }
    )
  }
}

