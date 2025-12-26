import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/emails/subscriptions
 * Get all email list subscriptions
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
    const source = searchParams.get('source') || ''
    const offset = (page - 1) * limit

    const db = getDbPool()

    // Build WHERE clause
    let whereClause = ''
    const queryParams: any[] = []
    let paramCount = 0

    if (source) {
      paramCount++
      whereClause = `WHERE source = $${paramCount}`
      queryParams.push(source)
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM email_list ${whereClause}`,
      queryParams
    )
    const total = parseInt(countResult.rows[0].total)

    // Get subscriptions
    paramCount++
    queryParams.push(limit)
    paramCount++
    queryParams.push(offset)

    const result = await db.query(
      `SELECT 
        id,
        email,
        source,
        created_at
      FROM email_list 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
      queryParams
    )

    // Get source breakdown
    const sourceBreakdownResult = await db.query(
      `SELECT 
        source,
        COUNT(*) as count
      FROM email_list
      GROUP BY source
      ORDER BY count DESC`
    )

    return NextResponse.json({
      subscriptions: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      sourceBreakdown: sourceBreakdownResult.rows,
    })
  } catch (error: any) {
    console.error('[Admin Email Subscriptions] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch email subscriptions' },
      { status: 500 }
    )
  }
}

