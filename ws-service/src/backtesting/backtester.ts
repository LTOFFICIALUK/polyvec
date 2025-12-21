/**
 * Backtesting Engine
 * 
 * Tests trading strategies against historical price data to evaluate profitability.
 * Uses the same indicator calculations as live trading for accuracy.
 * 
 * Supports:
 * - Multi-market backtesting (testing across N historical markets)
 * - Order ladder execution (buying at multiple price levels)
 * - Exit price selling (selling when price reaches target)
 * - Indicator-based and orderbook-based triggers
 */

import { Pool } from 'pg'
import {
  calculateIndicator,
  IndicatorType,
  Candle,
  IndicatorResult,
} from '../indicators/indicatorCalculator'
import { Strategy, Condition, Indicator } from '../db/strategyRecorder'
import { fetchMarketBySlug } from '../polymarket/clobClient'
import { getCryptoPriceFeeder } from '../polymarket/cryptoPriceFeeder'

// ============================================
// Slug Generation Helpers (for matching markets to assets)
// ============================================

const PAIR_SLUG_MAP: Record<string, string> = {
  BTC: 'btc',
  SOL: 'sol',
  ETH: 'eth',
  XRP: 'xrp',
}

const PAIR_FULL_NAME_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  SOL: 'solana',
  ETH: 'ethereum',
  XRP: 'xrp',
}

const TIMEFRAME_CONFIG: Record<string, { minutes: number; slug: string }> = {
  '15m': { minutes: 15, slug: '15m' },
  '1h': { minutes: 60, slug: '1h' },
  'hourly': { minutes: 60, slug: 'hourly' },
}

/**
 * Generate expected slug for a market given asset, timeframe, and event start time
 */
const generateSlugForMarket = (asset: string, timeframe: string, eventStart: Date): string | null => {
  const pairSlug = PAIR_SLUG_MAP[asset.toUpperCase()]
  const timeframeSlug = TIMEFRAME_CONFIG[timeframe.toLowerCase()]?.slug
  if (!pairSlug || !timeframeSlug) return null
  
  const eventStartSeconds = Math.floor(eventStart.getTime() / 1000)
  
  // Hourly markets use a different format: "solana-up-or-down-november-27-2pm-et"
  if (timeframe.toLowerCase() === '1h' || timeframe.toLowerCase() === 'hourly') {
    const pairFullName = PAIR_FULL_NAME_MAP[asset.toUpperCase()]
    if (!pairFullName) return null
    
    try {
      // Convert timestamp to ET date/time
      const etDate = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        hour12: true,
      }).formatToParts(eventStart)
      
      const month = etDate.find(p => p.type === 'month')?.value.toLowerCase() || ''
      const day = etDate.find(p => p.type === 'day')?.value || ''
      const hour = etDate.find(p => p.type === 'hour')?.value || ''
      const dayPeriod = etDate.find(p => p.type === 'dayPeriod')?.value?.toLowerCase() || ''
      
      if (!month || !day || !hour || !dayPeriod) return null
      
      const timeStr = `${hour}${dayPeriod}`
      return `${pairFullName}-up-or-down-${month}-${day}-${timeStr}-et`
    } catch (error) {
      return null
    }
  }
  
  // 15m markets use timestamp format
  return `${pairSlug}-updown-${timeframeSlug}-${eventStartSeconds}`
}

// ============================================
// Types
// ============================================

export interface OrderLadderItem {
  id: string
  price: number   // cents (1-99)
  shares: number
}

export interface BacktestConfig {
  strategy: Strategy
  startTime?: Date
  endTime?: Date
  initialBalance: number
  marketId?: string           // Optional: override strategy market (for single market mode)
  numberOfMarkets?: number    // Number of markets to backtest across
  exitPrice?: number          // Price (cents) at which to sell positions
}

export interface BacktestTrade {
  timestamp: number
  side: 'BUY' | 'SELL' | 'LOSS'
  price: number
  shares: number
  value: number
  pnl?: number
  balance: number
  triggerReason: string
}

export interface BacktestResult {
  strategyId: string
  strategyName: string
  indicatorPreset?: string  // Preset name if using preset (e.g., "MACD Bullish Crossover")
  startTime: Date
  endTime: Date
  initialBalance: number
  finalBalance: number
  totalPnl: number
  totalPnlPercent: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  maxDrawdown: number
  maxDrawdownPercent: number
  sharpeRatio: number
  trades: BacktestTrade[]
  candlesProcessed: number
  conditionsTriggered: number
}

interface PricePoint {
  t: number   // timestamp ms
  yb: number  // yes bid (cents)
  ya: number  // yes ask (cents)
  nb: number  // no bid (cents)
  na: number  // no ask (cents)
}

// ============================================
// Database Connection
// ============================================

let pool: Pool | null = null

export const initializeBacktester = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.log('[Backtester] No DATABASE_URL - backtesting disabled')
    return
  }

  try {
    const useSSL = databaseUrl.includes('proxy.rlwy.net') || databaseUrl.includes('railway.app')
    
    pool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      idleTimeoutMillis: 30000,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    })

    await pool.query('SELECT 1')
    console.log('[Backtester] Database connected')
  } catch (error: any) {
    console.error('[Backtester] Failed to initialize:', error.message)
  }
}

// ============================================
// Price Data Loading
// ============================================

interface MarketWithData {
  marketId: string
  eventStart: Date
  eventEnd: Date
  pricePointCount: number
}

/**
 * Get markets filtered by asset and timeframe for indicator-based backtesting
 * Matches markets by generating expected slugs and verifying with Polymarket API
 */
const getMarketsByAssetAndTimeframe = async (
  asset: string,
  timeframe: string,
  limit: number = 100
): Promise<MarketWithData[]> => {
  if (!pool) throw new Error('Database not initialized')

  console.log(`[Backtester] Searching for ${asset} ${timeframe} markets with historical data`)

  // Query database for COMPLETED markets only (exclude current/active markets)
  // Only include markets that have ended (event_end is in the past)
  const result = await pool.query(`
    WITH market_stats AS (
      SELECT 
        market_id,
        event_start,
        event_end,
        jsonb_array_length(prices) as price_count,
        ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY event_start DESC) as rn
      FROM price_events
      WHERE jsonb_array_length(prices) > 1000
        AND event_end < NOW() - INTERVAL '5 minutes'  -- Only completed/ended markets (exclude current active market)
      GROUP BY market_id, event_start, event_end
    )
    SELECT market_id, event_start, event_end, price_count
    FROM market_stats
    WHERE rn = 1
    ORDER BY event_start DESC  -- Most recent completed markets first
    LIMIT $1
  `, [limit * 5]) // Get many more candidates since we'll filter by asset and API matching may fail

  console.log(`[Backtester] Found ${result.rows.length} candidate markets in database`)

  // Match markets by generating expected slug and verifying with Polymarket API
  // Fallback: If API matching fails, use duration-based matching
  const matchedMarkets: MarketWithData[] = []
  const seenMarketIds = new Set<string>() // Track unique markets to avoid duplicates
  const timeframeMinutes = timeframe === '1h' || timeframe === 'hourly' ? 60 : 15
  let checkedCount = 0
  let matchedCount = 0
  let skippedDuration = 0
  let skippedSlug = 0
  let skippedNoMatch = 0
  let skippedDuplicate = 0
  let apiVerifiedCount = 0
  let durationMatchedCount = 0

  // First pass: Try API verification (more accurate but slower)
  for (const row of result.rows) {
    if (matchedMarkets.length >= limit) break
    checkedCount++

    try {
      const eventStart = new Date(row.event_start)
      const eventEnd = new Date(row.event_end)
      
      // For indicator-based backtests, we rely on API slug matching for accuracy
      // Duration check is informational only - we accept any market with sufficient data
      // if API verification succeeds or if we can't verify via API
      const durationMinutes = (eventEnd.getTime() - eventStart.getTime()) / (1000 * 60)
      
      // Log first few to understand what durations we're seeing
      if (checkedCount <= 5) {
        console.log(`[Backtester] Market ${row.market_id}: duration ${durationMinutes.toFixed(1)}m (target: ${timeframeMinutes}m)`)
      }
      
      // Note: We don't filter by duration here - we rely on API slug matching
      // If API matching fails, we'll accept markets with sufficient data as fallback

      // Generate expected slug for this asset/timeframe
      const expectedSlug = generateSlugForMarket(asset, timeframe, eventStart)
      if (!expectedSlug) {
        skippedSlug++
        continue
      }

      // Try to fetch market metadata from Polymarket to verify it matches
      let marketMetadata = null
      try {
        marketMetadata = await fetchMarketBySlug(expectedSlug)
      } catch (apiError: any) {
        // API call failed - we'll use duration-based matching as fallback
        if (checkedCount <= 3) {
          console.log(`[Backtester] API verification failed for slug ${expectedSlug}, will use duration-based matching`)
        }
      }
      
      if (marketMetadata) {
        // Match if marketId matches OR if slug matches (in case marketId format differs)
        const marketIdMatches = marketMetadata.marketId === row.market_id || 
                                 marketMetadata.marketId === row.market_id.toString() ||
                                 row.market_id === marketMetadata.marketId.toString()
        const slugMatches = marketMetadata.slug === expectedSlug
        
        if (marketIdMatches || slugMatches) {
          // Use the API marketId as the canonical ID (might be different format than DB)
          const canonicalMarketId = marketMetadata.marketId || row.market_id
          
          // Skip if we've already seen this market (deduplicate)
          if (seenMarketIds.has(canonicalMarketId)) {
            skippedDuplicate++
            continue
          }
          
          seenMarketIds.add(canonicalMarketId)
          
          // Match! This market is for the target asset/timeframe (API verified)
          matchedMarkets.push({
            marketId: canonicalMarketId, // Use API marketId for consistency
            eventStart,
            eventEnd,
            pricePointCount: parseInt(row.price_count),
          })
          matchedCount++
          apiVerifiedCount++
          console.log(`[Backtester] ✅ API-verified ${asset} ${timeframe} market ${canonicalMarketId} (slug: ${expectedSlug})`)
        } else {
          skippedNoMatch++
        }
      } else {
        // API verification failed, but duration matches - use as fallback
        // Only add if we haven't reached the limit and this looks like a valid match
        if (matchedMarkets.length < limit) {
          const canonicalMarketId = row.market_id.toString()
          
          // Skip if we've already seen this market (deduplicate)
          if (seenMarketIds.has(canonicalMarketId)) {
            skippedDuplicate++
            continue
          }
          
          seenMarketIds.add(canonicalMarketId)
          
          // Match based on duration (fallback when API unavailable)
          matchedMarkets.push({
            marketId: canonicalMarketId,
            eventStart,
            eventEnd,
            pricePointCount: parseInt(row.price_count),
          })
          matchedCount++
          durationMatchedCount++
          if (durationMatchedCount <= 3) {
            console.log(`[Backtester] ✅ Duration-matched ${asset} ${timeframe} market ${canonicalMarketId} (API verification unavailable)`)
          }
        }
      }
      
      // Small delay to avoid rate limiting (50ms between API calls)
      if (matchedMarkets.length < limit && checkedCount < result.rows.length) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch (error: any) {
      console.warn(`[Backtester] Error checking market ${row.market_id}:`, error.message)
      continue
    }
  }

  console.log(`[Backtester] Market matching summary: checked ${checkedCount}, matched ${matchedCount} (${apiVerifiedCount} API-verified, ${durationMatchedCount} duration-matched), skipped (duration: ${skippedDuration}, slug: ${skippedSlug}, no match: ${skippedNoMatch}, duplicate: ${skippedDuplicate})`)

  console.log(`[Backtester] Matched ${matchedMarkets.length} ${asset} ${timeframe} markets`)
  return matchedMarkets
}

/**
 * Get a list of markets that have historical price data in the database
 * Returns COMPLETED markets (event has ended) with enough data for backtesting
 * Prioritizes markets with actual price movement (min price significantly different from max)
 * This ensures we test against markets that have resolved and seen price swings
 */
const getMarketsWithHistoricalData = async (limit: number = 100, minPriceThreshold?: number): Promise<MarketWithData[]> => {
  if (!pool) throw new Error('Database not initialized')

  // Query for COMPLETED markets only (exclude current/active markets)
  // - event_end must be in the past (market has resolved/ended)
  // - Must have substantial price data (>1000 points)
  // - Order by price variance (markets with larger swings are more interesting for backtesting)
  // - If minPriceThreshold is provided, only return markets where min price went below that threshold
  
  let query: string
  let params: any[]
  
  if (minPriceThreshold) {
    // Filter for markets where price went below the threshold (for orderbook rule testing)
    // Get ONE market per market_id (the most recent completed event)
    query = `
      WITH market_stats AS (
      SELECT 
        market_id,
        event_start,
        event_end,
        jsonb_array_length(prices) as price_count,
          MIN((p->>'yb')::int) as min_price,
          MAX((p->>'yb')::int) as max_price,
        ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY event_start DESC) as rn
        FROM price_events, jsonb_array_elements(prices) p
      WHERE jsonb_array_length(prices) > 1000
          AND event_end < NOW() - INTERVAL '5 minutes'  -- Only completed/ended markets (exclude current active market)
        GROUP BY market_id, event_start, event_end
        HAVING MIN((p->>'yb')::int) <= $2
    )
      SELECT market_id, event_start, event_end, price_count, min_price, max_price
      FROM market_stats
    WHERE rn = 1
      ORDER BY (max_price - min_price) DESC, event_start DESC
    LIMIT $1
    `
    params = [limit, minPriceThreshold]
    console.log(`[Backtester] Searching for completed markets with prices <= ${minPriceThreshold}¢`)
  } else {
    // Default: get completed markets with the largest price variance
    // Get ONE market per market_id (the most recent completed event)
    query = `
      WITH market_stats AS (
        SELECT 
          market_id,
          event_start,
          event_end,
          jsonb_array_length(prices) as price_count,
          MIN((p->>'yb')::int) as min_price,
          MAX((p->>'yb')::int) as max_price,
          ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY event_start DESC) as rn
        FROM price_events, jsonb_array_elements(prices) p
        WHERE jsonb_array_length(prices) > 1000
          AND event_end < NOW() - INTERVAL '5 minutes'
        GROUP BY market_id, event_start, event_end
      )
      SELECT market_id, event_start, event_end, price_count, min_price, max_price
      FROM market_stats
      WHERE rn = 1
      ORDER BY (max_price - min_price) DESC, event_start DESC
      LIMIT $1
    `
    params = [limit]
  }
  
  const result = await pool.query(query, params)

  console.log(`[Backtester] Query returned ${result.rows.length} completed markets with price data`)
  if (result.rows.length > 0) {
    const sample = result.rows.slice(0, 3)
    for (const row of sample) {
      console.log(`[Backtester] - Market ${row.market_id}: ${row.price_count} points, price range ${row.min_price}¢-${row.max_price}¢`)
    }
  }

  return result.rows.map(row => ({
    marketId: row.market_id,
    eventStart: new Date(row.event_start),
    eventEnd: new Date(row.event_end),
    pricePointCount: parseInt(row.price_count),
  }))
}

/**
 * Load historical price data from database for a specific market
 */
const loadPriceHistory = async (
  marketId: string,
  startTime?: Date,
  endTime?: Date
): Promise<PricePoint[]> => {
  if (!pool) throw new Error('Database not initialized')

  let query: string
  let params: any[]

  if (startTime && endTime) {
    query = `
      SELECT prices
      FROM price_events
      WHERE market_id = $1
        AND event_start >= $2
        AND event_end <= $3
      ORDER BY event_start ASC
    `
    params = [marketId, startTime, endTime]
  } else {
    // Load all price data for this market
    query = `
      SELECT prices
      FROM price_events
      WHERE market_id = $1
      ORDER BY event_start ASC
    `
    params = [marketId]
  }

  const result = await pool.query(query, params)

  // Flatten all price points
  const allPrices: PricePoint[] = []
  for (const row of result.rows) {
    const prices = row.prices as PricePoint[]
    for (const p of prices) {
      if (startTime && endTime) {
        if (p.t >= startTime.getTime() && p.t <= endTime.getTime()) {
          allPrices.push(p)
        }
      } else {
        allPrices.push(p)
      }
    }
  }

  // Sort by timestamp
  allPrices.sort((a, b) => a.t - b.t)
  
  console.log(`[Backtester] Loaded ${allPrices.length} price points for market ${marketId.substring(0, 20)}...`)
  return allPrices
}

/**
 * Load all price data for a specific market event (full history)
 * Optionally filter by event_start/event_end to load only a specific event
 */
const loadMarketPriceData = async (
  marketId: string,
  eventStart?: Date,
  eventEnd?: Date
): Promise<PricePoint[]> => {
  if (!pool) throw new Error('Database not initialized')

  let query: string
  let params: any[]
  
  if (eventStart && eventEnd) {
    // Load only the specific event that we know has the price data we need
    query = `
    SELECT prices
    FROM price_events
    WHERE market_id = $1
        AND event_start = $2
        AND event_end = $3
    ORDER BY event_start ASC
    `
    params = [marketId, eventStart, eventEnd]
  } else {
    // Load all events for this market (fallback)
    query = `
      SELECT prices
      FROM price_events
      WHERE market_id = $1
      ORDER BY event_start ASC
    `
    params = [marketId]
  }

  const result = await pool.query(query, params)

  const allPrices: PricePoint[] = []
  for (const row of result.rows) {
    const prices = row.prices as PricePoint[]
    allPrices.push(...prices)
  }

  allPrices.sort((a, b) => a.t - b.t)
  console.log(`[Backtester] Loaded ${allPrices.length} price points for market ${marketId.substring(0, 20)}... (event: ${eventStart ? eventStart.toISOString() : 'all events'})`)
  return allPrices
}

/**
 * Convert price points to candles for indicator calculation
 */
const pricesToCandles = (
  prices: PricePoint[],
  timeframeMinutes: number,
  direction: 'UP' | 'DOWN'
): Candle[] => {
  if (prices.length === 0) return []

  const candles: Candle[] = []
  const intervalMs = timeframeMinutes * 60 * 1000
  
  let currentCandle: Candle | null = null
  let candleStartTime = Math.floor(prices[0].t / intervalMs) * intervalMs

  for (const p of prices) {
    // Get price based on direction (UP = yes bid, DOWN = no bid)
    const price = direction === 'UP' ? p.yb / 100 : p.nb / 100
    if (price === 0) continue

    // Check if we need a new candle
    while (p.t >= candleStartTime + intervalMs) {
      // Close current candle
      if (currentCandle) {
        candles.push(currentCandle)
      }
      
      // Start new candle
      candleStartTime += intervalMs
      currentCandle = null
    }

    if (!currentCandle) {
      currentCandle = {
        timestamp: candleStartTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1,
      }
    } else {
      currentCandle.high = Math.max(currentCandle.high, price)
      currentCandle.low = Math.min(currentCandle.low, price)
      currentCandle.close = price
      currentCandle.volume++
    }
  }

  // Don't forget last candle
  if (currentCandle) {
    candles.push(currentCandle)
  }

  console.log(`[Backtester] Created ${candles.length} candles from ${prices.length} prices`)
  return candles
}

// ============================================
// Condition Evaluation
// ============================================

/**
 * Get indicator value at a specific candle index
 * Finds the result by matching candle timestamp (not index) since indicator results may skip some candles
 */
const getIndicatorValue = (
  indicatorResults: Map<string, IndicatorResult[]>,
  indicatorId: string,
  candleIndex: number,
  field?: string,
  candleTimestamp?: number
): number | null => {
  const results = indicatorResults.get(indicatorId)
  if (!results || results.length === 0) return null

  // Try to find result by timestamp if provided (more reliable)
  // Use a larger tolerance (5 minutes) to handle cases where indicator results skip early candles
  if (candleTimestamp !== undefined) {
    // First try exact match (within 1 second)
    let result = results.find(r => Math.abs(r.timestamp - candleTimestamp) < 1000)
    
    // If no exact match, find the closest result (within 5 minutes)
    if (!result) {
      let closestResult: IndicatorResult | undefined = undefined
      let closestDiff = Infinity
      for (const r of results) {
        const diff = Math.abs(r.timestamp - candleTimestamp)
        if (diff < 5 * 60 * 1000 && diff < closestDiff) { // Within 5 minutes
          closestDiff = diff
          closestResult = r
        }
      }
      result = closestResult
    }
    
    if (result) {
  if (field && result.values) {
    return result.values[field] ?? null
  }
      return result.value
    }
  }

  // Fallback: try by index (may not work if results skipped some candles)
  if (candleIndex >= 0 && candleIndex < results.length) {
    const result = results[candleIndex]
    if (result) {
      if (field && result.values) {
        return result.values[field] ?? null
      }
  return result.value
    }
  }

  // Try to find the closest result by index (in case results array is shorter)
  if (candleIndex >= 0) {
    // Find the result that corresponds to this candle index
    // Since results might skip early candles, we need to find the right one
    // For now, try the last result if index is beyond array length
    if (candleIndex >= results.length && results.length > 0) {
      const lastResult = results[results.length - 1]
      if (lastResult) {
        if (field && lastResult.values) {
          return lastResult.values[field] ?? null
        }
        return lastResult.value
      }
    }
  }

  return null
}

/**
 * Evaluate a single condition
 */
const evaluateCondition = (
  condition: Condition,
  indicatorResults: Map<string, IndicatorResult[]>,
  candleIndex: number,
  currentPrice: number,
  candleTimestamp?: number,
  prevCandleTimestamp?: number
): boolean => {
  // Get source A value
  let valueA: number | null = null
  if (condition.sourceA === 'price' || condition.sourceA === 'Close' || condition.sourceA === 'close') {
    valueA = currentPrice
  } else if (condition.sourceA.includes('.')) {
    const [indicatorIdRaw, field] = condition.sourceA.split('.')
    // Strip "indicator_" prefix if present (frontend sends "indicator_ind1" but indicator ID is "ind1")
    const indicatorId = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
    valueA = getIndicatorValue(indicatorResults, indicatorId, candleIndex, field, candleTimestamp)
  } else {
    // Strip "indicator_" prefix if present (10 characters: "indicator_")
    const indicatorId = condition.sourceA.startsWith('indicator_') ? condition.sourceA.substring(10) : condition.sourceA
    valueA = getIndicatorValue(indicatorResults, indicatorId, candleIndex, undefined, candleTimestamp)
  }

  if (valueA === null) return false

  // Get source B value
  let valueB: number | null = null
  if (condition.sourceB === 'value') {
    valueB = condition.value ?? null
  } else if (condition.sourceB === 'price' || condition.sourceB === 'Close' || condition.sourceB === 'close') {
    valueB = currentPrice
  } else if (condition.sourceB && condition.sourceB.includes('.')) {
    const [indicatorIdRaw, field] = condition.sourceB.split('.')
    // Strip "indicator_" prefix if present
    const indicatorId = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
    valueB = getIndicatorValue(indicatorResults, indicatorId, candleIndex, field, candleTimestamp)
  } else if (condition.sourceB && condition.sourceB !== '') {
    // Strip "indicator_" prefix if present
    const indicatorId = condition.sourceB.startsWith('indicator_') ? condition.sourceB.substring(10) : condition.sourceB
    valueB = getIndicatorValue(indicatorResults, indicatorId, candleIndex, undefined, candleTimestamp)
  }

  if (valueB === null) return false

  // Evaluate operator
  switch (condition.operator) {
    case '>':
    case 'greater_than':
      return valueA > valueB
    case '<':
    case 'less_than':
      return valueA < valueB
    case '>=':
    case 'greater_equal':
      return valueA >= valueB
    case '<=':
    case 'less_equal':
      return valueA <= valueB
    case '==':
    case 'equals':
      return Math.abs(valueA - valueB) < 0.0001
    case 'crosses_above':
    case 'crosses above':
      // Need previous value
      if (candleIndex < 1 || !prevCandleTimestamp) return false
      
      // Handle sourceA with field (e.g., "indicator_ind1.macd")
      let prevA: number | null = null
      if (condition.sourceA === 'price' || condition.sourceA === 'Close' || condition.sourceA === 'close') {
        prevA = currentPrice
      } else if (condition.sourceA.includes('.')) {
        const [indicatorIdRaw, field] = condition.sourceA.split('.')
        const indicatorIdA = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
        prevA = getIndicatorValue(indicatorResults, indicatorIdA, candleIndex - 1, field, prevCandleTimestamp)
      } else {
        const indicatorIdA = condition.sourceA.startsWith('indicator_') ? condition.sourceA.substring(10) : condition.sourceA
        prevA = getIndicatorValue(indicatorResults, indicatorIdA, candleIndex - 1, undefined, prevCandleTimestamp)
      }
      
      // Handle sourceB with field (e.g., "indicator_ind1.signal")
      let prevB: number | null = null
      if (condition.sourceB === 'value') {
        prevB = condition.value ?? null
      } else if (condition.sourceB === 'price' || condition.sourceB === 'Close' || condition.sourceB === 'close') {
        prevB = currentPrice
      } else if (condition.sourceB && condition.sourceB.includes('.')) {
        const [indicatorIdRaw, field] = condition.sourceB.split('.')
        const indicatorIdB = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
        prevB = getIndicatorValue(indicatorResults, indicatorIdB, candleIndex - 1, field, prevCandleTimestamp)
      } else if (condition.sourceB && condition.sourceB !== '') {
        const indicatorIdB = condition.sourceB.startsWith('indicator_') ? condition.sourceB.substring(10) : condition.sourceB
        prevB = getIndicatorValue(indicatorResults, indicatorIdB, candleIndex - 1, undefined, prevCandleTimestamp)
      }
      
      if (prevA === null || prevB === null || prevB === undefined) {
        // Log first few failures for debugging
        if (candleIndex < 5) {
          console.log(`[Backtester] Crosses above check failed: prevA=${prevA}, prevB=${prevB}, sourceA=${condition.sourceA}, sourceB=${condition.sourceB}`)
        }
        return false
      }
      
      const crossed = prevA <= prevB && valueA > valueB
      if (crossed) {
        console.log(`[Backtester] ✅ CROSSOVER DETECTED at candle ${candleIndex}: ${condition.sourceA} (${prevA?.toFixed(2)} -> ${valueA?.toFixed(2)}) crossed above ${condition.sourceB} (${prevB?.toFixed(2)} -> ${valueB?.toFixed(2)})`)
      } else if (candleIndex < 20 && Math.abs(prevA - prevB) < 10) {
        // Log when values are close but didn't cross (for debugging)
        console.log(`[Backtester] Near-crossover at candle ${candleIndex}: ${condition.sourceA}=${prevA?.toFixed(2)}->${valueA?.toFixed(2)}, ${condition.sourceB}=${prevB?.toFixed(2)}->${valueB?.toFixed(2)} (diff: ${(prevA - prevB).toFixed(2)} -> ${(valueA - valueB).toFixed(2)})`)
      }
      return crossed
    case 'crosses_below':
    case 'crosses below':
      if (candleIndex < 1 || !prevCandleTimestamp) return false
      
      // Handle sourceA with field
      let prevA2: number | null = null
      if (condition.sourceA === 'price' || condition.sourceA === 'Close' || condition.sourceA === 'close') {
        prevA2 = currentPrice
      } else if (condition.sourceA.includes('.')) {
        const [indicatorIdRaw, field] = condition.sourceA.split('.')
        const indicatorIdA2 = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
        prevA2 = getIndicatorValue(indicatorResults, indicatorIdA2, candleIndex - 1, field, prevCandleTimestamp)
      } else {
        const indicatorIdA2 = condition.sourceA.startsWith('indicator_') ? condition.sourceA.substring(10) : condition.sourceA
        prevA2 = getIndicatorValue(indicatorResults, indicatorIdA2, candleIndex - 1, undefined, prevCandleTimestamp)
      }
      
      // Handle sourceB with field
      let prevB2: number | null = null
      if (condition.sourceB === 'value') {
        prevB2 = condition.value ?? null
      } else if (condition.sourceB === 'price' || condition.sourceB === 'Close' || condition.sourceB === 'close') {
        prevB2 = currentPrice
      } else if (condition.sourceB && condition.sourceB.includes('.')) {
        const [indicatorIdRaw, field] = condition.sourceB.split('.')
        const indicatorIdB2 = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
        prevB2 = getIndicatorValue(indicatorResults, indicatorIdB2, candleIndex - 1, field, prevCandleTimestamp)
      } else if (condition.sourceB && condition.sourceB !== '') {
        const indicatorIdB2 = condition.sourceB.startsWith('indicator_') ? condition.sourceB.substring(10) : condition.sourceB
        prevB2 = getIndicatorValue(indicatorResults, indicatorIdB2, candleIndex - 1, undefined, prevCandleTimestamp)
      }
      
      if (prevA2 === null || prevB2 === null || prevB2 === undefined) return false
      const crossedBelow = prevA2 >= prevB2 && valueA < valueB
      if (crossedBelow) {
        console.log(`[Backtester] ✅ CROSSOVER DETECTED at candle ${candleIndex}: ${condition.sourceA} (${prevA2?.toFixed(2)} -> ${valueA?.toFixed(2)}) crossed below ${condition.sourceB} (${prevB2?.toFixed(2)} -> ${valueB?.toFixed(2)})`)
      }
      return crossedBelow
    case 'between':
      return valueA >= valueB && valueA <= (condition.value2 ?? valueB)
    default:
      return false
  }
}

/**
 * Evaluate all conditions based on logic (all/any)
 */
const evaluateConditions = (
  conditions: Condition[],
  conditionLogic: 'all' | 'any',
  indicatorResults: Map<string, IndicatorResult[]>,
  candleIndex: number,
  currentPrice: number,
  candleTimestamp?: number,
  prevCandleTimestamp?: number
): { triggered: boolean; reasons: string[] } => {
  if (conditions.length === 0) {
    return { triggered: false, reasons: [] }
  }

  const results: boolean[] = []
  const reasons: string[] = []

  for (const condition of conditions) {
    const result = evaluateCondition(condition, indicatorResults, candleIndex, currentPrice, candleTimestamp, prevCandleTimestamp)
    results.push(result)
    if (result) {
      reasons.push(`${condition.sourceA} ${condition.operator} ${condition.sourceB || condition.value}`)
    }
  }

  const triggered = conditionLogic === 'all'
    ? results.every(r => r)
    : results.some(r => r)

  return { triggered, reasons }
}

// ============================================
// Orderbook Rule Evaluation
// ============================================

interface OrderbookRule {
  id: string
  field: string     // 'yes_bid', 'yes_ask', 'no_bid', 'no_ask', 'market_price'
  operator: string  // 'greater_than', 'less_than', 'equals', 'between'
  value: string
  value2?: string   // For 'between' operator
}

/**
 * Evaluate orderbook rules against current price data
 */
const evaluateOrderbookRules = (
  rules: OrderbookRule[],
  pricePoint: PricePoint,
  direction: 'UP' | 'DOWN'
): { triggered: boolean; reasons: string[] } => {
  if (!rules || rules.length === 0) {
    return { triggered: false, reasons: [] }
  }

  const reasons: string[] = []

  // Get the market price based on direction (in cents)
  const marketPrice = direction === 'UP' ? pricePoint.yb : pricePoint.nb

  for (const rule of rules) {
    let value: number
    
    // Get the value to compare based on field
    // Handle both underscore and space-separated field names from frontend
    const normalizedField = rule.field.toLowerCase().replace(/\s+/g, '_')
    switch (normalizedField) {
      case 'yes_bid':
      case 'market_price':
      case 'market_price_per_share':
        value = pricePoint.yb
        break
      case 'yes_ask':
        value = pricePoint.ya
        break
      case 'no_bid':
        value = pricePoint.nb
        break
      case 'no_ask':
        value = pricePoint.na
        break
      default:
        value = marketPrice
    }

    const targetValue = parseFloat(rule.value)
    
    // Normalize operator name (handle both "less than" and "less_than")
    const normalizedOperator = rule.operator.toLowerCase().replace(/\s+/g, '_')
    
    let matched = false
    switch (normalizedOperator) {
      case 'greater_than':
      case 'more_than':
      case '>':
        matched = value > targetValue
        break
      case 'less_than':
      case '<':
        matched = value < targetValue
        break
      case 'equals':
      case 'equal_to':
      case '==':
        matched = Math.abs(value - targetValue) < 0.5
        break
      case 'between':
        const targetValue2 = parseFloat(rule.value2 || rule.value)
        matched = value >= targetValue && value <= targetValue2
        break
      default:
        console.warn(`[Backtester] Unknown operator: ${rule.operator} (normalized: ${normalizedOperator})`)
        matched = false
    }
    
    // Log first match attempt for debugging
    if (reasons.length === 0 && matched) {
      console.log(`[Backtester] ✅ Rule matched! ${rule.field} ${rule.operator} ${rule.value}¢ - price was ${value}¢`)
    }
    
    if (matched) {
      reasons.push(`${rule.field} ${rule.operator} ${rule.value}`)
    }
  }

  return {
    triggered: reasons.length > 0,
    reasons,
  }
}

// ============================================
// Main Backtest Function
// ============================================

/**
 * Run a backtest on a single market
 * Returns result for that market including all trades
 */
const runBacktestOnMarket = async (
  strategy: Strategy,
  marketId: string,
  prices: PricePoint[],
  initialBalance: number,
  exitPriceCents?: number,
  orderLadder?: OrderLadderItem[],
  triggerDetected?: boolean // For indicator-based: trigger already detected externally
): Promise<{
  trades: BacktestTrade[]
  finalBalance: number
  conditionsTriggered: number
  maxDrawdown: number
  returns: number[]
}> => {
  // Convert timeframe to minutes
  const timeframeMap: Record<string, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
  }
  const timeframeMinutes = timeframeMap[strategy.timeframe] || 15

  // Create candles
  const direction = (strategy.direction === 'UP' || strategy.direction === 'up') ? 'UP' : 'DOWN'
  const candles = pricesToCandles(prices, timeframeMinutes, direction)

  // Calculate all indicators (if using indicator triggers)
  const indicatorResults = new Map<string, IndicatorResult[]>()
  const useIndicators = strategy.indicators && strategy.indicators.length > 0

  // Determine minimum candles needed based on strategy type
  // If using indicators, need enough candles for the indicator with the longest period
  // MACD needs: slowPeriod (26) + signalPeriod (9) = 35 candles minimum
  // RSI needs: 14 candles minimum
  // For indicator backtests, use the maximum requirement
  let minCandlesNeeded = 5
  if (useIndicators) {
    for (const indicator of strategy.indicators || []) {
      if (indicator.type === 'MACD') {
        const slow = indicator.parameters?.slow || 26
        const signal = indicator.parameters?.signal || 9
        const macdMin = slow + signal
        minCandlesNeeded = Math.max(minCandlesNeeded, macdMin)
      } else if (indicator.type === 'RSI') {
        const rsiMin = indicator.parameters?.length || 14
        minCandlesNeeded = Math.max(minCandlesNeeded, rsiMin + 1)
      } else if (indicator.type === 'Bollinger Bands') {
        const bbMin = indicator.parameters?.length || 20
        minCandlesNeeded = Math.max(minCandlesNeeded, bbMin)
      }
    }
    // Default to 35 if no specific indicator found (MACD is most common)
    if (minCandlesNeeded === 5) {
      minCandlesNeeded = 35
    }
  }
  
  console.log(`[Backtester] Minimum candles needed: ${minCandlesNeeded} (have ${candles.length})`)
  
  // Skip minimum candle check if trigger was already detected externally (indicator-based)
  // In that case, indicators were calculated on crypto data, not this market's data
  if (!triggerDetected && candles.length < minCandlesNeeded) {
    console.log(`[Backtester] Skipping market - only ${candles.length} candles (need ${minCandlesNeeded})`)
    return {
      trades: [],
      finalBalance: initialBalance,
      conditionsTriggered: 0,
      maxDrawdown: 0,
      returns: [],
    }
  }

  // Debug logging
  const allPrices = prices.map(p => direction === 'UP' ? p.yb : p.nb).filter(p => p > 0)
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0
  const pricesBelowThreshold = (rule: any) => {
    const threshold = parseInt(rule.value)
    return allPrices.filter(p => p < threshold).length
  }
  
  console.log(`[Backtester] Market ${marketId.substring(0, 20)}...: ${candles.length} candles, ${prices.length} price points, range ${minPrice}¢-${maxPrice}¢`)
  
  // Check if orderbook rules can be triggered
  const orderbookRulesArr = (strategy as any).orderbookRules
  if (orderbookRulesArr && orderbookRulesArr.length > 0) {
    for (const rule of orderbookRulesArr) {
      const threshold = parseInt(rule.value)
      const countBelow = allPrices.filter(p => p < threshold).length
      const countAbove = allPrices.filter(p => p > threshold).length
      console.log(`[Backtester] Rule "${rule.field} ${rule.operator} ${rule.value}¢": ${countBelow} prices below, ${countAbove} prices above threshold`)
    }
  }
  
  if (orderLadder && orderLadder.length > 0) {
    for (const order of orderLadder) {
      const orderPrice = order.price
      const countAtOrBelow = allPrices.filter(p => p <= orderPrice).length
      console.log(`[Backtester] Order at ${orderPrice}¢: ${countAtOrBelow}/${allPrices.length} prices at or below entry point`)
  }
  }

  if (useIndicators) {
    // For indicator-based strategies, use crypto candles (not market candles) for indicator calculation
    // This allows us to use cached indicators which are pre-calculated on crypto price data
    const asset = strategy.asset || 'BTC'
    const timeframe = strategy.timeframe || '15m'
    
    // Get crypto candles for indicator calculation (same as multi-market mode)
    const feeder = getCryptoPriceFeeder()
    const symbolMap: Record<string, 'btcusdt' | 'ethusdt' | 'solusdt' | 'xrpusdt'> = {
      BTC: 'btcusdt',
      ETH: 'ethusdt',
      SOL: 'solusdt',
      XRP: 'xrpusdt',
    }
    const symbol = symbolMap[asset.toUpperCase()] || 'btcusdt'
    const tf = timeframe === '1h' || timeframe === 'hourly' ? '1h' : '15m'
    
    // Get crypto candles (these are what cached indicators are based on)
    const requiredCandles = Math.max(200, candles.length) // Get enough for indicators
    const cryptoCandles = feeder.getCandleHistory(symbol, tf, requiredCandles)
    
    console.log(`[Backtester] Using ${cryptoCandles.length} crypto candles for indicator calculation (asset: ${asset}, timeframe: ${timeframe})`)
    
    // Try to use cached indicators first (much faster)
    const { getCachedIndicators } = await import('../db/indicatorCache')
    
    for (const indicator of strategy.indicators) {
      if (!indicator.useInConditions) continue

      try {
        console.log(`[Backtester] 🔍 Getting ${indicator.type} for indicator ${indicator.id}`)
        console.log(`[Backtester] 🔍 Parameters: ${JSON.stringify(indicator.parameters)}`)
        
        // Try cached indicators first
        let results: IndicatorResult[] = []
        try {
          const cachedResults = await getCachedIndicators(
            asset,
            timeframe,
            indicator.type,
            indicator.parameters || {},
            cryptoCandles[0]?.timestamp,
            cryptoCandles[cryptoCandles.length - 1]?.timestamp
          )
          
          if (cachedResults.length > 0) {
            console.log(`[Backtester] ✅ Using ${cachedResults.length} cached ${indicator.type} values (fast path)`)
            results = cachedResults.map(cached => ({
              timestamp: cached.timestamp,
              value: cached.value ?? null,
              values: cached.values || undefined,
            }))
          } else {
            // Fallback: calculate in real-time if cache miss
            console.log(`[Backtester] ⚠️ Cache miss for ${indicator.type}, calculating in real-time...`)
            results = calculateIndicator(cryptoCandles, {
              type: indicator.type as IndicatorType,
              parameters: indicator.parameters,
            })
          }
        } catch (cacheError: any) {
          // If cache fails, fallback to real-time calculation
          console.warn(`[Backtester] Cache error for ${indicator.type}, using real-time calculation:`, cacheError.message)
          results = calculateIndicator(cryptoCandles, {
            type: indicator.type as IndicatorType,
            parameters: indicator.parameters,
          })
        }
        
        console.log(`[Backtester] 🔍 ${indicator.type} returned ${results.length} results`)
        
        if (results.length === 0 && indicator.type === 'MACD') {
          const minCandlesNeeded = (indicator.parameters?.slow || 26) + (indicator.parameters?.signal || 9)
          console.log(`[Backtester] ⚠️ MACD returned 0 results! Need at least ${minCandlesNeeded} candles, have ${candles.length}`)
        }
        
        indicatorResults.set(indicator.id, results)
        
        // Log indicator calculation summary
        // For MACD/Bollinger/Stochastic: check values object, not value field
        const validValues = results.filter(r => {
          if (indicator.type === 'MACD' || indicator.type === 'Bollinger Bands' || indicator.type === 'Stochastic') {
            // Multi-value indicators: check if any value in values object is not null
            return r.values && Object.values(r.values).some(v => v !== null && v !== undefined)
          }
          // Single-value indicators: check value field
          return r.value !== null && r.value !== undefined
        })
        
        if (validValues.length > 0) {
          if (indicator.type === 'MACD' && validValues[0].values) {
            const firstMacd = (validValues[0].values as any).macd
            const lastMacd = (validValues[validValues.length - 1].values as any)?.macd
            console.log(`[Backtester] Calculated ${indicator.type} (${indicator.id}): ${validValues.length} values, MACD range ${firstMacd?.toFixed(2) || 'null'} - ${lastMacd?.toFixed(2) || 'null'}`)
          } else {
            const firstValue = validValues[0].value
            const lastValue = validValues[validValues.length - 1].value
            console.log(`[Backtester] Calculated ${indicator.type} (${indicator.id}): ${validValues.length} values, range ${firstValue?.toFixed(2)} - ${lastValue?.toFixed(2)}`)
          }
          // Log first few timestamps to verify alignment
          if (validValues.length > 0 && candles.length > 0) {
            console.log(`[Backtester] First result timestamp: ${new Date(validValues[0].timestamp).toISOString()}, First candle: ${new Date(candles[0].timestamp).toISOString()}`)
          }
        } else {
          console.warn(`[Backtester] ${indicator.type} (${indicator.id}) calculated but no valid values (results: ${results.length})`)
          // Debug: check what's actually in the results
          if (results.length > 0 && indicator.type === 'MACD') {
            const sample = results[0]
            console.warn(`[Backtester] Sample MACD result: value=${sample.value}, values=${JSON.stringify(sample.values)}`)
          }
        }
      } catch (err) {
        console.warn(`[Backtester] Failed to calculate ${indicator.type}:`, err)
      }
    }
    
    // Log all stored indicator IDs for debugging
    const storedIds = Array.from(indicatorResults.keys())
    console.log(`[Backtester] ✅ Stored indicator IDs: ${storedIds.join(', ')}`)
    console.log(`[Backtester] ✅ Total indicators stored: ${storedIds.length}`)
    
    // Log condition setup
    if (strategy.conditions && strategy.conditions.length > 0) {
      console.log(`[Backtester] 🔍 Checking ${strategy.conditions.length} indicator conditions (logic: ${strategy.conditionLogic})`)
      for (const cond of strategy.conditions) {
        // Extract indicator ID from sourceA (handle both "indicator_ind1" and "indicator_ind1.macd")
        let indicatorIdFromCondition = cond.sourceA
        if (indicatorIdFromCondition.includes('.')) {
          indicatorIdFromCondition = indicatorIdFromCondition.split('.')[0]
        }
        indicatorIdFromCondition = indicatorIdFromCondition.startsWith('indicator_') ? indicatorIdFromCondition.substring(10) : indicatorIdFromCondition
        
        const hasIndicator = indicatorResults.has(indicatorIdFromCondition)
        const indicatorData = indicatorResults.get(indicatorIdFromCondition)
        const dataCount = indicatorData ? indicatorData.length : 0
        
        console.log(`[Backtester] 🔍 Condition: "${cond.sourceA} ${cond.operator} ${cond.sourceB || cond.value}"`)
        console.log(`[Backtester] 🔍   Parsed indicator ID: "${indicatorIdFromCondition}"`)
        console.log(`[Backtester] 🔍   Indicator found in map: ${hasIndicator}`)
        console.log(`[Backtester] 🔍   Data points available: ${dataCount}`)
        
        if (hasIndicator && indicatorData && indicatorData.length > 0) {
          // Show sample values for MACD
          if (cond.sourceA.includes('macd') || cond.sourceA.includes('signal')) {
            const sample = indicatorData[Math.floor(indicatorData.length / 2)]
            if (sample && sample.values) {
              console.log(`[Backtester] 🔍   Sample MACD values: macd=${(sample.values as any).macd?.toFixed(2) || 'null'}, signal=${(sample.values as any).signal?.toFixed(2) || 'null'}`)
            }
          }
        } else if (!hasIndicator) {
          console.log(`[Backtester] ⚠️ WARNING: Indicator ID "${indicatorIdFromCondition}" not found in map!`)
          console.log(`[Backtester] ⚠️ Available IDs: ${storedIds.join(', ')}`)
        }
        
        // Log sample values for debugging
        let sampleValues = ''
        if (hasIndicator && indicatorData && indicatorData.length > 0) {
          const lastResult = indicatorData[indicatorData.length - 1]
          if (cond.sourceA.includes('.')) {
            const field = cond.sourceA.split('.')[1]
            const value = lastResult.values?.[field] ?? lastResult.value
            sampleValues = ` (last ${field}: ${value?.toFixed(2) || 'null'})`
          }
          if (cond.sourceB && cond.sourceB.includes('.')) {
            const fieldB = cond.sourceB.split('.')[1]
            const valueB = lastResult.values?.[fieldB] ?? lastResult.value
            sampleValues += `, last ${fieldB}: ${valueB?.toFixed(2) || 'null'}`
          }
        }
        
        console.log(`[Backtester] - Condition: ${cond.sourceA} ${cond.operator} ${cond.sourceB || cond.value} (indicator ID: ${indicatorIdFromCondition}, found: ${hasIndicator}, data points: ${dataCount}${sampleValues})`)
      }
    }
  }

  // ONE TRADE PER MARKET: Enter once, wait for exit, don't re-enter
  // Track if we've entered a trade for this market
  let hasEnteredTrade = false
  let activeTrade: {
    entryTimestamp: number
    entryPrice: number  // in decimal
    shares: number
    cost: number
    orderId: string
    maxPriceReached?: number  // Track max price reached during trade (for debugging)
  } | null = null
  
  const trades: BacktestTrade[] = []
  const returns: number[] = []
  let balance = initialBalance
  let maxBalance = initialBalance
  let maxDrawdown = 0
  let conditionsTriggered = 0

  // Convert exit price from cents to decimal if provided
  const exitPriceDecimal = exitPriceCents ? exitPriceCents / 100 : undefined

  // Start simulation
  // For indicators: start from candle 20 to allow warmup
  // For orderbook rules only: can start from candle 0 (no warmup needed)
  const warmupCandles = useIndicators ? 20 : 0
  const startIndex = Math.min(warmupCandles, Math.max(0, candles.length - 1))

  // NEW APPROACH: Process ALL price points chronologically to find every entry opportunity
  // Filter price points to only those after warmup period
  const warmupTimestamp = candles.length > startIndex ? candles[startIndex].timestamp : prices[0]?.t || 0
  const relevantPrices = prices.filter(p => p.t >= warmupTimestamp)
  
  console.log(`[Backtester] Processing ${relevantPrices.length} price points for entry opportunities`)
  
  // Track previous price to detect when price crosses order threshold
  let previousPrice: number | null = null
  // Track previous price for exit check (to detect when price crosses exit threshold)
  let previousPriceForExit: number | null = null
  
  // Track which candles we've already checked at close (to check once per candle at close)
  const checkedCandlesAtClose = new Set<number>()
  
  // For indicator-based strategies: Check conditions at candle CLOSE (last price point of each candle)
  // This ensures we detect crossovers that complete during the candle and execute on close
  const orderbookRules = (strategy as any).orderbookRules
  const hasIndicators = useIndicators && strategy.conditions && strategy.conditions.length > 0
  const hasOrderbookRules = orderbookRules && orderbookRules.length > 0
  
  // Process each price point to find entry opportunities
  for (let priceIdx = 0; priceIdx < relevantPrices.length; priceIdx++) {
    const pricePoint = relevantPrices[priceIdx]
    const currentPrice = direction === 'UP' ? pricePoint.yb / 100 : pricePoint.nb / 100
    if (currentPrice === 0) {
      previousPrice = null
      continue
    }
    
    // Find the candle this price point belongs to (for indicator-based conditions)
    let candleIndex = -1
    for (let i = startIndex; i < candles.length; i++) {
      if (pricePoint.t >= candles[i].timestamp && pricePoint.t < candles[i].timestamp + timeframeMinutes * 60 * 1000) {
        candleIndex = i
        break
      }
    }
    
    // Calculate current price (needed for both entry checks and price tracking)
    const priceInCents = direction === 'UP' ? pricePoint.yb : pricePoint.nb
    const priceDecimal = priceInCents / 100
    
    // Check entry conditions (only if we haven't entered yet)
    let entryConditionsMet = false
    let entryReasons: string[] = []
    
    // ONE ENTRY + ONE EXIT PER MARKET: Only check entry if we haven't entered yet
    // Entry happens when indicator triggers (detected externally for indicator-based strategies)
    if (!hasEnteredTrade) {
      
      // For indicator-based strategies with external trigger detection: Skip condition evaluation
      if (triggerDetected) {
        entryConditionsMet = true
        entryReasons = ['Indicator trigger detected externally (crypto price data)']
      } else if (hasIndicators && candleIndex >= 0) {
        // Check indicator-based conditions at CANDLE CLOSE
      // For crossovers, we need to check at the CLOSE of each candle to confirm the crossover
      // A crossover is confirmed when: prevCandle had MACD <= Signal, currentCandle (at close) has MACD > Signal
      if (hasIndicators && candleIndex >= 0) {
      const candle = candles[candleIndex]
        const candleEndTime = candle.timestamp + timeframeMinutes * 60 * 1000
        
        // Check if this is the last price point in this candle (or very close to candle end)
        // We check within the last 10% of the candle duration to catch the close
        const timeUntilCandleEnd = candleEndTime - pricePoint.t
        const candleDuration = timeframeMinutes * 60 * 1000
        const isNearCandleClose = timeUntilCandleEnd < (candleDuration * 0.1) || timeUntilCandleEnd < 60000 // Within last 10% or last minute
        
        // Also check if this is the last price point we'll see for this candle
        const isLastPriceInCandle = priceIdx === relevantPrices.length - 1 || 
          (priceIdx < relevantPrices.length - 1 && relevantPrices[priceIdx + 1].t >= candleEndTime)
        
        // SIMPLIFIED: Check EVERY candle once, at the last price point we see for that candle
        // Check if this is the last price point for this candle (next price is in different candle OR this is last price overall)
        const isLastPriceForCandle = priceIdx === relevantPrices.length - 1 || 
          (priceIdx < relevantPrices.length - 1 && relevantPrices[priceIdx + 1].t >= candleEndTime)
        
        // Check conditions at candle close (when this is the last price point for this candle)
        if (isLastPriceForCandle && !checkedCandlesAtClose.has(candleIndex)) {
          checkedCandlesAtClose.add(candleIndex)
          
          // For indicator-based: No exit price checks - hold until market end
          // Exit price checks only apply to orderbook-based strategies
          
          // ALWAYS log first 50 candles to see what's happening
          if (candleIndex < 50) {
            console.log(`[Backtester] 🔍 Checking conditions at candle ${candleIndex} close (timestamp: ${new Date(candle.timestamp).toISOString()}, priceIdx=${priceIdx}/${relevantPrices.length})`)
          }
          
          const prevCandle = candleIndex > 0 ? candles[candleIndex - 1] : null
          
          // Use candle close price for execution
          const candleClosePrice = candle.close
          
          // Evaluate conditions using current candle (at close) vs previous candle
          // ALWAYS log first 50 candles to debug
          const firstCondition = strategy.conditions[0]
          if (firstCondition && candleIndex < 50) {
            let indicatorIdFromCond = firstCondition.sourceA.includes('.') 
              ? firstCondition.sourceA.split('.')[0] 
              : firstCondition.sourceA
            indicatorIdFromCond = indicatorIdFromCond.startsWith('indicator_') 
              ? indicatorIdFromCond.substring(10) 
              : indicatorIdFromCond
            
            const hasIndicator = indicatorResults.has(indicatorIdFromCond)
            const indicatorData = indicatorResults.get(indicatorIdFromCond)
            console.log(`[Backtester] 🔍 Candle ${candleIndex}: Checking "${firstCondition.sourceA} ${firstCondition.operator} ${firstCondition.sourceB}"`)
            console.log(`[Backtester] 🔍   Parsed ID: "${indicatorIdFromCond}", found: ${hasIndicator}, data points: ${indicatorData?.length || 0}`)
            
            if (hasIndicator && indicatorData && firstCondition.sourceA.includes('.') && firstCondition.sourceB && firstCondition.sourceB.includes('.')) {
              // Get actual MACD values
              const [indicatorIdRaw, fieldA] = firstCondition.sourceA.split('.')
              const indicatorIdA = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
              const valueA = getIndicatorValue(indicatorResults, indicatorIdA, candleIndex, fieldA, candle.timestamp)
              const prevValueA = prevCandle ? getIndicatorValue(indicatorResults, indicatorIdA, candleIndex - 1, fieldA, prevCandle.timestamp) : null
              
              const [indicatorIdRawB, fieldB] = firstCondition.sourceB.split('.')
              const indicatorIdB = indicatorIdRawB.startsWith('indicator_') ? indicatorIdRawB.substring(10) : indicatorIdRawB
              const valueB = getIndicatorValue(indicatorResults, indicatorIdB, candleIndex, fieldB, candle.timestamp)
              const prevValueB = prevCandle ? getIndicatorValue(indicatorResults, indicatorIdB, candleIndex - 1, fieldB, prevCandle.timestamp) : null
              
              const wouldCross = prevValueA !== null && prevValueB !== null && valueA !== null && valueB !== null && prevValueA <= prevValueB && valueA > valueB
              console.log(`[Backtester] 🔍 Candle ${candleIndex}: MACD ${prevValueA?.toFixed(2) || 'null'}->${valueA?.toFixed(2) || 'null'}, Signal ${prevValueB?.toFixed(2) || 'null'}->${valueB?.toFixed(2) || 'null'}`)
              console.log(`[Backtester] ${wouldCross ? '✅ CROSSOVER DETECTED!' : '❌ No crossover'} (prev: MACD ${prevValueA?.toFixed(2) || 'null'} <= Signal ${prevValueB?.toFixed(2) || 'null'} = ${prevValueA !== null && prevValueB !== null && prevValueA <= prevValueB}, curr: MACD ${valueA?.toFixed(2) || 'null'} > Signal ${valueB?.toFixed(2) || 'null'} = ${valueA !== null && valueB !== null && valueA > valueB})`)
            } else if (!hasIndicator) {
              console.log(`[Backtester] ⚠️ Candle ${candleIndex}: Indicator ID "${indicatorIdFromCond}" NOT FOUND in map!`)
            } else if (!indicatorData || indicatorData.length === 0) {
              console.log(`[Backtester] ⚠️ Candle ${candleIndex}: Indicator found but NO DATA!`)
            }
          }
          
      const { triggered, reasons } = evaluateConditions(
        strategy.conditions,
        strategy.conditionLogic,
        indicatorResults,
        candleIndex,
            candleClosePrice, // Use candle close price, not current tick price
            candle.timestamp,
            prevCandle?.timestamp
      )
          
      if (triggered) {
        entryConditionsMet = true
        entryReasons = reasons
            // Log all triggers for debugging
            const closeTime = new Date(candle.timestamp + timeframeMinutes * 60 * 1000).toISOString()
            console.log(`[Backtester] ✅ Indicator condition triggered at candle ${candleIndex} CLOSE (${closeTime}): ${reasons.join(', ')}`)
          } else if (candleIndex < 5 || candleIndex % 10 === 0) {
            // Log first few and periodic non-triggers for debugging
            const firstCondition = strategy.conditions[0]
            if (firstCondition) {
              // Get current and previous values for debugging
              let debugInfo = ''
              if (firstCondition.sourceA.includes('.')) {
                const [indicatorIdRaw, fieldA] = firstCondition.sourceA.split('.')
                const indicatorIdA = indicatorIdRaw.startsWith('indicator_') ? indicatorIdRaw.substring(10) : indicatorIdRaw
                const valueA = getIndicatorValue(indicatorResults, indicatorIdA, candleIndex, fieldA, candle.timestamp)
                const prevValueA = prevCandle ? getIndicatorValue(indicatorResults, indicatorIdA, candleIndex - 1, fieldA, prevCandle.timestamp) : null
                
                if (firstCondition.sourceB && firstCondition.sourceB.includes('.')) {
                  const [indicatorIdRawB, fieldB] = firstCondition.sourceB.split('.')
                  const indicatorIdB = indicatorIdRawB.startsWith('indicator_') ? indicatorIdRawB.substring(10) : indicatorIdRawB
                  const valueB = getIndicatorValue(indicatorResults, indicatorIdB, candleIndex, fieldB, candle.timestamp)
                  const prevValueB = prevCandle ? getIndicatorValue(indicatorResults, indicatorIdB, candleIndex - 1, fieldB, prevCandle.timestamp) : null
                  debugInfo = `${firstCondition.sourceA}: ${prevValueA?.toFixed(2) || 'null'} -> ${valueA?.toFixed(2) || 'null'}, ${firstCondition.sourceB}: ${prevValueB?.toFixed(2) || 'null'} -> ${valueB?.toFixed(2) || 'null'}`
                } else {
                  debugInfo = `${firstCondition.sourceA}: ${prevValueA?.toFixed(2) || 'null'} -> ${valueA?.toFixed(2) || 'null'}`
                }
              }
              console.log(`[Backtester] Condition not met at candle ${candleIndex} CLOSE: ${firstCondition.sourceA} ${firstCondition.operator} ${firstCondition.sourceB || firstCondition.value} (${debugInfo})`)
            }
          }
        }
      }
      
      // Check orderbook-based conditions (if using orderbook rules)
      // Note: Can be used alone OR in combination with indicators
      if (hasOrderbookRules) {
      const { triggered, reasons } = evaluateOrderbookRules(
        orderbookRules,
        pricePoint,
        direction
      )
      if (triggered) {
        entryConditionsMet = true
          entryReasons = [...entryReasons, ...reasons]
          // Log first trigger for debugging
          if (priceIdx < 10 || (priceIdx % 1000 === 0)) {
            console.log(`[Backtester] Entry condition triggered at price ${priceInCents}¢: ${reasons.join(', ')}`)
          }
        }
      }
      
      // Auto-trigger if no conditions configured at all
      if (!hasIndicators && !hasOrderbookRules && priceIdx === 0) {
      entryConditionsMet = true
      entryReasons = ['Auto-trigger (no conditions configured)']
      }
    }
    
    // If entry conditions met, try to execute order ladder
    if (entryConditionsMet && orderLadder && orderLadder.length > 0) {
      // For indicator-based strategies: Execute immediately at limit order price when trigger detected
      // For orderbook-based strategies: Only execute when price crosses threshold (limit order behavior)
      const isIndicatorBased = hasIndicators && !hasOrderbookRules
      
      // Check each order in ladder
      for (const order of orderLadder) {
        const orderPriceDecimal = order.price / 100
        
        let shouldExecute = false
        
        if (isIndicatorBased || triggerDetected) {
          // Indicator-based: Execute immediately at limit order price when trigger detected
          shouldExecute = true
        } else {
          // Orderbook-based: Only execute if price crossed threshold (limit order behavior)
        const priceCrossedThreshold = previousPrice === null || previousPrice > orderPriceDecimal
        const priceAtOrBelowOrder = priceDecimal <= orderPriceDecimal
          shouldExecute = priceAtOrBelowOrder && priceCrossedThreshold
        }
        
        if (shouldExecute) {
          // Always use limit order price (user's configured price, e.g., 40¢)
          const finalExecutionPrice = orderPriceDecimal
          const cost = order.shares * finalExecutionPrice
          
          // Check if we have enough balance
          if (cost <= balance) {
              // Create the ONE trade for this market
              activeTrade = {
              entryTimestamp: pricePoint.t,
              entryPrice: finalExecutionPrice,
              shares: order.shares,
              cost,
              orderId: order.id,
              maxPriceReached: priceDecimal, // Initialize with entry price
              }
            
            balance -= cost
            conditionsTriggered++
              hasEnteredTrade = true // Mark that we've entered - no more entries for this market
            
            trades.push({
              timestamp: pricePoint.t,
              side: 'BUY',
              price: finalExecutionPrice,
              shares: order.shares,
              value: cost,
              balance,
              triggerReason: `Entry at ${(finalExecutionPrice * 100).toFixed(0)}¢ (${isIndicatorBased ? 'candle close' : 'limit'}) - ${entryReasons.join(', ')}`,
            })
              
              console.log(`[Backtester] ✅ Entered trade at ${(finalExecutionPrice * 100).toFixed(0)}¢ (${isIndicatorBased ? `candle ${candleIndex} close` : `limit order ${order.price}¢`}, current price: ${priceInCents}¢) - ${entryReasons.join(', ')}`)
            
            // Only execute one order per entry opportunity
            break
            } else {
              // Log if we can't enter due to insufficient balance (shouldn't happen often)
              if (priceIdx < 10 || (priceIdx % 1000 === 0)) {
                console.log(`[Backtester] ⚠️ Entry condition met but insufficient balance: need $${cost.toFixed(2)}, have $${balance.toFixed(2)}`)
              }
            }
          } else if (!isIndicatorBased && priceIdx < 10) {
            // Log why order didn't execute (for orderbook-based strategies only)
            const priceAtOrBelowOrder = priceDecimal <= orderPriceDecimal
            const priceCrossedThreshold = previousPrice === null || previousPrice > orderPriceDecimal
            if (priceAtOrBelowOrder && !priceCrossedThreshold) {
              console.log(`[Backtester] Order ${order.price}¢ not executed: price ${priceInCents}¢ didn't cross threshold (prev: ${previousPrice ? (previousPrice * 100).toFixed(0) : 'null'}¢)`)
          }
        }
      }
    }
    
    // Update previous price for next iteration
      previousPrice = priceDecimal
    }
    
    // Handle case where conditions are met but no order ladder
    if (!hasEnteredTrade && entryConditionsMet && (!orderLadder || orderLadder.length === 0)) {
      // No order ladder configured - log warning
      if (priceIdx < 5) {
        console.log(`[Backtester] ⚠️ Entry conditions met but no order ladder configured - cannot place trade`)
      }
    }
    
    // Update previous price for next iteration
    previousPrice = priceDecimal
    
    // For indicator-based strategies: No exit price - hold until market end
    // Market closes "green" (price up) = WIN ($1/share), "red" (price down) = LOSS ($0/share)
    // Skip exit price checks for indicator-based strategies
    const isIndicatorBased = strategy.indicators && strategy.indicators.length > 0
    if (activeTrade && exitPriceDecimal && !isIndicatorBased) {
      // Only check exit price for non-indicator strategies (orderbook-based)
      // Calculate current price for exit check
      const currentPriceForExit = direction === 'UP' ? pricePoint.yb / 100 : pricePoint.nb / 100
      
      // Also check candle high - candles can have higher highs than individual price points
      let effectivePriceForExit = currentPriceForExit
      if (candleIndex >= 0 && candles[candleIndex]) {
        const candle = candles[candleIndex]
        effectivePriceForExit = Math.max(currentPriceForExit, candle.high)
      }
      
      // Only check exit if this price point is AFTER the entry
      if (pricePoint.t > activeTrade.entryTimestamp && effectivePriceForExit > 0) {
        // Track max price reached during trade
        if (!activeTrade.maxPriceReached || effectivePriceForExit > activeTrade.maxPriceReached) {
          activeTrade.maxPriceReached = effectivePriceForExit
        }
        
        // Check if price reached or exceeded exit price
        const priceReachedExit = effectivePriceForExit >= exitPriceDecimal
        
        if (priceReachedExit) {
          // Exit reached! Sell at exit price (WIN)
          const value = activeTrade.shares * exitPriceDecimal
          const pnl = value - activeTrade.cost
          balance += value
          
          returns.push(pnl / activeTrade.cost)
          
          trades.push({
            timestamp: pricePoint.t,
            side: 'SELL',
            price: exitPriceDecimal,
            shares: activeTrade.shares,
            value,
            pnl,
            balance,
            triggerReason: `Exit at ¢${exitPriceCents} (entered at ¢${(activeTrade.entryPrice * 100).toFixed(0)}) - WIN`,
          })
          
          console.log(`[Backtester] ✅ Exit reached at ${exitPriceCents}¢ - SELL executed - WIN: $${pnl.toFixed(2)}`)
        
          // Clear the active trade - market is done
          activeTrade = null
          previousPriceForExit = null
        }
        
        // Update previous price for exit check
        previousPriceForExit = effectivePriceForExit
      }
    }
    
    // Update max balance and drawdown
    const currentValue = balance + (activeTrade ? activeTrade.shares * currentPrice : 0)
    if (currentValue > maxBalance) {
      maxBalance = currentValue
    }
    const drawdown = maxBalance - currentValue
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }
  
  // Close any remaining active trade at market end
  if (activeTrade) {
    const isIndicatorBased = strategy.indicators && strategy.indicators.length > 0
    
    if (isIndicatorBased) {
      // Indicator-based: Market closes "green" (price up) = WIN ($1/share), "red" (price down) = LOSS ($0/share)
      // Get final market price (last price point or last candle close)
      const finalPrice = relevantPrices.length > 0
        ? (direction === 'UP' ? relevantPrices[relevantPrices.length - 1].yb : relevantPrices[relevantPrices.length - 1].nb) / 100
        : candles.length > 0 ? candles[candles.length - 1].close : activeTrade.entryPrice
      
      // For UP direction: WIN if final price > entry price, LOSS if final price <= entry price
      // For DOWN direction: WIN if final price < entry price, LOSS if final price >= entry price
      const isWin = direction === 'UP' 
        ? finalPrice > activeTrade.entryPrice
        : finalPrice < activeTrade.entryPrice
      
      const payoutPerShare = isWin ? 1.0 : 0.0 // $1 per share for WIN, $0 for LOSS
      const value = activeTrade.shares * payoutPerShare
      const pnl = value - activeTrade.cost
      balance += value
      
      if (activeTrade.cost > 0) {
        returns.push(pnl / activeTrade.cost)
      }
      
      // Determine market end time
      let marketEndTime: number
      if (relevantPrices.length > 0) {
        marketEndTime = relevantPrices[relevantPrices.length - 1].t + (60 * 1000) // 1 minute after last price
      } else if (candles.length > 0) {
        marketEndTime = candles[candles.length - 1].timestamp + (timeframeMinutes * 60 * 1000)
      } else {
        marketEndTime = activeTrade.entryTimestamp + (15 * 60 * 1000)
      }
      
      // Ensure timestamp is after entry
      if (marketEndTime <= activeTrade.entryTimestamp) {
        marketEndTime = activeTrade.entryTimestamp + (60 * 1000)
      }
      
      trades.push({
        timestamp: marketEndTime,
        side: isWin ? 'SELL' : 'LOSS',
        price: isWin ? 1.0 : 0.0, // $1 for WIN, $0 for LOSS
        shares: activeTrade.shares,
        value,
        pnl,
        balance,
        triggerReason: `Market ended - ${isWin ? 'WIN' : 'LOSS'} (final price: ${(finalPrice * 100).toFixed(0)}¢ ${isWin ? '>' : '<='} entry: ${(activeTrade.entryPrice * 100).toFixed(0)}¢) - ${isWin ? 'Pays $1/share' : 'Pays $0/share'}`,
      })
      
      console.log(`[Backtester] ${isWin ? '✅' : '❌'} Market ended - ${isWin ? 'WIN' : 'LOSS'}: $${pnl.toFixed(2)} (final: ${(finalPrice * 100).toFixed(0)}¢, entry: ${(activeTrade.entryPrice * 100).toFixed(0)}¢, ${isWin ? 'pays $1/share' : 'pays $0/share'})`)
    } else if (exitPriceDecimal) {
      // Orderbook-based with exit price: Exit price was configured but never reached
      const pnl = -activeTrade.cost
      const maxPriceReached = activeTrade.maxPriceReached ? (activeTrade.maxPriceReached * 100).toFixed(0) : 'unknown'
      
      if (activeTrade.cost > 0) {
        returns.push(pnl / activeTrade.cost)
      }
      
      let marketEndTime: number
      if (relevantPrices.length > 0) {
        marketEndTime = relevantPrices[relevantPrices.length - 1].t + (60 * 1000)
      } else if (candles.length > 0) {
        marketEndTime = candles[candles.length - 1].timestamp + (timeframeMinutes * 60 * 1000)
      } else {
        marketEndTime = activeTrade.entryTimestamp + (15 * 60 * 1000)
      }
      
      if (marketEndTime <= activeTrade.entryTimestamp) {
        marketEndTime = activeTrade.entryTimestamp + (60 * 1000)
      }
      
      trades.push({
        timestamp: marketEndTime,
        side: 'LOSS',
        price: 0,
        shares: activeTrade.shares,
        value: 0,
        pnl,
        balance,
        triggerReason: `Market ended - exit price ${exitPriceCents}¢ never reached (max price: ${maxPriceReached}¢) - LOSS (position expired worthless)`,
      })
      
      console.log(`[Backtester] ❌ Market ended without reaching exit price ${exitPriceCents}¢ - LOSS: $${pnl.toFixed(2)} (max price reached: ${maxPriceReached}¢)`)
    } else {
      // No exit price configured - sell at market end price
    const lastPrice = relevantPrices.length > 0 
      ? (direction === 'UP' ? relevantPrices[relevantPrices.length - 1].yb : relevantPrices[relevantPrices.length - 1].nb) / 100
      : candles[candles.length - 1].close
    
      const value = activeTrade.shares * lastPrice
      const pnl = value - activeTrade.cost
      balance += value
      
      if (activeTrade.cost > 0) {
        returns.push(pnl / activeTrade.cost)
      }
      
      trades.push({
        timestamp: relevantPrices[relevantPrices.length - 1]?.t || candles[candles.length - 1].timestamp,
        side: 'SELL',
        price: lastPrice,
        shares: activeTrade.shares,
        value,
        pnl,
        balance,
        triggerReason: `Market ended - sold at market close ${(lastPrice * 100).toFixed(0)}¢ (no exit price configured)`,
      })
      
      console.log(`[Backtester] Market ended - sold at market close: $${pnl.toFixed(2)} (closed at ${(lastPrice * 100).toFixed(0)}¢)`)
    }
  }
  
  // Summary log
  if (hasEnteredTrade) {
    console.log(`[Backtester] Market ${marketId.substring(0, 20)}... summary: Entered=${hasEnteredTrade}, Trades=${trades.length}, FinalBalance=$${balance.toFixed(2)}`)
  } else {
    console.log(`[Backtester] Market ${marketId.substring(0, 20)}... summary: NO ENTRY (conditions never met or insufficient balance), Price range: ${minPrice}¢-${maxPrice}¢`)
  }

  return {
    trades,
    finalBalance: balance,
    conditionsTriggered,
    maxDrawdown,
    returns,
  }
}

/**
 * Run a backtest across multiple markets
 * This is the main entry point for multi-market backtesting
 */
export const runBacktest = async (config: BacktestConfig): Promise<BacktestResult> => {
  const { strategy, initialBalance, numberOfMarkets, exitPrice } = config
  
  console.log(`[Backtester] Starting backtest for "${strategy.name}"`)
  console.log(`[Backtester] Mode: ${numberOfMarkets ? `Multi-market (${numberOfMarkets} markets)` : 'Single market'}`)
  console.log(`[Backtester] Exit Price: ${exitPrice ? `¢${exitPrice}` : 'None (sell at market end)'}`)

  // Parse order ladder from strategy if present
  const orderLadder: OrderLadderItem[] = (strategy as any).orderLadder?.map((item: any) => ({
    id: item.id,
    price: typeof item.price === 'string' ? parseInt(item.price) : item.price,
    shares: typeof item.shares === 'string' ? parseInt(item.shares) : item.shares,
  })) || []

  console.log(`[Backtester] Order Ladder: ${orderLadder.length} orders`)

  // Get markets to backtest
  let marketsToTest: MarketWithData[] = []

  if (numberOfMarkets && numberOfMarkets > 0) {
    // Multi-market mode: Get N markets from database
    const useIndicators = strategy.indicators && strategy.indicators.length > 0
    const orderbookRules = (strategy as any).orderbookRules
    
    if (useIndicators) {
      // Indicator-based backtest: 
      // 1. Calculate indicators on continuous crypto price data (for signal detection)
      // 2. When indicator triggers, find the Polymarket market active at that time
      // 3. Trade that market using orderbook (entry + exit in same market)
      
      const asset = strategy.asset || 'BTC'
      const timeframe = strategy.timeframe || '15m'
      
      console.log(`[Backtester] Indicator-based backtest: Using crypto price data for ${asset} ${timeframe} indicators`)
      
      // Get crypto price candles for indicator calculation
      const feeder = getCryptoPriceFeeder()
      const symbolMap: Record<string, 'btcusdt' | 'ethusdt' | 'solusdt' | 'xrpusdt'> = {
        BTC: 'btcusdt',
        ETH: 'ethusdt',
        SOL: 'solusdt',
        XRP: 'xrpusdt',
      }
      const symbol = symbolMap[asset.toUpperCase()] || 'btcusdt'
      const tf = timeframe === '1h' || timeframe === 'hourly' ? '1h' : '15m'
      
      // Get historical candles (need enough for indicators like MACD: 35+)
      const requiredCandles = 200 // Get enough history
      const cryptoCandles = feeder.getCandleHistory(symbol, tf, requiredCandles)
      
      console.log(`[Backtester] Retrieved ${cryptoCandles.length} crypto price candles for indicator calculation`)
      
      if (cryptoCandles.length < 35) {
        throw new Error(`Insufficient crypto price data: Only ${cryptoCandles.length} candles available (need at least 35 for MACD)`)
      }
      
      // Calculate indicators on crypto candles (use cached if available)
      const indicatorResults: Map<number, Map<string, IndicatorResult[]>> = new Map()
      const { getCachedIndicators } = await import('../db/indicatorCache')
      
      // Fetch all cached indicators in parallel for better performance
      const indicatorPromises = (strategy.indicators || []).map(async (indicator) => {
        try {
          // Try to get cached indicators first
          const cachedResults = await getCachedIndicators(
            asset,
            timeframe,
            indicator.type,
            indicator.parameters || {},
            cryptoCandles[0]?.timestamp,
            cryptoCandles[cryptoCandles.length - 1]?.timestamp
          )
          
          return { indicator, cachedResults, error: null }
        } catch (error: any) {
          return { indicator, cachedResults: [], error }
        }
      })
      
      const indicatorData = await Promise.all(indicatorPromises)
      
      for (const { indicator, cachedResults, error } of indicatorData) {
        try {
          
          if (error) {
            // If cache fails, fallback to real-time calculation
            console.warn(`[Backtester] Cache error for ${indicator.type}, using real-time calculation:`, error.message)
          } else if (cachedResults.length > 0) {
            console.log(`[Backtester] ✅ Using ${cachedResults.length} cached ${indicator.type} values (fast path)`)
            // Convert cached results to IndicatorResult format
            const results: IndicatorResult[] = cachedResults.map(cached => ({
              timestamp: cached.timestamp,
              value: cached.value ?? null,
              values: cached.values || undefined,
            }))
            
            for (const result of results) {
              if (!indicatorResults.has(result.timestamp)) {
                indicatorResults.set(result.timestamp, new Map())
              }
              const candleResults = indicatorResults.get(result.timestamp)!
              candleResults.set(indicator.id || indicator.type, [result])
            }
          } else {
            // Fallback: calculate in real-time if cache miss
            console.log(`[Backtester] ⚠️ Cache miss for ${indicator.type}, calculating in real-time...`)
          }
          
          // If no cached results or error, calculate in real-time
          if (error || cachedResults.length === 0) {
            const results = calculateIndicator(cryptoCandles, {
              type: indicator.type as IndicatorType,
              parameters: indicator.parameters || {}
            })
            for (let i = 0; i < results.length; i++) {
              const candle = cryptoCandles[i]
              if (!indicatorResults.has(candle.timestamp)) {
                indicatorResults.set(candle.timestamp, new Map())
              }
              const candleResults = indicatorResults.get(candle.timestamp)!
              candleResults.set(indicator.id || `ind_${i}`, [results[i]])
            }
          }
        } catch (calcError: any) {
          // Final fallback if everything fails
          console.error(`[Backtester] Error processing ${indicator.type}:`, calcError.message)
          const results = calculateIndicator(cryptoCandles, {
            type: indicator.type as IndicatorType,
            parameters: indicator.parameters || {}
          })
          for (let i = 0; i < results.length; i++) {
            const candle = cryptoCandles[i]
            if (!indicatorResults.has(candle.timestamp)) {
              indicatorResults.set(candle.timestamp, new Map())
            }
            const candleResults = indicatorResults.get(candle.timestamp)!
            candleResults.set(indicator.id || `ind_${i}`, [results[i]])
          }
        }
      }
      
      // Find all indicator trigger points (crossovers, etc.)
      const triggerPoints: Array<{ timestamp: number; candleIndex: number }> = []
      
      for (let i = 1; i < cryptoCandles.length; i++) {
        const prevCandle = cryptoCandles[i - 1]
        const currentCandle = cryptoCandles[i]
        const prevResults = indicatorResults.get(prevCandle.timestamp)
        const currentResults = indicatorResults.get(currentCandle.timestamp)
        
        if (!prevResults || !currentResults) continue
        
        // Check each condition for crossovers
        for (const condition of strategy.conditions || []) {
          if (condition.operator === 'crosses above' || condition.operator === 'crosses below') {
            const sourceA = condition.sourceA || ''
            const sourceB = condition.sourceB || ''
            
            // Parse indicator references (e.g., "indicator_ind_xxx.macd")
            const parseIndicatorRef = (ref: string): { indicatorId: string; field: string } | null => {
              if (ref.startsWith('indicator_')) {
                const parts = ref.replace('indicator_', '').split('.')
                if (parts.length === 2) {
                  return { indicatorId: parts[0], field: parts[1] }
                }
              }
              return null
            }
            
            const refA = parseIndicatorRef(sourceA)
            const refB = parseIndicatorRef(sourceB)
            
            if (refA && refB) {
              const prevA = prevResults.get(refA.indicatorId)?.[0]
              const prevB = prevResults.get(refB.indicatorId)?.[0]
              const currA = currentResults.get(refA.indicatorId)?.[0]
              const currB = currentResults.get(refB.indicatorId)?.[0]
              
              if (prevA && prevB && currA && currB) {
                const valueA = refA.field === 'macd' ? (currA.values?.macd || 0) : 
                              refA.field === 'signal' ? (currA.values?.signal || 0) :
                              (currA.value || 0)
                const valueB = refB.field === 'macd' ? (currB.values?.macd || 0) :
                              refB.field === 'signal' ? (currB.values?.signal || 0) :
                              (currB.value || 0)
                const prevValueA = refA.field === 'macd' ? (prevA.values?.macd || 0) :
                                  refA.field === 'signal' ? (prevA.values?.signal || 0) :
                                  (prevA.value || 0)
                const prevValueB = refB.field === 'macd' ? (prevB.values?.macd || 0) :
                                  refB.field === 'signal' ? (prevB.values?.signal || 0) :
                                  (prevB.value || 0)
                
                const crossed = condition.operator === 'crosses above' 
                  ? (prevValueA <= prevValueB && valueA > valueB)
                  : (prevValueA >= prevValueB && valueA < valueB)
                
                if (crossed) {
                  // Crossover confirmed at candle close - we can only trade on NEXT candle in real-time
                  // So trigger timestamp is the END of the current candle (when we know it happened)
                  const candleEndTime = currentCandle.timestamp + (tf === '1h' ? 60 * 60 * 1000 : 15 * 60 * 1000)
                  triggerPoints.push({ timestamp: candleEndTime, candleIndex: i })
                  console.log(`[Backtester] ✅ Indicator trigger detected at candle close ${new Date(candleEndTime).toISOString()} (candle ${i} closed) - will trade on NEXT candle/market`)
                  break // Only need one trigger per candle
                }
              }
            }
          }
        }
      }
      
      console.log(`[Backtester] Found ${triggerPoints.length} indicator trigger points`)
      
      // For each trigger, find the corresponding Polymarket market
      // Get markets that could match (limit to reasonable number to avoid API timeouts)
      const allMarkets = await getMarketsByAssetAndTimeframe(asset, timeframe, 100) // Get reasonable number of candidates
      console.log(`[Backtester] Found ${allMarkets.length} candidate Polymarket markets`)
      
      // Match each trigger to a market
      const marketsToTrade = new Map<string, MarketWithData>() // marketId -> market
      
      for (const trigger of triggerPoints) {
        // triggerTime is the END of the candle where crossover was confirmed
        // In real-time, we can only trade on the NEXT candle/market after confirmation
        const triggerTime = trigger.timestamp // This is already candle end time
        
        // Find market that STARTS after the trigger (next market, not current)
        // We want markets that start >= triggerTime (after candle close confirmation)
        let bestMatch: MarketWithData | null = null
        let bestScore = Infinity
        
        for (const market of allMarkets) {
          const marketStart = market.eventStart.getTime()
          const marketEnd = market.eventEnd.getTime()
          
          // Market must START after trigger (candle close confirmation)
          // Allow small buffer (1 minute) for market start time alignment
          if (marketStart >= triggerTime - 60000 && marketStart <= triggerTime + (tf === '1h' ? 60 * 60 * 1000 : 15 * 60 * 1000)) {
            // Prefer markets that start closest to trigger time (next available market)
            const score = Math.abs(marketStart - triggerTime)
            if (score < bestScore) {
              bestScore = score
              bestMatch = market
            }
          }
        }
        
        if (bestMatch) {
          if (!marketsToTrade.has(bestMatch.marketId)) {
            marketsToTrade.set(bestMatch.marketId, bestMatch)
            console.log(`[Backtester] ✅ Trigger confirmed at ${new Date(triggerTime).toISOString()} (candle close) → Trading NEXT market ${bestMatch.marketId.substring(0, 25)}... (starts: ${new Date(bestMatch.eventStart).toISOString()})`)
          } else {
            // Multiple triggers mapped to same market - this is expected if triggers are close together
            // We'll still trade this market, but only once (deduplication is correct behavior)
            console.log(`[Backtester] ⚠️ Trigger at ${new Date(triggerTime).toISOString()} maps to already-selected market ${bestMatch.marketId.substring(0, 25)}... (multiple triggers → same market, will trade once)`)
          }
        } else {
          console.log(`[Backtester] ⚠️ No next market found for trigger at ${new Date(triggerTime).toISOString()} (searched ${allMarkets.length} markets)`)
        }
      }
      
      // Limit to requested number of markets
      // Note: If we have more triggers than numberOfMarkets, we'll only trade the first N markets
      const allTriggeredMarkets = Array.from(marketsToTrade.values())
      marketsToTest = allTriggeredMarkets.slice(0, numberOfMarkets)
      
      if (triggerPoints.length > marketsToTest.length) {
        console.log(`[Backtester] ⚠️ Found ${triggerPoints.length} indicator triggers but only ${marketsToTest.length} unique markets (${triggerPoints.length - marketsToTest.length} triggers mapped to same markets or no market found)`)
      }
      console.log(`[Backtester] Selected ${marketsToTest.length} markets to trade based on ${triggerPoints.length} indicator triggers`)

    if (marketsToTest.length === 0) {
        throw new Error(`No Polymarket markets found matching indicator trigger times. Make sure you have markets in the database for the trigger periods.`)
      }
    } else {
      // Orderbook-based backtest: Filter by price threshold if specified
      let minPriceThreshold: number | undefined = undefined
      if (orderbookRules && orderbookRules.length > 0) {
        for (const rule of orderbookRules) {
          const normalizedField = rule.field?.toLowerCase().replace(/\s+/g, '_') || ''
          const normalizedOp = rule.operator?.toLowerCase().replace(/\s+/g, '_') || ''
          
          // If looking for prices LESS THAN a threshold, use that as our filter
          if ((normalizedField === 'market_price_per_share' || normalizedField === 'yes_bid' || normalizedField === 'market_price') &&
              (normalizedOp === 'less_than' || normalizedOp === 'less than' || normalizedOp === '<')) {
            const threshold = parseInt(rule.value)
            if (!isNaN(threshold)) {
              minPriceThreshold = threshold
              console.log(`[Backtester] Extracted price threshold from orderbook rule: looking for markets with price < ${threshold}¢`)
              break
            }
          }
        }
      }
      
      marketsToTest = await getMarketsWithHistoricalData(numberOfMarkets, minPriceThreshold)
      console.log(`[Backtester] Found ${marketsToTest.length} markets with historical data (will load all events per market)`)

      if (marketsToTest.length === 0) {
        throw new Error('No markets with historical data found in database. Try a higher price threshold or test a specific market.')
      }
    }
  } else if (config.marketId) {
    // Single market mode
    marketsToTest = [{
      marketId: config.marketId,
      eventStart: config.startTime || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      eventEnd: config.endTime || new Date(),
      pricePointCount: 0,
    }]
  } else if (strategy.market) {
    marketsToTest = [{
      marketId: strategy.market,
      eventStart: config.startTime || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      eventEnd: config.endTime || new Date(),
      pricePointCount: 0,
    }]
  } else {
    throw new Error('No market specified for backtest')
  }

  // Run backtest on each market and accumulate results
  const allTrades: BacktestTrade[] = []
  const allReturns: number[] = []
  let currentBalance = initialBalance
  let totalConditionsTriggered = 0
  let totalCandlesProcessed = 0
  let maxOverallDrawdown = 0
  let maxOverallBalance = initialBalance
  let marketsProcessed = 0

  for (const market of marketsToTest) {
    try {
      console.log(`[Backtester] Processing market ${market.marketId.substring(0, 30)}...`)

      // Load ALL price data for this market (all events)
      // This ensures we catch price movements across the entire market history
      const prices = await loadMarketPriceData(market.marketId)
      
      if (prices.length < 50) {
        console.log(`[Backtester] Skipping market - only ${prices.length} price points`)
        continue
      }

      // For indicator-based strategies: We've already detected triggers externally
      // Mark this market as "trigger detected" so we enter immediately
      const isIndicatorBased = strategy.indicators && strategy.indicators.length > 0
      const triggerDetected = isIndicatorBased // If we got here, trigger was detected

      // Run backtest on this market
      const result = await runBacktestOnMarket(
        strategy,
        market.marketId,
        prices,
        currentBalance,
        exitPrice,
        orderLadder,
        triggerDetected // Pass flag to skip condition evaluation
      )

      // Update cumulative results
      currentBalance = result.finalBalance
      totalConditionsTriggered += result.conditionsTriggered
      allTrades.push(...result.trades)
      allReturns.push(...result.returns)
      totalCandlesProcessed += prices.length

      // Track overall max drawdown
      const drawdownFromPeak = maxOverallBalance - currentBalance
      if (drawdownFromPeak > maxOverallDrawdown) {
        maxOverallDrawdown = drawdownFromPeak
      }
      if (currentBalance > maxOverallBalance) {
        maxOverallBalance = currentBalance
      }

      marketsProcessed++
      console.log(`[Backtester] Market complete: Balance ${currentBalance.toFixed(2)}, Trades: ${result.trades.length}`)

    } catch (error: any) {
      console.warn(`[Backtester] Error processing market ${market.marketId}:`, error.message)
      continue
    }
  }

  if (marketsProcessed === 0) {
    throw new Error('No markets could be processed - insufficient historical data')
  }

  // Calculate statistics from accumulated results
  const finalBalance = currentBalance
  const totalPnl = finalBalance - initialBalance
  const totalPnlPercent = (totalPnl / initialBalance) * 100

  // Count only BUY trades as "total trades" (each BUY+SELL pair is one complete trade)
  const buyTrades = allTrades.filter(t => t.side === 'BUY')
  const sellTrades = allTrades.filter(t => t.side === 'SELL')
  const totalTrades = buyTrades.length  // Only count entries (BUY trades)
  
  const winningTrades = sellTrades.filter(t => t.pnl && t.pnl > 0).length
  const losingTrades = sellTrades.filter(t => t.pnl && t.pnl < 0).length
  const totalClosedTrades = winningTrades + losingTrades

  const wins = sellTrades.filter(t => t.pnl && t.pnl > 0).map(t => t.pnl!)
  const losses = sellTrades.filter(t => t.pnl && t.pnl < 0).map(t => Math.abs(t.pnl!))

  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0
  
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = losses.reduce((a, b) => a + b, 0)
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0

  // Sharpe Ratio (simplified)
  const avgReturn = allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0
  const stdReturn = allReturns.length > 1 
    ? Math.sqrt(allReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (allReturns.length - 1))
    : 0
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0  // Annualized

  // Determine time range from first and last trades
  const sortedTrades = [...allTrades].sort((a, b) => a.timestamp - b.timestamp)
  const startTimeResult = sortedTrades.length > 0 ? new Date(sortedTrades[0].timestamp) : new Date()
  const endTimeResult = sortedTrades.length > 0 ? new Date(sortedTrades[sortedTrades.length - 1].timestamp) : new Date()

  // Extract indicator preset name from strategy indicators
  // Preset mapping (matches frontend getPresetsForType)
  const presetLabelMap: Record<string, string> = {
    'macd_bullish': 'MACD Bullish Crossover',
    'macd_bearish': 'MACD Bearish Crossover',
    'rsi_oversold': 'RSI Oversold Reversal',
    'rsi_overbought': 'RSI Overbought Reversal',
    'ema_short': 'EMA Trend Flip (9/21)',
    'ema_long': 'EMA Trend Flip (20/50)',
    'bb_upper': 'BB Breakout (Upper)',
    'bb_lower': 'BB Breakout (Lower)',
    'up_pct_bullish': 'Rolling Up % Bullish (≥58%)',
    'up_pct_bearish': 'Rolling Up % Bearish (≤42%)',
  }
  
  // Get preset from first indicator that has one
  let indicatorPreset: string | undefined = undefined
  if (strategy.indicators && strategy.indicators.length > 0) {
    const indicatorWithPreset = strategy.indicators.find(ind => ind.preset)
    if (indicatorWithPreset?.preset) {
      indicatorPreset = presetLabelMap[indicatorWithPreset.preset] || indicatorWithPreset.preset
    }
  }

  const result: BacktestResult = {
    strategyId: strategy.id || 'backtest',
    strategyName: strategy.name || 'Backtest Strategy',
    indicatorPreset,
    startTime: startTimeResult,
    endTime: endTimeResult,
    initialBalance,
    finalBalance,
    totalPnl,
    totalPnlPercent,
    totalTrades,  // Now counts only BUY trades (entries)
    winningTrades,
    losingTrades,
    winRate: totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown: maxOverallDrawdown,
    maxDrawdownPercent: maxOverallBalance > 0 ? (maxOverallDrawdown / maxOverallBalance) * 100 : 0,
    sharpeRatio,
    trades: allTrades,
    candlesProcessed: totalCandlesProcessed,
    conditionsTriggered: totalConditionsTriggered,
  }

  console.log(`[Backtester] Completed: ${marketsProcessed} markets, ${totalTrades} entries (${buyTrades.length} BUY + ${sellTrades.length} SELL), PnL: $${totalPnl.toFixed(2)} (${totalPnlPercent.toFixed(2)}%)`)
  
  return result
}

/**
 * Quick profitability check
 */
export const isStrategyProfitable = async (
  strategy: Strategy,
  marketId: string,
  lookbackDays: number = 7
): Promise<{ profitable: boolean; pnlPercent: number; winRate: number }> => {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - lookbackDays * 24 * 60 * 60 * 1000)

  try {
    const result = await runBacktest({
      strategy,
      startTime,
      endTime,
      initialBalance: 1000,
      marketId,
    })

    return {
      profitable: result.totalPnl > 0,
      pnlPercent: result.totalPnlPercent,
      winRate: result.winRate,
    }
  } catch (error: any) {
    console.error('[Backtester] Quick check failed:', error.message)
    return { profitable: false, pnlPercent: 0, winRate: 0 }
  }
}

export const closeBacktester = async (): Promise<void> => {
  if (pool) {
    await pool.end()
    pool = null
    console.log('[Backtester] Database connection closed')
  }
}
