/**
 * Candle Recorder for TimescaleDB
 * 
 * Stores OHLCV candles for BTC, ETH, SOL, XRP across multiple timeframes.
 * Uses TimescaleDB hypertables for efficient time-series storage and queries.
 */

import { Pool } from 'pg'

let pool: Pool | null = null
let isInitialized = false
let migrationRun = false

// Candle structure matching cryptoPriceFeeder
export interface Candle {
  symbol: string
  timeframe: string
  timestamp: number      // Start of candle (ms)
  open: number
  high: number
  low: number
  close: number
  volume: number
  isClosed: boolean
}

/**
 * Run database migrations
 */
const runMigrations = async (dbPool: Pool): Promise<void> => {
  if (migrationRun) return

  try {
    console.log('[CandleRecorder] Running database migrations...')

    // Create crypto_candles table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS crypto_candles (
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        open DECIMAL(18, 8) NOT NULL,
        high DECIMAL(18, 8) NOT NULL,
        low DECIMAL(18, 8) NOT NULL,
        close DECIMAL(18, 8) NOT NULL,
        volume DECIMAL(18, 8) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (symbol, timeframe, timestamp)
      )
    `)

    // Create indexes for fast lookups
    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_crypto_candles_symbol_timeframe 
      ON crypto_candles (symbol, timeframe, timestamp DESC)
    `)

    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_crypto_candles_timestamp 
      ON crypto_candles (timestamp DESC)
    `)

    // Try to convert to hypertable (TimescaleDB) - ignore if already done or not available
    try {
      await dbPool.query(`
        SELECT create_hypertable('crypto_candles', 'timestamp', 
          if_not_exists => TRUE,
          migrate_data => TRUE
        )
      `)
      console.log('[CandleRecorder] Converted to TimescaleDB hypertable')
    } catch (error: any) {
      // Ignore if already a hypertable or TimescaleDB not available
      if (!error.message?.includes('already a hypertable')) {
        console.log('[CandleRecorder] Using regular table (TimescaleDB not available)')
      }
    }

    migrationRun = true
    console.log('[CandleRecorder] ✅ Database migrations completed')
  } catch (error: any) {
    console.error('[CandleRecorder] Migration error:', error.message)
  }
}

/**
 * Initialize database connection
 */
export const initializeCandleRecorder = async (): Promise<void> => {
  if (isInitialized) return

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.log('[CandleRecorder] No DATABASE_URL - candle recording disabled')
    return
  }

  try {
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
    console.log('[CandleRecorder] Initialized database connection')

    // Run migrations
    await runMigrations(pool)
  } catch (error: any) {
    console.error('[CandleRecorder] Failed to initialize:', error.message)
  }
}

/**
 * Save a closed candle to the database
 */
export const saveCandle = async (candle: Candle): Promise<boolean> => {
  if (!pool || !isInitialized) return false

  try {
    await pool.query(`
      INSERT INTO crypto_candles (symbol, timeframe, timestamp, open, high, low, close, volume)
      VALUES ($1, $2, to_timestamp($3 / 1000.0), $4, $5, $6, $7, $8)
      ON CONFLICT (symbol, timeframe, timestamp) 
      DO UPDATE SET 
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume
    `, [
      candle.symbol,
      candle.timeframe,
      candle.timestamp,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ])

    return true
  } catch (error: any) {
    console.error('[CandleRecorder] Save error:', error.message)
    return false
  }
}

/**
 * Save multiple candles in a batch (more efficient)
 */
export const saveCandleBatch = async (candles: Candle[]): Promise<number> => {
  if (!pool || !isInitialized || candles.length === 0) return 0

  try {
    // Build batch insert query
    const values: any[] = []
    const placeholders: string[] = []
    let paramIndex = 1

    for (const candle of candles) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, to_timestamp($${paramIndex + 2} / 1000.0), $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`)
      values.push(
        candle.symbol,
        candle.timeframe,
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      )
      paramIndex += 8
    }

    await pool.query(`
      INSERT INTO crypto_candles (symbol, timeframe, timestamp, open, high, low, close, volume)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (symbol, timeframe, timestamp) 
      DO UPDATE SET 
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume
    `, values)

    return candles.length
  } catch (error: any) {
    console.error('[CandleRecorder] Batch save error:', error.message)
    return 0
  }
}

/**
 * Load candle history from database
 */
export const loadCandles = async (
  symbol: string,
  timeframe: string,
  count: number = 100
): Promise<Candle[]> => {
  if (!pool || !isInitialized) return []

  try {
    const result = await pool.query(`
      SELECT 
        symbol,
        timeframe,
        EXTRACT(EPOCH FROM timestamp) * 1000 as timestamp,
        open,
        high,
        low,
        close,
        volume
      FROM crypto_candles
      WHERE symbol = $1 AND timeframe = $2
      ORDER BY timestamp DESC
      LIMIT $3
    `, [symbol, timeframe, count])

    // Reverse to get chronological order and map to Candle type
    return result.rows.reverse().map(row => ({
      symbol: row.symbol,
      timeframe: row.timeframe,
      timestamp: parseFloat(row.timestamp),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume),
      isClosed: true,
    }))
  } catch (error: any) {
    console.error('[CandleRecorder] Load error:', error.message)
    return []
  }
}

/**
 * Get the latest candle timestamp for a symbol/timeframe
 */
export const getLatestCandleTimestamp = async (
  symbol: string,
  timeframe: string
): Promise<number | null> => {
  if (!pool || !isInitialized) return null

  try {
    const result = await pool.query(`
      SELECT EXTRACT(EPOCH FROM MAX(timestamp)) * 1000 as latest
      FROM crypto_candles
      WHERE symbol = $1 AND timeframe = $2
    `, [symbol, timeframe])

    if (result.rows[0]?.latest) {
      return parseFloat(result.rows[0].latest)
    }
    return null
  } catch (error: any) {
    console.error('[CandleRecorder] Get latest error:', error.message)
    return null
  }
}

/**
 * Get candle count for a symbol/timeframe
 */
export const getCandleCount = async (
  symbol: string,
  timeframe: string
): Promise<number> => {
  if (!pool || !isInitialized) return 0

  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM crypto_candles
      WHERE symbol = $1 AND timeframe = $2
    `, [symbol, timeframe])

    return parseInt(result.rows[0]?.count || '0')
  } catch (error: any) {
    console.error('[CandleRecorder] Count error:', error.message)
    return 0
  }
}

/**
 * Get total candle stats
 */
export const getCandleStats = async (): Promise<{
  totalCandles: number
  symbols: string[]
  oldestCandle: Date | null
  newestCandle: Date | null
}> => {
  if (!pool || !isInitialized) {
    return { totalCandles: 0, symbols: [], oldestCandle: null, newestCandle: null }
  }

  try {
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM crypto_candles`)
    const symbolsResult = await pool.query(`SELECT DISTINCT symbol FROM crypto_candles ORDER BY symbol`)
    const rangeResult = await pool.query(`SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM crypto_candles`)

    return {
      totalCandles: parseInt(countResult.rows[0]?.count || '0'),
      symbols: symbolsResult.rows.map(r => r.symbol),
      oldestCandle: rangeResult.rows[0]?.oldest || null,
      newestCandle: rangeResult.rows[0]?.newest || null,
    }
  } catch (error: any) {
    console.error('[CandleRecorder] Stats error:', error.message)
    return { totalCandles: 0, symbols: [], oldestCandle: null, newestCandle: null }
  }
}

/**
 * Check if database is connected
 */
export const isConnected = (): boolean => {
  return isInitialized && pool !== null
}

/**
 * Close database connection
 */
export const closeCandleRecorder = async (): Promise<void> => {
  if (pool) {
    await pool.end()
    pool = null
    isInitialized = false
    console.log('[CandleRecorder] Closed database connection')
  }
}
