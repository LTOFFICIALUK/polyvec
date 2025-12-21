import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

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

    // Get user from database
    const db = getDbPool()
    const result = await db.query(
      'SELECT id, email, created_at, last_login, plan_tier FROM users WHERE id = $1 AND is_active = TRUE',
      [userId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      user: result.rows[0]
    })
  } catch (error: any) {
    console.error('[Auth Me] Error:', error)
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    )
  }
}
