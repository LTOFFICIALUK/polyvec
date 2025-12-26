import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/analytics/emails
 * Get email analytics (open rates, click rates, etc.)
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
    const emailType = searchParams.get('emailType') || ''

    const db = getDbPool()

    // Calculate date range
    let dateFilter = ''
    if (period === '7d') {
      dateFilter = "AND sent_at >= NOW() - INTERVAL '7 days'"
    } else if (period === '30d') {
      dateFilter = "AND sent_at >= NOW() - INTERVAL '30 days'"
    } else if (period === '90d') {
      dateFilter = "AND sent_at >= NOW() - INTERVAL '90 days'"
    }

    let typeFilter = ''
    if (emailType) {
      typeFilter = `AND email_type = '${emailType.replace(/'/g, "''")}'`
    }

    // Get email summary by type
    const summaryResult = await db.query(
      `SELECT 
        email_type,
        COUNT(*) as total_sent,
        COUNT(opened_at) as total_opened,
        COUNT(clicked_at) as total_clicked,
        COUNT(CASE WHEN bounced = TRUE THEN 1 END) as total_bounced,
        ROUND(COUNT(opened_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as open_rate,
        ROUND(COUNT(clicked_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as click_rate
      FROM email_analytics
      WHERE 1=1 ${dateFilter} ${typeFilter}
      GROUP BY email_type
      ORDER BY total_sent DESC`
    )

    // Get campaign performance
    const campaignsResult = await db.query(
      `SELECT 
        campaign_id,
        name,
        subject,
        status,
        total_recipients,
        total_sent,
        total_opened,
        total_clicked,
        sent_at,
        created_at
      FROM email_campaigns
      WHERE 1=1 ${dateFilter}
      ORDER BY created_at DESC
      LIMIT 50`
    )

    // Get email performance over time
    const performanceOverTimeResult = await db.query(
      `SELECT 
        DATE(sent_at) as date,
        email_type,
        COUNT(*) as sent,
        COUNT(opened_at) as opened,
        COUNT(clicked_at) as clicked
      FROM email_analytics
      WHERE 1=1 ${dateFilter} ${typeFilter}
      GROUP BY DATE(sent_at), email_type
      ORDER BY date ASC`
    )

    return NextResponse.json({
      summary: summaryResult.rows,
      campaigns: campaignsResult.rows,
      performanceOverTime: performanceOverTimeResult.rows,
      period,
    })
  } catch (error: any) {
    console.error('[Admin Email Analytics] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch email analytics' },
      { status: 500 }
    )
  }
}

