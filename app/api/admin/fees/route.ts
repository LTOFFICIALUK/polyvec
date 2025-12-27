import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/lib/db'
import { checkAdminAccess } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/fees
 * Get trading fees data for admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const adminCheck = await checkAdminAccess(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30d'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = (page - 1) * limit

    // Calculate date range based on period
    let dateFilter = ''
    const now = new Date()
    let startDate: Date

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case 'all':
        startDate = new Date(0) // Beginning of time
        break
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const db = getDbPool()

    // Get total fees summary
    const summaryResult = await db.query(
      `SELECT 
        COUNT(*) as total_fees,
        COUNT(*) FILTER (WHERE status = 'collected') as collected_fees,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_fees,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_fees,
        COALESCE(SUM(fee_amount) FILTER (WHERE status = 'collected'), 0) as total_collected,
        COALESCE(SUM(fee_amount) FILTER (WHERE status = 'failed'), 0) as total_failed,
        COALESCE(SUM(trade_amount) FILTER (WHERE status = 'collected'), 0) as total_trade_volume,
        COALESCE(AVG(fee_amount) FILTER (WHERE status = 'collected'), 0) as avg_fee
      FROM trading_fees
      WHERE created_at >= $1`,
      [startDate]
    )

    const summary = summaryResult.rows[0]

    // Get fees list with user info
    const feesResult = await db.query(
      `SELECT 
        tf.id,
        tf.user_id,
        tf.wallet_address,
        tf.trade_amount,
        tf.fee_amount,
        tf.fee_rate,
        tf.transaction_hash,
        tf.order_id,
        tf.token_id,
        tf.side,
        tf.shares,
        tf.price,
        tf.status,
        tf.created_at,
        tf.collected_at,
        u.email,
        u.username
      FROM trading_fees tf
      LEFT JOIN users u ON tf.user_id = u.id
      WHERE tf.created_at >= $1
      ORDER BY tf.created_at DESC
      LIMIT $2 OFFSET $3`,
      [startDate, limit, offset]
    )

    // Get total count for pagination
    const countResult = await db.query(
      `SELECT COUNT(*) as total
      FROM trading_fees
      WHERE created_at >= $1`,
      [startDate]
    )

    const total = parseInt(countResult.rows[0].total, 10)

    // Get daily fee collection chart data
    const dailyResult = await db.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as fee_count,
        SUM(fee_amount) FILTER (WHERE status = 'collected') as collected_amount,
        SUM(trade_amount) FILTER (WHERE status = 'collected') as trade_volume
      FROM trading_fees
      WHERE created_at >= $1 AND status = 'collected'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30`,
      [startDate]
    )

    return NextResponse.json({
      success: true,
      summary: {
        totalFees: parseInt(summary.total_fees, 10),
        collectedFees: parseInt(summary.collected_fees, 10),
        failedFees: parseInt(summary.failed_fees, 10),
        pendingFees: parseInt(summary.pending_fees, 10),
        totalCollected: parseFloat(summary.total_collected),
        totalFailed: parseFloat(summary.total_failed),
        totalTradeVolume: parseFloat(summary.total_trade_volume),
        avgFee: parseFloat(summary.avg_fee),
      },
      fees: feesResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        walletAddress: row.wallet_address,
        userEmail: row.email,
        username: row.username,
        tradeAmount: parseFloat(row.trade_amount),
        feeAmount: parseFloat(row.fee_amount),
        feeRate: parseFloat(row.fee_rate),
        transactionHash: row.transaction_hash,
        orderId: row.order_id,
        tokenId: row.token_id,
        side: row.side,
        shares: row.shares ? parseFloat(row.shares) : null,
        price: row.price ? parseFloat(row.price) : null,
        status: row.status,
        createdAt: row.created_at,
        collectedAt: row.collected_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      dailyData: dailyResult.rows.map((row) => ({
        date: row.date,
        feeCount: parseInt(row.fee_count, 10),
        collectedAmount: parseFloat(row.collected_amount || '0'),
        tradeVolume: parseFloat(row.trade_volume || '0'),
      })),
    })
  } catch (error: any) {
    console.error('[Admin Fees] Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch fees data',
      },
      { status: 500 }
    )
  }
}

