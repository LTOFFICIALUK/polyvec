import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/analytics
 * Get general analytics (users, revenue, subscriptions, etc.)
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
    const period = searchParams.get('period') || '30d' // 7d, 30d, 90d, all
    const db = getDbPool()

    // Calculate date range
    let dateFilter = ''
    if (period === '7d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'"
    } else if (period === '30d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'"
    } else if (period === '90d') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'"
    }

    // Total users
    const totalUsersResult = await db.query('SELECT COUNT(*) as count FROM users')
    const totalUsers = parseInt(totalUsersResult.rows[0].count)

    // New users in period
    const newUsersResult = await db.query(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL '${period === 'all' ? '1000 days' : period.replace('d', ' days')}'`
    )
    const newUsers = parseInt(newUsersResult.rows[0].count)

    // Active users (logged in last 30 days)
    const activeUsersResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE last_login >= NOW() - INTERVAL '30 days'"
    )
    const activeUsers = parseInt(activeUsersResult.rows[0].count)

    // Pro users
    const proUsersResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE plan_tier = 'pro' AND is_active = TRUE"
    )
    const proUsers = parseInt(proUsersResult.rows[0].count)

    // Banned users
    const bannedUsersResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE is_banned = TRUE"
    )
    const bannedUsers = parseInt(bannedUsersResult.rows[0].count)

    // Revenue (from payments)
    const revenueResult = await db.query(
      `SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(*) as total_payments
      FROM payments 
      WHERE status = 'completed' ${dateFilter}`
    )
    const revenue = parseFloat(revenueResult.rows[0].total_revenue || '0') / 100 // Convert cents to dollars
    const totalPayments = parseInt(revenueResult.rows[0].total_payments || '0')

    // Active subscriptions
    const activeSubsResult = await db.query(
      "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"
    )
    const activeSubscriptions = parseInt(activeSubsResult.rows[0].count)

    // Failed payments
    const failedPaymentsResult = await db.query(
      `SELECT COUNT(*) as count FROM payments WHERE status = 'failed' ${dateFilter}`
    )
    const failedPayments = parseInt(failedPaymentsResult.rows[0].count)

    // User growth over time (last 30 days)
    const growthResult = await db.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC`
    )

    // Revenue over time (last 30 days)
    const revenueGrowthResult = await db.query(
      `SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(amount), 0) / 100.0 as revenue
      FROM payments
      WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC`
    )

    return NextResponse.json({
      overview: {
        totalUsers,
        newUsers,
        activeUsers,
        proUsers,
        bannedUsers,
        revenue,
        totalPayments,
        activeSubscriptions,
        failedPayments,
      },
      growth: {
        users: growthResult.rows,
        revenue: revenueGrowthResult.rows,
      },
      period,
    })
  } catch (error: any) {
    console.error('[Admin Analytics] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

