/**
 * Indicator Cache - Pre-calculated indicators stored in database
 * 
 * This service pre-calculates indicators for crypto assets and stores them
 * in the database to speed up backtests (no real-time calculation needed)
 */

import { Pool } from 'pg'
import { getCryptoPriceFeeder } from '../polymarket/cryptoPriceFeeder'
import { calculateIndicator, IndicatorConfig } from '../indicators/indicatorCalculator'
import { Candle as IndicatorCandle } from '../indicators/indicatorCalculator'

let pool: Pool | null = null
let isInitialized = false

/**
 * Get the current pool (for checking if initialized)
 */
export const getIndicatorCachePool = (): Pool | null => {
  return pool
}

/**
 * Check if cache is initialized
 */
export const isIndicatorCacheInitialized = (): boolean => {
  return isInitialized && pool !== null
}

/**
 * Initialize database connection
 */
export const initializeIndicatorCache = async (dbPool: Pool): Promise<void> => {
  if (isInitialized && pool !== null) {
    console.log('[IndicatorCache] Already initialized')
    return
  }
  
  if (!dbPool) {
    throw new Error('[IndicatorCache] No database pool provided')
  }
  
  pool = dbPool
  
  try {
    console.log('[IndicatorCache] Creating indicator_cache table...')
    // Create indicator_cache table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS indicator_cache (
        id SERIAL PRIMARY KEY,
        asset TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        indicator_type TEXT NOT NULL,
        indicator_params JSONB NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        value JSONB, -- For single-value indicators (RSI, SMA, EMA, etc.)
        values JSONB, -- For multi-value indicators (MACD, Bollinger, etc.)
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(asset, timeframe, indicator_type, indicator_params, timestamp)
      )
    `)
    console.log('[IndicatorCache] Table created')
    
    // Create indexes for fast lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_indicator_cache_lookup 
      ON indicator_cache (asset, timeframe, indicator_type, indicator_params, timestamp DESC)
    `)
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_indicator_cache_time 
      ON indicator_cache (timestamp DESC)
    `)
    
    isInitialized = true
    console.log('[IndicatorCache] ✅ Database initialized successfully')
  } catch (error: any) {
    console.error('[IndicatorCache] Initialization error:', error.message)
    console.error('[IndicatorCache] Stack:', error.stack)
    isInitialized = false
    pool = null
    throw error
  }
}

/**
 * Pre-calculate and store indicators for an asset/timeframe
 */
export const preCalculateIndicators = async (
  asset: string,
  timeframe: string,
  candleLimit: number = 200
): Promise<void> => {
  if (!pool) {
    throw new Error('IndicatorCache not initialized')
  }
  
  try {
    console.log(`[IndicatorCache] Getting candles for ${asset} ${timeframe}...`)
    const feeder = getCryptoPriceFeeder()
    
    // Map asset names to crypto symbols (same as backtester)
    const symbolMap: Record<string, 'btcusdt' | 'ethusdt' | 'solusdt' | 'xrpusdt'> = {
      BTC: 'btcusdt',
      ETH: 'ethusdt',
      SOL: 'solusdt',
      XRP: 'xrpusdt',
    }
    const symbol = symbolMap[asset.toUpperCase()] || 'btcusdt'
    const tf = timeframe === '1h' || timeframe === 'hourly' ? '1h' : '15m'
    
    console.log(`[IndicatorCache] Using symbol: ${symbol}, timeframe: ${tf}`)
    const rawCandles = feeder.getCandleHistory(symbol, tf, candleLimit)
    console.log(`[IndicatorCache] Got ${rawCandles.length} candles for ${asset} ${timeframe}`)
    
    if (rawCandles.length < 50) {
      console.warn(`[IndicatorCache] Not enough candles for ${asset} ${timeframe}: ${rawCandles.length}`)
      return
    }
    
    const candles: IndicatorCandle[] = rawCandles.map((c: any) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
    
    // Standard indicator configurations to pre-calculate
    const indicatorConfigs: IndicatorConfig[] = [
      // RSI variations
      { type: 'RSI', parameters: { length: 14 } },
      { type: 'RSI', parameters: { length: 9 } },
      { type: 'RSI', parameters: { length: 21 } },
      
      // MACD variations
      { type: 'MACD', parameters: { fast: 12, slow: 26, signal: 9 } },
      { type: 'MACD', parameters: { fast: 8, slow: 21, signal: 5 } },
      
      // Moving averages
      { type: 'SMA', parameters: { length: 20 } },
      { type: 'SMA', parameters: { length: 50 } },
      { type: 'EMA', parameters: { length: 9 } },
      { type: 'EMA', parameters: { length: 20 } },
      { type: 'EMA', parameters: { length: 21 } },
      { type: 'EMA', parameters: { length: 50 } },
      
      // Bollinger Bands
      { type: 'Bollinger Bands', parameters: { length: 20, stdDev: 2 } },
      
      // Stochastic
      { type: 'Stochastic', parameters: { k: 14, smoothK: 1, d: 3 } },
      
      // ATR
      { type: 'ATR', parameters: { length: 14 } },
      
      // VWAP
      { type: 'VWAP', parameters: { resetDaily: 1 } },
      
      // Rolling Up %
      { type: 'Rolling Up %', parameters: { length: 50 } },
    ]
    
    let savedCount = 0
    
    for (const config of indicatorConfigs) {
      try {
        console.log(`[IndicatorCache] Calculating ${config.type} for ${asset} ${timeframe}...`)
        const results = calculateIndicator(candles, config)
        console.log(`[IndicatorCache] ${config.type} returned ${results.length} results`)
        
        // Store each result in database
        for (const result of results) {
          try {
            await pool.query(`
              INSERT INTO indicator_cache (asset, timeframe, indicator_type, indicator_params, timestamp, value, values)
              VALUES ($1, $2, $3, $4, to_timestamp($5/1000.0), $6, $7)
              ON CONFLICT (asset, timeframe, indicator_type, indicator_params, timestamp)
              DO UPDATE SET value = $6, values = $7, created_at = NOW()
            `, [
              asset.toUpperCase(),
              timeframe,
              config.type,
              JSON.stringify(config.parameters || {}),
              result.timestamp,
              result.value !== undefined ? result.value : null,
              result.values ? JSON.stringify(result.values) : null,
            ])
            savedCount++
          } catch (err: any) {
            // Skip duplicate key errors
            if (!err.message?.includes('duplicate')) {
              console.error(`[IndicatorCache] Error saving ${config.type} result:`, err.message)
            }
          }
        }
      } catch (err: any) {
        console.error(`[IndicatorCache] Error calculating ${config.type}:`, err.message)
      }
    }
    
    console.log(`[IndicatorCache] ✅ Pre-calculated ${savedCount} indicator values for ${asset} ${timeframe}`)
  } catch (error: any) {
    console.error(`[IndicatorCache] Error pre-calculating indicators for ${asset} ${timeframe}:`, error.message)
    throw error
  }
}

/**
 * Get cached indicator values from database
 */
export const getCachedIndicators = async (
  asset: string,
  timeframe: string,
  indicatorType: string,
  parameters: Record<string, any>,
  startTime?: number,
  endTime?: number
): Promise<Array<{ timestamp: number; value: number | null; values: Record<string, number> | null }>> => {
  if (!pool || !isInitialized) {
    throw new Error('IndicatorCache not initialized')
  }
  
  try {
    let query = `
      SELECT timestamp, value, values
      FROM indicator_cache
      WHERE asset = $1 
        AND timeframe = $2 
        AND indicator_type = $3 
        AND indicator_params = $4
    `
    const params: any[] = [
      asset.toUpperCase(),
      timeframe,
      indicatorType,
      JSON.stringify(parameters || {}),
    ]
    
    if (startTime) {
      query += ` AND timestamp >= to_timestamp($${params.length + 1}/1000.0)`
      params.push(startTime)
    }
    
    if (endTime) {
      query += ` AND timestamp <= to_timestamp($${params.length + 1}/1000.0)`
      params.push(endTime)
    }
    
    query += ` ORDER BY timestamp ASC LIMIT 10000`
    
    const result = await pool.query(query, params)
    
    return result.rows.map(row => ({
      timestamp: new Date(row.timestamp).getTime(),
      value: row.value,
      values: row.values,
    }))
  } catch (error: any) {
    console.error(`[IndicatorCache] Error fetching cached indicators:`, error.message)
    return []
  }
}

/**
 * Get latest cached indicator value
 */
export const getLatestCachedIndicator = async (
  asset: string,
  timeframe: string,
  indicatorType: string,
  parameters: Record<string, any>
): Promise<{ timestamp: number; value: number | null; values: Record<string, number> | null } | null> => {
  if (!pool) {
    throw new Error('IndicatorCache not initialized')
  }
  
  try {
    const result = await pool.query(`
      SELECT timestamp, value, values
      FROM indicator_cache
      WHERE asset = $1 
        AND timeframe = $2 
        AND indicator_type = $3 
        AND indicator_params = $4
      ORDER BY timestamp DESC
      LIMIT 1
    `, [
      asset.toUpperCase(),
      timeframe,
      indicatorType,
      JSON.stringify(parameters || {}),
    ])
    
    if (result.rows.length === 0) {
      return null
    }
    
    const row = result.rows[0]
    return {
      timestamp: new Date(row.timestamp).getTime(),
      value: row.value,
      values: row.values,
    }
  } catch (error: any) {
    console.error(`[IndicatorCache] Error fetching latest cached indicator:`, error.message)
    return null
  }
}

/**
 * Clean up old cached indicators (keep last 500 candles worth)
 */
export const cleanupOldIndicators = async (): Promise<void> => {
  if (!pool) return
  
  try {
    // Keep indicators from last 30 days
    const result = await pool.query(`
      DELETE FROM indicator_cache
      WHERE timestamp < NOW() - INTERVAL '30 days'
    `)
    
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[IndicatorCache] Cleaned up ${result.rowCount} old indicator cache entries`)
    }
  } catch (error: any) {
    console.error(`[IndicatorCache] Error cleaning up old indicators:`, error.message)
  }
}
