import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/users/manage
 * Get all admin users
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const authCheck = await requireAdmin(userId)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 })
    }

    const db = getDbPool()
    const result = await db.query(
      `SELECT 
        id,
        email,
        is_admin,
        created_at,
        last_login
      FROM users 
      WHERE is_admin = TRUE
      ORDER BY created_at DESC`
    )

    return NextResponse.json({
      admins: result.rows,
    })
  } catch (error: any) {
    console.error('[Admin Users] Error fetching admins:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin users' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/users/manage
 * Add or remove admin status for a user by email
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const authCheck = await requireAdmin(userId)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 })
    }

    const body = await request.json()
    const { email, isAdmin: makeAdmin } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (typeof makeAdmin !== 'boolean') {
      return NextResponse.json(
        { error: 'isAdmin must be a boolean' },
        { status: 400 }
      )
    }

    const db = getDbPool()
    const normalizedEmail = email.toLowerCase().trim()

    // Check if user exists
    const userResult = await db.query(
      'SELECT id, email, is_admin FROM users WHERE email = $1',
      [normalizedEmail]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const targetUser = userResult.rows[0]

    // Prevent removing your own admin status
    if (targetUser.id === userId && !makeAdmin) {
      return NextResponse.json(
        { error: 'You cannot remove your own admin status' },
        { status: 400 }
      )
    }

    // Update admin status
    await db.query(
      'UPDATE users SET is_admin = $1 WHERE id = $2',
      [makeAdmin, targetUser.id]
    )

    return NextResponse.json({
      success: true,
      message: makeAdmin
        ? `Admin access granted to ${normalizedEmail}`
        : `Admin access removed from ${normalizedEmail}`,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        is_admin: makeAdmin,
      },
    })
  } catch (error: any) {
    console.error('[Admin Users] Error managing admin:', error)
    return NextResponse.json(
      { error: 'Failed to update admin status' },
      { status: 500 }
    )
  }
}

