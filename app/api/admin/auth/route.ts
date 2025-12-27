import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { isAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/auth
 * Check if current user is an admin
 * Checks the is_admin column in the database
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.json(
        { isAdmin: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    // Verify user exists and get their email
    const db = getDbPool()
    const userResult = await db.query(
      'SELECT email, is_admin FROM users WHERE id = $1 AND is_active = TRUE AND is_banned = FALSE',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { isAdmin: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const user = userResult.rows[0]

    // Check admin status via isAdmin function
    const adminStatus = await isAdmin(userId)

    if (!adminStatus) {
      return NextResponse.json(
        { isAdmin: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      isAdmin: true,
      userId,
      email: user.email,
    })
  } catch (error: any) {
    console.error('[Admin Auth] Error:', error)
    return NextResponse.json(
      { isAdmin: false, error: 'Invalid or expired token' },
      { status: 401 }
    )
  }
}

