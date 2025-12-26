import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/analytics/markets
 * Get market analytics (trading volume, popular markets, etc.)
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

    // Get trading statistics from payments
    // Note: This uses payment data. For detailed trade analytics, you'd need to store trades in database
    const tradingStatsResult = await db.query(
      `SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount), 0) / 100.0 as total_volume
      FROM payments
      WHERE status = 'completed' ${dateFilter}`
    )

    // Get subscription revenue (main revenue source)
    const subscriptionRevenueResult = await db.query(
      `SELECT 
        COALESCE(SUM(amount), 0) / 100.0 as revenue
      FROM payments
      WHERE reason IN ('upgrade', 'subscription_renewal') AND status = 'completed' ${dateFilter}`
    )

    // Get popular markets from metadata if available
    // This aggregates any market data stored in payment metadata
    const popularMarketsResult = await db.query(
      `SELECT 
        COALESCE(metadata->>'market', metadata->>'slug', 'Unknown') as market,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) / 100.0 as volume
      FROM payments
      WHERE status = 'completed' ${dateFilter}
        AND metadata IS NOT NULL
        AND (metadata->>'market' IS NOT NULL OR metadata->>'slug' IS NOT NULL)
      GROUP BY COALESCE(metadata->>'market', metadata->>'slug', 'Unknown')
      ORDER BY transaction_count DESC
      LIMIT 20`
    )

    return NextResponse.json({
      trading: {
        totalTransactions: parseInt(tradingStatsResult.rows[0]?.total_transactions || '0'),
        totalVolume: parseFloat(tradingStatsResult.rows[0]?.total_volume || '0'),
        subscriptionRevenue: parseFloat(subscriptionRevenueResult.rows[0]?.revenue || '0'),
      },
      popularMarkets: popularMarketsResult.rows.filter(m => m.market !== 'Unknown'),
      period,
      note: 'Market analytics based on payment data. For detailed trade analytics, consider storing trades in database.',
    })
  } catch (error: any) {
    console.error('[Admin Market Analytics] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch market analytics' },
      { status: 500 }
    )
  }
}

