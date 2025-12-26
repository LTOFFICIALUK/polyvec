import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/lib/db'
import { jwtVerify } from 'jose'

export const dynamic = 'force-dynamic'
export const maxDuration = 5 // 5 second max execution time

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

interface MarketQuality {
  sampleSize: number
  outcomeDistribution: {
    upPercent: number
    downPercent: number
  }
  chopRate: number
  avgPeakMove: number
  volumeRatio: number
  verdict: 'Tradable' | 'Neutral' | 'Low Quality'
}

interface PersonalFit {
  winRateAsset: number | null
  winRateTimeframe: number | null
  avgPnLSimilar: number | null
  overtradeWarning: string | null
}

interface MarketInsightsResponse {
  marketQuality: MarketQuality
  personalFit: PersonalFit | null
}

/**
 * GET /api/market-insights
 * Get market insights for a specific market
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const marketId = searchParams.get('marketId')
    const asset = searchParams.get('asset') // BTC, ETH, SOL, XRP
    const timeframe = searchParams.get('timeframe') // 15m, 1h

    if (!marketId || !asset || !timeframe) {
      return NextResponse.json(
        { error: 'Missing required parameters: marketId, asset, timeframe' },
        { status: 400 }
      )
    }

    const db = getDbPool()

    // A. MARKET QUALITY - Fetch from cache (pre-computed on backend for instant access)
    // Use connection pooling and fast lookup with index
    const cacheStart = Date.now()
    const cacheResult = await Promise.race([
      db.query(
        `SELECT market_quality, updated_at
         FROM market_insights_cache
         WHERE asset = $1 AND timeframe = $2
         LIMIT 1`,
        [asset.toUpperCase(), timeframe]
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Cache query timeout')), 3000))
    ]) as any
    
    const cacheTime = Date.now() - cacheStart
    if (cacheTime > 1000) {
      console.warn(`[MarketInsights] Slow cache lookup: ${cacheTime}ms for ${asset} ${timeframe}`)
    }

    let marketQuality: MarketQuality

    if (cacheResult.rows.length > 0) {
      // Use cached data (instant - no JSONB processing!)
      const cached = cacheResult.rows[0].market_quality as any
      // Use cached verdict directly (no volume ratio adjustment needed)
      marketQuality = {
        sampleSize: cached.sampleSize || 0,
        outcomeDistribution: cached.outcomeDistribution || { upPercent: 0, downPercent: 0 },
        chopRate: cached.chopRate || 0,
        avgPeakMove: 0, // Removed per user request
        volumeRatio: 1, // Not used, but required by interface
        verdict: cached.verdict || 'Neutral',
      }
    } else {
      // Fallback: compute on-the-fly if cache miss (shouldn't happen if cron is running)
      console.warn(`[MarketInsights] Cache miss for ${asset} ${timeframe}, computing on-the-fly...`)
      
      const timeframeMinutes = timeframe === '1h' || timeframe === 'hourly' ? 60 : 15
      const durationTolerance = timeframeMinutes * 0.2

      const similarMarketsQuery = `
        WITH market_stats AS (
          SELECT 
            market_id,
            event_start,
            event_end,
            prices,
            jsonb_array_length(prices) as price_count,
            EXTRACT(EPOCH FROM (event_end - event_start)) / 60 as duration_minutes,
            ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY event_start DESC) as rn
          FROM price_events
          WHERE event_end < NOW() - INTERVAL '5 minutes'
            AND jsonb_array_length(prices) > 100
          GROUP BY market_id, event_start, event_end, prices
        )
        SELECT market_id, event_start, event_end, prices, price_count, duration_minutes
        FROM market_stats
        WHERE rn = 1
          AND ABS(duration_minutes - $1) <= $2
        ORDER BY event_end DESC
        LIMIT 25
      `

      const similarMarketsResult = await db.query(similarMarketsQuery, [
        timeframeMinutes,
        durationTolerance,
      ])
      const similarMarkets = similarMarketsResult.rows

      let upCount = 0
      let downCount = 0
      let chopCount = 0
      let totalPeakMove = 0
      let totalVolume = 0
      const CHOP_THRESHOLD = 5

      for (const market of similarMarkets) {
        const prices = market.prices as Array<{ t: number; yb: number; nb: number }>
        if (!prices || prices.length === 0) continue

        const firstPrice = prices[0]
        const lastPrice = prices[prices.length - 1]
        const firstUpPrice = firstPrice.yb / 100
        const lastUpPrice = lastPrice.yb / 100

        if (lastUpPrice > firstUpPrice) {
          upCount++
        } else if (lastUpPrice < firstUpPrice) {
          downCount++
        }

        let minPrice = firstUpPrice
        let maxPrice = firstUpPrice
        for (const p of prices) {
          const upPrice = p.yb / 100
          if (upPrice < minPrice) minPrice = upPrice
          if (upPrice > maxPrice) maxPrice = upPrice
        }
        const peakMove = (maxPrice - minPrice) * 100
        totalPeakMove += peakMove

        if (peakMove <= CHOP_THRESHOLD) {
          chopCount++
        }

        totalVolume += prices.length
      }

      const sampleSize = similarMarkets.length
      const outcomeDistribution = {
        upPercent: sampleSize > 0 ? (upCount / sampleSize) * 100 : 0,
        downPercent: sampleSize > 0 ? (downCount / sampleSize) * 100 : 0,
      }
      const chopRate = sampleSize > 0 ? (chopCount / sampleSize) * 100 : 0
      const avgPeakMove = sampleSize > 0 ? totalPeakMove / sampleSize : 0
      let verdict: 'Tradable' | 'Neutral' | 'Low Quality' = 'Neutral'
      if (sampleSize >= 10 && chopRate < 30 && avgPeakMove > 10) {
        verdict = 'Tradable'
      } else if (sampleSize < 5 || chopRate > 60 || avgPeakMove < 5) {
        verdict = 'Low Quality'
      }

      marketQuality = {
        sampleSize,
        outcomeDistribution,
        chopRate,
        avgPeakMove: 0, // Removed per user request
        volumeRatio: 1, // Not used, but required by interface
        verdict,
      }
    }

    // Timing Context removed per user request

    // C. PERSONAL FIT - Only if user is authenticated (optimized, non-blocking)
    // Run in parallel with timing context to avoid blocking
    let personalFit: PersonalFit | null = null
    
    const personalFitPromise = (async () => {
      try {
        const token = request.cookies.get('auth-token')?.value
        if (!token) return null

        const { payload } = await jwtVerify(token, secret)
        const userId = payload.userId as number

        // Optimized single query with indexes
        const personalFitQuery = `
          WITH user_wallet AS (
            SELECT wallet_address FROM users WHERE id = $1 LIMIT 1
          ),
          user_trades AS (
            SELECT 
              st.pnl,
              st.executed_at,
              st.market_id,
              s.asset,
              s.timeframe
            FROM strategy_trades st
            JOIN strategies s ON st.strategy_id = s.id
            CROSS JOIN user_wallet uw
            WHERE st.user_address = uw.wallet_address
              AND st.status = 'filled'
              AND st.pnl IS NOT NULL
            ORDER BY st.executed_at DESC
            LIMIT 500
          )
          SELECT 
            (SELECT COUNT(*)::float FROM user_trades WHERE asset = $2 AND pnl > 0) / 
              NULLIF((SELECT COUNT(*)::float FROM user_trades WHERE asset = $2), 0) * 100 as win_rate_asset,
            (SELECT COUNT(*)::float FROM user_trades WHERE (timeframe = $3 OR timeframe = $4) AND pnl > 0) / 
              NULLIF((SELECT COUNT(*)::float FROM user_trades WHERE timeframe = $3 OR timeframe = $4), 0) * 100 as win_rate_timeframe,
            (SELECT AVG(pnl) FROM user_trades WHERE asset = $2 AND (timeframe = $3 OR timeframe = $4)) as avg_pnl_similar,
            (SELECT COUNT(DISTINCT market_id) FROM user_trades WHERE executed_at > NOW() - INTERVAL '1 hour') as recent_markets_count
          FROM user_wallet
          LIMIT 1
        `

        const timeframeNormalized = timeframe === '1h' ? 'hourly' : '15m'
        const personalFitResult = await Promise.race([
          db.query(personalFitQuery, [userId, asset.toUpperCase(), timeframe, timeframeNormalized]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)) // 2 second timeout
        ]) as any

        if (personalFitResult.rows.length > 0) {
          const row = personalFitResult.rows[0]
          const recentMarketsCount = parseInt(row.recent_markets_count || '0')
          
          return {
            winRateAsset: row.win_rate_asset ? parseFloat(row.win_rate_asset) : null,
            winRateTimeframe: row.win_rate_timeframe ? parseFloat(row.win_rate_timeframe) : null,
            avgPnLSimilar: row.avg_pnl_similar ? parseFloat(row.avg_pnl_similar) : null,
            overtradeWarning: recentMarketsCount >= 5 
              ? `You've traded ${recentMarketsCount} markets in the last hour`
              : null,
          } as PersonalFit
        }
      } catch (error) {
        // Silently fail - personal fit is optional
        return null
      }
      return null
    })()

    // Wait for personal fit with timeout (don't block response)
    try {
      personalFit = await Promise.race([
        personalFitPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)) // 2 second max wait
      ])
    } catch (error) {
      // Ignore errors - personal fit is optional
      personalFit = null
    }

    const response: MarketInsightsResponse = {
      marketQuality,
      personalFit,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[MarketInsights API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch market insights' },
      { status: 500 }
    )
  }
}

