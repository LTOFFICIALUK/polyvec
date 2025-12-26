#!/usr/bin/env node

/**
 * Pre-compute market insights for all asset/timeframe combinations
 * This script runs directly on the VPS and accesses the database locally
 * Should be called via cron every 5 minutes
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '/root/polyvec/.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false, // Local connection, no SSL needed
})

const assets = ['BTC', 'ETH', 'SOL', 'XRP']
const timeframes = ['15m', '1h']

async function precomputeInsights() {
  console.log(`[${new Date().toISOString()}] Starting market insights pre-computation...`)
  
  let computedCount = 0
  let errorCount = 0

  for (const asset of assets) {
    for (const timeframe of timeframes) {
      try {
        console.log(`[${new Date().toISOString()}] Computing insights for ${asset} ${timeframe}...`)
        
        // Calculate timeframe duration in minutes
        const timeframeMinutes = timeframe === '1h' || timeframe === 'hourly' ? 60 : 15
        const durationTolerance = timeframeMinutes * 0.2 // 20% tolerance

        // Get last 25 similar markets (filtered by duration)
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

        const similarMarketsResult = await pool.query(similarMarketsQuery, [
          timeframeMinutes,
          durationTolerance,
        ])
        const similarMarkets = similarMarketsResult.rows

        // Analyze similar markets
        let upCount = 0
        let downCount = 0
        let chopCount = 0
        let totalPeakMove = 0
        let totalVolume = 0
        const CHOP_THRESHOLD = 5 // Markets that never moved > 5%

        for (const market of similarMarkets) {
          const prices = market.prices
          if (!prices || prices.length === 0) continue

          const firstPrice = prices[0]
          const lastPrice = prices[prices.length - 1]
          const firstUpPrice = firstPrice.yb / 100 // Convert from cents to 0-1
          const lastUpPrice = lastPrice.yb / 100

          // Determine outcome
          if (lastUpPrice > firstUpPrice) {
            upCount++
          } else if (lastUpPrice < firstUpPrice) {
            downCount++
          }

          // Calculate peak move
          let minPrice = firstUpPrice
          let maxPrice = firstUpPrice
          for (const p of prices) {
            const upPrice = p.yb / 100
            if (upPrice < minPrice) minPrice = upPrice
            if (upPrice > maxPrice) maxPrice = upPrice
          }
          const peakMove = (maxPrice - minPrice) * 100 // Convert to percentage
          totalPeakMove += peakMove

          // Check for chop (never moved > X%)
          if (peakMove <= CHOP_THRESHOLD) {
            chopCount++
          }

          // Estimate volume (use price count as proxy)
          totalVolume += prices.length
        }

        const sampleSize = similarMarkets.length
        const outcomeDistribution = {
          upPercent: sampleSize > 0 ? (upCount / sampleSize) * 100 : 0,
          downPercent: sampleSize > 0 ? (downCount / sampleSize) * 100 : 0,
        }
        const chopRate = sampleSize > 0 ? (chopCount / sampleSize) * 100 : 0
        const avgPeakMove = sampleSize > 0 ? totalPeakMove / sampleSize : 0
        const avgVolume = sampleSize > 0 ? totalVolume / sampleSize : 0

        // Determine verdict
        let verdict = 'Neutral'
        if (sampleSize >= 10 && chopRate < 30 && avgPeakMove > 10) {
          verdict = 'Tradable'
        } else if (sampleSize < 5 || chopRate > 60 || avgPeakMove < 5) {
          verdict = 'Low Quality'
        }

        const marketQuality = {
          sampleSize,
          outcomeDistribution,
          chopRate,
          avgPeakMove,
          avgVolume, // Store avg volume for volume ratio calculation
          verdict,
        }

        // Upsert cache entry
        await pool.query(
          `INSERT INTO market_insights_cache (asset, timeframe, market_quality, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (asset, timeframe)
           DO UPDATE SET 
             market_quality = EXCLUDED.market_quality,
             updated_at = NOW()`,
          [asset, timeframe, JSON.stringify(marketQuality)]
        )

        computedCount++
        console.log(`[${new Date().toISOString()}] ✅ Completed ${asset} ${timeframe}`)
      } catch (error) {
        errorCount++
        console.error(`[${new Date().toISOString()}] ❌ Error computing ${asset} ${timeframe}:`, error.message)
      }
    }
  }

  console.log(`[${new Date().toISOString()}] ✅ Pre-computation complete: ${computedCount} computed, ${errorCount} errors`)
  await pool.end()
  process.exit(errorCount > 0 ? 1 : 0)
}

// Run the pre-computation
precomputeInsights().catch((error) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, error)
  process.exit(1)
})

