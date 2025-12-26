import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getPolymarketCredentials, authenticateWithPolymarket } from '@/lib/polymarket-auth-helper'
import { getDbPool, runMigrations } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/user/polymarket-credentials
 * Get stored Polymarket API credentials for the authenticated user
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

    // Ensure migrations are run (this will add the columns if they don't exist)
    await runMigrations()

    // Get credentials from database
    const credentials = await getPolymarketCredentials(userId)

    if (!credentials) {
      return NextResponse.json(
        { credentials: null },
        { status: 200 }
      )
    }

    return NextResponse.json({
      credentials: {
        apiKey: credentials.apiKey,
        secret: credentials.secret,
        passphrase: credentials.passphrase,
      },
    })
  } catch (error: any) {
    console.error('[Get Polymarket Credentials] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get credentials' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user/polymarket-credentials
 * Store Polymarket API credentials for the authenticated user
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

    // Verify token
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const body = await request.json()
    const { apiKey, secret: apiSecret, passphrase } = body

    if (!apiKey || !apiSecret || !passphrase) {
      return NextResponse.json(
        { error: 'Missing required fields: apiKey, secret, passphrase' },
        { status: 400 }
      )
    }

    // Ensure migrations are run (this will add the columns if they don't exist)
    await runMigrations()

    // Get user's wallet address
    const db = getDbPool()
    const userResult = await db.query(
      'SELECT wallet_address FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0 || !userResult.rows[0].wallet_address) {
      return NextResponse.json(
        { error: 'Custodial wallet not found' },
        { status: 404 }
      )
    }

    // Store credentials in database
    await db.query(
      `UPDATE users 
       SET polymarket_api_key = $1,
           polymarket_api_secret = $2,
           polymarket_api_passphrase = $3,
           polymarket_credentials_created_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [apiKey, apiSecret, passphrase, userId]
    )

    return NextResponse.json({
      success: true,
      message: 'Credentials stored successfully',
    })
  } catch (error: any) {
    console.error('[Store Polymarket Credentials] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to store credentials' },
      { status: 500 }
    )
  }
}
