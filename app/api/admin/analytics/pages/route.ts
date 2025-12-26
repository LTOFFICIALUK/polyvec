import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/analytics/pages
 * Get page analytics (views, time on page, etc.)
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
    const period = searchParams.get('period') || '30d'
    const page = searchParams.get('page') || ''

    const db = getDbPool()

    // Calculate date range
    let dateFilter = ''
    if (period === '7d') {
      dateFilter = "AND viewed_at >= NOW() - INTERVAL '7 days'"
    } else if (period === '30d') {
      dateFilter = "AND viewed_at >= NOW() - INTERVAL '30 days'"
    } else if (period === '90d') {
      dateFilter = "AND viewed_at >= NOW() - INTERVAL '90 days'"
    }

    let pageFilter = ''
    if (page) {
      pageFilter = `AND page_path = '${page.replace(/'/g, "''")}'`
    }

    // Get page views summary
    const summaryResult = await db.query(
      `SELECT 
        page_path,
        COUNT(*) as views,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT session_id) as unique_sessions,
        AVG(time_on_page) as avg_time_on_page,
        MAX(viewed_at) as last_viewed
      FROM page_analytics
      WHERE 1=1 ${dateFilter} ${pageFilter}
      GROUP BY page_path
      ORDER BY views DESC`
    )

    // Get top pages
    const topPagesResult = await db.query(
      `SELECT 
        page_path,
        COUNT(*) as views
      FROM page_analytics
      WHERE 1=1 ${dateFilter}
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 20`
    )

    // Get page views over time
    const viewsOverTimeResult = await db.query(
      `SELECT 
        DATE(viewed_at) as date,
        page_path,
        COUNT(*) as views
      FROM page_analytics
      WHERE 1=1 ${dateFilter} ${pageFilter}
      GROUP BY DATE(viewed_at), page_path
      ORDER BY date ASC, views DESC`
    )

    return NextResponse.json({
      summary: summaryResult.rows,
      topPages: topPagesResult.rows,
      viewsOverTime: viewsOverTimeResult.rows,
      period,
    })
  } catch (error: any) {
    console.error('[Admin Page Analytics] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch page analytics' },
      { status: 500 }
    )
  }
}

