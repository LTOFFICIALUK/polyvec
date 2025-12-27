/**
 * Price recorder for TimescaleDB - OPTIMIZED VERSION
 * 
 * Storage optimization strategy:
 * - Store 1 row per MARKET EVENT (15m or 1h window) instead of 1 row per second
 * - Use JSONB arrays to store all price points compactly
 * - This reduces storage by 1000x+ while keeping every second of data
 * 
 * Data format per row:
 * - market_id, event_start, event_end, yes_token_id, no_token_id
 * - prices: JSONB array of {t: timestamp_ms, yb: yes_bid, ya: yes_ask, nb: no_bid, na: no_ask}
 * - Prices stored as integers (cents) to save space
 */

import { Pool } from 'pg'

let pool: Pool | null = null
let isInitialized = false
let migrationRun = false

/**
 * Get the current database pool (if initialized)
 */
export const getPriceRecorderPool = (): Pool | null => {
  return pool
}

// In-memory buffer for current market prices
// Key: marketId, Value: { eventStart, eventEnd, yesTokenId, noTokenId, prices: [] }
interface PricePoint {
  t: number  // timestamp ms
  yb: number // yes bid (cents)
  ya: number // yes ask (cents)
  nb: number // no bid (cents)
  na: number // no ask (cents)
}

interface MarketBuffer {
  eventStart: number
  eventEnd: number
  yesTokenId: string
  noTokenId: string
  prices: PricePoint[]
  lastFlush: number
}

const marketBuffers = new Map<string, MarketBuffer>()

// Flush interval - write to DB every 30 seconds
const FLUSH_INTERVAL_MS = 30000

/**
 * Run database migrations (create tables if they don't exist)
 */
const runMigrations = async (pool: Pool): Promise<void> => {
  if (migrationRun) return
  
  try {
    console.log('[PriceRecorder] Running database migrations (optimized schema)...')
    
    // Enable TimescaleDB extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS timescaledb')
    
    // Create optimized price_events table - 1 row per market event
    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_events (
        id SERIAL,
        market_id TEXT NOT NULL,
        event_start TIMESTAMPTZ NOT NULL,
        event_end TIMESTAMPTZ NOT NULL,
        yes_token_id TEXT NOT NULL,
        no_token_id TEXT NOT NULL,
        prices JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (market_id, event_start)
      )
    `)
    
    // Migrate PRIMARY KEY from (market_id, event_start) to just (market_id) if needed
    // This allows proper merging when event_start changes (prevents data loss)
    try {
      // Check if table has composite primary key
      const pkCheck = await pool.query(`
        SELECT COUNT(*) as pk_count
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'price_events' 
        AND tc.constraint_type = 'PRIMARY KEY'
        GROUP BY tc.constraint_name
        HAVING COUNT(kcu.column_name) > 1
      `)
      
      if (pkCheck.rows.length > 0 && pkCheck.rows[0].pk_count > 1) {
        console.log('[PriceRecorder] Migrating PRIMARY KEY from (market_id, event_start) to (market_id)...')
        
        // Handle duplicates by keeping the row with the earliest event_start for each market_id
        await pool.query(`
          DELETE FROM price_events p1
          WHERE EXISTS (
            SELECT 1 FROM price_events p2
            WHERE p2.market_id = p1.market_id
            AND p2.event_start < p1.event_start
          )
        `)
        
        // Drop old primary key constraint
        await pool.query(`
          ALTER TABLE price_events DROP CONSTRAINT IF EXISTS price_events_pkey
        `)
        
        // Add new primary key (just market_id)
        await pool.query(`
          ALTER TABLE price_events ADD CONSTRAINT price_events_pkey PRIMARY KEY (market_id)
        `)
        
        console.log('[PriceRecorder] ✅ PRIMARY KEY migration completed')
      }
    } catch (error: any) {
      // If migration fails, table might already have correct structure or doesn't exist yet
      console.log('[PriceRecorder] Primary key migration (non-fatal):', error.message)
    }
    
    // Create index for fast lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_price_events_market_time 
      ON price_events (market_id, event_start DESC)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_price_events_time 
      ON price_events (event_start DESC)
    `)
    
    // No retention policy - we keep data forever!
    // JSONB compression is built-in and very efficient
    
    migrationRun = true
    console.log('[PriceRecorder] ✅ Database migrations completed (optimized schema)')
  } catch (error: any) {
    console.error('[PriceRecorder] Migration error:', error.message)
  }
}

/**
 * Initialize database connection pool
 */
export const initializePriceRecorder = async (): Promise<Pool | null> => {
  if (isInitialized) return pool

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.log('[PriceRecorder] No DATABASE_URL - price recording disabled')
    return null
  }

  try {
    // Railway internal connections don't need SSL
    // Only use SSL for external/public connections
    const useSSL = databaseUrl.includes('proxy.rlwy.net') || databaseUrl.includes('railway.app')
    
    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    })

    // Test connection
    await pool.query('SELECT 1')
    isInitialized = true
    console.log('[PriceRecorder] Initialized database connection pool')

    // Run migrations automatically
    await runMigrations(pool)
    
    // Start periodic flush
    setInterval(flushAllBuffers, FLUSH_INTERVAL_MS)
    console.log(`[PriceRecorder] Started periodic flush every ${FLUSH_INTERVAL_MS/1000}s`)
    
    return pool
  } catch (error: any) {
    console.error('[PriceRecorder] Failed to initialize:', error.message)
    return null
  }
}

/**
 * Add a price point to the buffer for a market
 * This is called every second for each market
 */
export const recordPrice = async (
  marketId: string,
  tokenId: string,
  bestBid: number,
  bestAsk: number,
  isYesToken: boolean = true,
  yesTokenId?: string,
  noTokenId?: string,
  eventStart?: number,
  eventEnd?: number
): Promise<void> => {
  if (!isInitialized) return
  
  // Convert to cents (integers) for compact storage
  const bidCents = Math.round(bestBid <= 1 ? bestBid * 100 : bestBid)
  const askCents = Math.round(bestAsk <= 1 ? bestAsk * 100 : bestAsk)
  const now = Date.now()
  
  // Get or create buffer for this market
  let buffer = marketBuffers.get(marketId)
  
  // If no buffer or event window changed, create new buffer
  if (!buffer || (eventStart && buffer.eventStart !== eventStart)) {
    buffer = {
      eventStart: eventStart || now,
      eventEnd: eventEnd || now + 3600000, // Default 1 hour
      yesTokenId: yesTokenId || tokenId,
      noTokenId: noTokenId || '',
      prices: [],
      lastFlush: now,
    }
    marketBuffers.set(marketId, buffer)
  }
  
  // Update token IDs if provided
  if (yesTokenId) buffer.yesTokenId = yesTokenId
  if (noTokenId) buffer.noTokenId = noTokenId
  if (eventEnd) buffer.eventEnd = eventEnd
  
  // Find or create price point for this timestamp
  const lastPrice = buffer.prices[buffer.prices.length - 1]
  const shouldAddNew = !lastPrice || (now - lastPrice.t) >= 900 // At least 900ms apart
  
  if (shouldAddNew) {
    // Add new price point
    const newPoint: PricePoint = {
      t: now,
      yb: isYesToken ? bidCents : (lastPrice?.yb || 0),
      ya: isYesToken ? askCents : (lastPrice?.ya || 0),
      nb: !isYesToken ? bidCents : (lastPrice?.nb || 0),
      na: !isYesToken ? askCents : (lastPrice?.na || 0),
    }
    buffer.prices.push(newPoint)
  } else {
    // Update existing price point
    if (isYesToken) {
      lastPrice.yb = bidCents
      lastPrice.ya = askCents
    } else {
      lastPrice.nb = bidCents
      lastPrice.na = askCents
    }
  }
}

// Track all active market buffers for debugging
const getActiveBufferKeys = (): string[] => Array.from(marketBuffers.keys())

/**
 * Record prices for both YES and NO tokens of a market
 * Note: This may be called with partial data (either YES or NO, not both)
 * So we only update non-zero values to preserve previous data
 */
export const recordMarketPrices = async (
  marketId: string,
  yesTokenId: string,
  noTokenId: string,
  yesBid: number,
  yesAsk: number,
  noBid: number,
  noAsk: number,
  eventStart?: number,
  eventEnd?: number
): Promise<void> => {
  if (!isInitialized) return
  
  // Convert to cents (only if value is provided/non-zero)
  const yesBidCents = yesBid > 0 ? Math.round(yesBid <= 1 ? yesBid * 100 : yesBid) : 0
  const yesAskCents = yesAsk > 0 ? Math.round(yesAsk <= 1 ? yesAsk * 100 : yesAsk) : 0
  const noBidCents = noBid > 0 ? Math.round(noBid <= 1 ? noBid * 100 : noBid) : 0
  const noAskCents = noAsk > 0 ? Math.round(noAsk <= 1 ? noAsk * 100 : noAsk) : 0
  const now = Date.now()
  
  // Get or create buffer
  let buffer = marketBuffers.get(marketId)
  
  if (!buffer) {
    // Create new buffer - use provided eventStart or current time as fallback
    buffer = {
      eventStart: eventStart || now,
      eventEnd: eventEnd || now + 3600000,
      yesTokenId,
      noTokenId,
      prices: [],
      lastFlush: now,
    }
    marketBuffers.set(marketId, buffer)
    console.log(`[PriceRecorder] NEW buffer for marketId: ${marketId.substring(0, 30)}... eventStart=${eventStart ? new Date(eventStart).toISOString() : 'NOW'} (total buffers: ${marketBuffers.size})`)
  } else if (eventStart && buffer.eventStart !== eventStart) {
    // Event start time changed - update the buffer's eventStart (don't lose existing prices)
    // This can happen when market metadata is corrected
    console.log(`[PriceRecorder] Updating eventStart for market ${marketId.substring(0, 30)}... from ${new Date(buffer.eventStart).toISOString()} to ${new Date(eventStart).toISOString()}`)
    buffer.eventStart = eventStart
  }
  
  // Now buffer is guaranteed to exist
  const currentBuffer = buffer
  
  // Update metadata
  if (yesTokenId) currentBuffer.yesTokenId = yesTokenId
  if (noTokenId) currentBuffer.noTokenId = noTokenId
  if (eventEnd) currentBuffer.eventEnd = eventEnd
  
  // Add or update price point
  // Only update non-zero values to preserve data from other token updates
  const lastPrice = currentBuffer.prices[currentBuffer.prices.length - 1]
  const shouldAddNew = !lastPrice || (now - lastPrice.t) >= 900
  
  if (shouldAddNew) {
    // Create new point, preserving previous values for fields not being updated
    const newPoint = {
      t: now,
      yb: yesBidCents > 0 ? yesBidCents : (lastPrice?.yb || 0),
      ya: yesAskCents > 0 ? yesAskCents : (lastPrice?.ya || 0),
      nb: noBidCents > 0 ? noBidCents : (lastPrice?.nb || 0),
      na: noAskCents > 0 ? noAskCents : (lastPrice?.na || 0),
    }
    currentBuffer.prices.push(newPoint)
    
    // Log periodically - show BOTH prices
    if (currentBuffer.prices.length % 30 === 1) {
      console.log(`[PriceRecorder] Buffer ${marketId.substring(0, 25)}... has ${currentBuffer.prices.length} points. UP(yb)=${newPoint.yb}c DOWN(nb)=${newPoint.nb}c`)
    }
  } else if (lastPrice) {
    // Update existing point - only update non-zero values
    if (yesBidCents > 0) lastPrice.yb = yesBidCents
    if (yesAskCents > 0) lastPrice.ya = yesAskCents
    if (noBidCents > 0) lastPrice.nb = noBidCents
    if (noAskCents > 0) lastPrice.na = noAskCents
    
    // Log when updating to see both values
    const updateCount = ((recordMarketPrices as any).updateCount || 0) + 1
    ;(recordMarketPrices as any).updateCount = updateCount
    if (updateCount % 60 === 0) {
      console.log(`[PriceRecorder] Updated point: UP(yb)=${lastPrice.yb}c DOWN(nb)=${lastPrice.nb}c`)
    }
  }
}

/**
 * Flush a market's buffer to the database
 */
const flushBuffer = async (marketId: string, buffer: MarketBuffer): Promise<void> => {
  if (!pool || buffer.prices.length === 0) return
  
  try {
    // First check if record exists to decide whether to merge or insert
    const existingResult = await pool.query(
      'SELECT prices FROM price_events WHERE market_id = $1',
      [marketId]
    )
    
    if (existingResult.rows.length > 0) {
      // Merge prices arrays - combine existing and new, remove duplicates by timestamp
      const existingPrices = existingResult.rows[0].prices as PricePoint[]
      const newPrices = buffer.prices
      
      // Create a map to deduplicate by timestamp (keep the most recent)
      const priceMap = new Map<number, PricePoint>()
      
      // Add existing prices first
      for (const p of existingPrices) {
        priceMap.set(p.t, p)
      }
      
      // Add/update with new prices (newer data takes precedence for same timestamp)
      for (const p of newPrices) {
        const existing = priceMap.get(p.t)
        if (!existing || p.yb > 0 || p.ya > 0 || p.nb > 0 || p.na > 0) {
          // Update if new price has non-zero values
          if (existing) {
            // Merge non-zero values
            priceMap.set(p.t, {
              t: p.t,
              yb: p.yb > 0 ? p.yb : existing.yb,
              ya: p.ya > 0 ? p.ya : existing.ya,
              nb: p.nb > 0 ? p.nb : existing.nb,
              na: p.na > 0 ? p.na : existing.na,
            })
          } else {
            priceMap.set(p.t, p)
          }
        }
      }
      
      // Convert back to array and sort by timestamp
      const mergedPrices = Array.from(priceMap.values()).sort((a, b) => a.t - b.t)
      
      // Update with merged prices
      await pool.query(`
        UPDATE price_events 
        SET 
          event_start = GREATEST(event_start, to_timestamp($2/1000.0)),
          event_end = LEAST(event_end, to_timestamp($3/1000.0)),
          yes_token_id = COALESCE(NULLIF($4, ''), yes_token_id),
          no_token_id = COALESCE(NULLIF($5, ''), no_token_id),
          prices = $6,
          updated_at = NOW()
        WHERE market_id = $1
      `, [
        marketId,
        buffer.eventStart,
        buffer.eventEnd,
        buffer.yesTokenId,
        buffer.noTokenId,
        JSON.stringify(mergedPrices),
      ])
    } else {
      // Insert new record
      await pool.query(`
        INSERT INTO price_events (market_id, event_start, event_end, yes_token_id, no_token_id, prices, updated_at)
        VALUES ($1, to_timestamp($2/1000.0), to_timestamp($3/1000.0), $4, $5, $6, NOW())
      `, [
        marketId,
        buffer.eventStart,
        buffer.eventEnd,
        buffer.yesTokenId,
        buffer.noTokenId,
        JSON.stringify(buffer.prices),
      ])
    }
    
    buffer.lastFlush = Date.now()
    
    // Log occasionally
    const flushCount = ((flushBuffer as any).count || 0) + 1
    ;(flushBuffer as any).count = flushCount
    if (flushCount % 10 === 0) {
      console.log(`[PriceRecorder] Flushed ${buffer.prices.length} prices for market ${marketId.substring(0, 20)}...`)
    }
  } catch (error: any) {
    console.error(`[PriceRecorder] Flush error for ${marketId}:`, error.message)
  }
}

/**
 * Flush all market buffers to database
 */
const flushAllBuffers = async (): Promise<void> => {
  const now = Date.now()
  
  for (const [marketId, buffer] of marketBuffers.entries()) {
    // Flush if buffer has data
    if (buffer.prices.length > 0) {
      await flushBuffer(marketId, buffer)
    }
    
    // Clean up old buffers (event ended more than 5 minutes ago)
    if (buffer.eventEnd < now - 300000) {
      // Final flush before removing
      if (buffer.prices.length > 0) {
        await flushBuffer(marketId, buffer)
      }
      marketBuffers.delete(marketId)
    }
  }
}

/**
 * Query price history for a market
 * Returns array of { time, upPrice, downPrice } for chart rendering
 */
export const queryPriceHistory = async (
  marketId: string | null,
  yesTokenId: string | null,
  noTokenId: string | null,
  startTime: Date | null,
  endTime: Date | null
): Promise<Array<{ time: number; upPrice: number; downPrice: number }>> => {
  const activeBuffers = getActiveBufferKeys()
  console.log(`[PriceRecorder] Query: marketId=${marketId}`)
  console.log(`[PriceRecorder] Active buffers (${activeBuffers.length}): ${activeBuffers.map(k => k.substring(0, 25) + '...').join(', ')}`)
  
  const chartData: Array<{ time: number; upPrice: number; downPrice: number }> = []
  
  // FIRST: Check in-memory buffer (most recent data, not yet flushed)
  if (marketId) {
    const buffer = marketBuffers.get(marketId)
    if (buffer && buffer.prices.length > 0) {
      console.log(`[PriceRecorder] ✅ Found ${buffer.prices.length} prices in memory buffer for market ${marketId.substring(0,25)}...`)
      for (const p of buffer.prices) {
        // Filter by time range if specified
        if (startTime && p.t < startTime.getTime()) continue
        if (endTime && p.t > endTime.getTime()) continue
        
        chartData.push({
          time: p.t,
          upPrice: p.yb / 100,
          downPrice: p.nb / 100,
        })
      }
      console.log(`[PriceRecorder] After time filter: ${chartData.length} points`)
    } else {
      console.log(`[PriceRecorder] ❌ No buffer found for marketId: ${marketId}`)
    }
  }
  
  // THEN: Query database for persisted data
  if (!pool) {
    console.log(`[PriceRecorder] No DB pool, returning ${chartData.length} points from memory only`)
    return chartData.sort((a, b) => a.time - b.time)
  }

  try {
    // Query price events - simplified query, just match marketId
    let query = `
      SELECT market_id, event_start, event_end, yes_token_id, no_token_id, prices
      FROM price_events
      WHERE market_id = $1
      ORDER BY event_start ASC
      LIMIT 100
    `
    
    const result = await pool.query(query, [marketId])
    console.log(`[PriceRecorder] DB returned ${result.rows.length} event rows`)
    
    // Flatten all price points from all matching events
    for (const row of result.rows) {
      const prices = row.prices as PricePoint[]
      
      for (const p of prices) {
        // Filter by time range if specified
        if (startTime && p.t < startTime.getTime()) continue
        if (endTime && p.t > endTime.getTime()) continue
        
        // Avoid duplicates (might be in both memory and DB)
        if (!chartData.some(d => Math.abs(d.time - p.t) < 500)) {
          chartData.push({
            time: p.t,
            upPrice: p.yb / 100,
            downPrice: p.nb / 100,
          })
        }
      }
    }
    
    // Sort by time
    chartData.sort((a, b) => a.time - b.time)
    
    console.log(`[PriceRecorder] Returning ${chartData.length} total price points`)
    return chartData
  } catch (error: any) {
    console.error('[PriceRecorder] Query error:', error)
    // Return memory data even if DB query fails
    console.log(`[PriceRecorder] DB error, returning ${chartData.length} points from memory`)
    return chartData.sort((a, b) => a.time - b.time)
  }
}

/**
 * Close database connection pool (for graceful shutdown)
 */
export const closePriceRecorder = async (): Promise<void> => {
  // Flush all buffers before closing
  await flushAllBuffers()
  
  if (pool) {
    await pool.end()
    pool = null
    isInitialized = false
    console.log('[PriceRecorder] Closed database connection pool')
  }
}
