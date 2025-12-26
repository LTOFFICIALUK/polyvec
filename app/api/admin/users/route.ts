import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/users
 * Get all users with pagination and filters
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

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const planTier = searchParams.get('planTier') || ''
    const isBanned = searchParams.get('isBanned') || ''
    const offset = (page - 1) * limit

    const db = getDbPool()

    // Build query
    let whereClause = 'WHERE 1=1'
    const queryParams: any[] = []
    let paramCount = 0

    if (search) {
      paramCount++
      whereClause += ` AND (email ILIKE $${paramCount} OR wallet_address ILIKE $${paramCount})`
      queryParams.push(`%${search}%`)
    }

    if (planTier) {
      paramCount++
      whereClause += ` AND plan_tier = $${paramCount}`
      queryParams.push(planTier)
    }

    if (isBanned === 'true') {
      whereClause += ` AND is_banned = TRUE`
    } else if (isBanned === 'false') {
      whereClause += ` AND is_banned = FALSE`
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      queryParams
    )
    const total = parseInt(countResult.rows[0].total)

    // Get users
    paramCount++
    queryParams.push(limit)
    paramCount++
    queryParams.push(offset)

    const result = await db.query(
      `SELECT 
        id,
        email,
        plan_tier,
        is_admin,
        is_banned,
        ban_reason,
        banned_at,
        wallet_address,
        created_at,
        last_login,
        plan_updated_at
      FROM users 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
      queryParams
    )

    return NextResponse.json({
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('[Admin Users] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

