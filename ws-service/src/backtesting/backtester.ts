/**
 * Backtesting Engine
 * 
 * Tests trading strategies against historical price data to evaluate profitability.
 * Uses the same indicator calculations as live trading for accuracy.
 */

import { Pool } from 'pg'
import {
  calculateIndicator,
  IndicatorType,
  Candle,
  IndicatorResult,
} from '../indicators/indicatorCalculator'
import { Strategy, Condition, Indicator } from '../db/strategyRecorder'

// ============================================
// Types
// ============================================

export interface BacktestConfig {
  strategy: Strategy
  startTime: Date
  endTime: Date
  initialBalance: number
  marketId?: string  // Optional: override strategy market
}

export interface BacktestTrade {
  timestamp: number
  side: 'BUY' | 'SELL'
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

/**
 * Load historical price data from database
 */
const loadPriceHistory = async (
  marketId: string,
  startTime: Date,
  endTime: Date
): Promise<PricePoint[]> => {
  if (!pool) throw new Error('Database not initialized')

  const result = await pool.query(`
    SELECT prices
    FROM price_events
    WHERE market_id = $1
      AND event_start >= $2
      AND event_end <= $3
    ORDER BY event_start ASC
  `, [marketId, startTime, endTime])

  // Flatten all price points
  const allPrices: PricePoint[] = []
  for (const row of result.rows) {
    const prices = row.prices as PricePoint[]
    for (const p of prices) {
      if (p.t >= startTime.getTime() && p.t <= endTime.getTime()) {
        allPrices.push(p)
      }
    }
  }

  // Sort by timestamp
  allPrices.sort((a, b) => a.t - b.t)
  
  console.log(`[Backtester] Loaded ${allPrices.length} price points`)
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
 */
const getIndicatorValue = (
  indicatorResults: Map<string, IndicatorResult[]>,
  indicatorId: string,
  candleIndex: number,
  field?: string
): number | null => {
  const results = indicatorResults.get(indicatorId)
  if (!results || candleIndex >= results.length) return null

  const result = results[candleIndex]
  if (!result) return null

  // Handle multi-value indicators (MACD, Bollinger, etc.)
  if (field && result.values) {
    return result.values[field] ?? null
  }

  return result.value
}

/**
 * Evaluate a single condition
 */
const evaluateCondition = (
  condition: Condition,
  indicatorResults: Map<string, IndicatorResult[]>,
  candleIndex: number,
  currentPrice: number
): boolean => {
  // Get source A value
  let valueA: number | null = null
  if (condition.sourceA === 'price') {
    valueA = currentPrice
  } else if (condition.sourceA.includes('.')) {
    const [indicatorId, field] = condition.sourceA.split('.')
    valueA = getIndicatorValue(indicatorResults, indicatorId, candleIndex, field)
  } else {
    valueA = getIndicatorValue(indicatorResults, condition.sourceA, candleIndex)
  }

  if (valueA === null) return false

  // Get source B value
  let valueB: number | null = null
  if (condition.sourceB === 'value') {
    valueB = condition.value ?? null
  } else if (condition.sourceB === 'price') {
    valueB = currentPrice
  } else if (condition.sourceB.includes('.')) {
    const [indicatorId, field] = condition.sourceB.split('.')
    valueB = getIndicatorValue(indicatorResults, indicatorId, candleIndex, field)
  } else {
    valueB = getIndicatorValue(indicatorResults, condition.sourceB, candleIndex)
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
      // Need previous value
      if (candleIndex < 1) return false
      const prevA = condition.sourceA === 'price' 
        ? currentPrice 
        : getIndicatorValue(indicatorResults, condition.sourceA, candleIndex - 1)
      const prevB = condition.sourceB === 'value'
        ? condition.value
        : getIndicatorValue(indicatorResults, condition.sourceB, candleIndex - 1)
      if (prevA === null || prevB === null) return false
      return prevA <= prevB && valueA > valueB
    case 'crosses_below':
      if (candleIndex < 1) return false
      const prevA2 = condition.sourceA === 'price'
        ? currentPrice
        : getIndicatorValue(indicatorResults, condition.sourceA, candleIndex - 1)
      const prevB2 = condition.sourceB === 'value'
        ? condition.value
        : getIndicatorValue(indicatorResults, condition.sourceB, candleIndex - 1)
      if (prevA2 === null || prevB2 === null) return false
      return prevA2 >= prevB2 && valueA < valueB
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
  currentPrice: number
): { triggered: boolean; reasons: string[] } => {
  if (conditions.length === 0) {
    return { triggered: false, reasons: [] }
  }

  const results: boolean[] = []
  const reasons: string[] = []

  for (const condition of conditions) {
    const result = evaluateCondition(condition, indicatorResults, candleIndex, currentPrice)
    results.push(result)
    if (result) {
      reasons.push(`${condition.sourceA} ${condition.operator} ${condition.sourceB}`)
    }
  }

  const triggered = conditionLogic === 'all'
    ? results.every(r => r)
    : results.some(r => r)

  return { triggered, reasons }
}

// ============================================
// Main Backtest Function
// ============================================

/**
 * Run a backtest on a strategy
 */
export const runBacktest = async (config: BacktestConfig): Promise<BacktestResult> => {
  const { strategy, startTime, endTime, initialBalance } = config
  const marketId = config.marketId || strategy.market

  if (!marketId) {
    throw new Error('No market specified for backtest')
  }

  console.log(`[Backtester] Starting backtest for "${strategy.name}"`)
  console.log(`[Backtester] Period: ${startTime.toISOString()} to ${endTime.toISOString()}`)
  console.log(`[Backtester] Market: ${marketId}`)

  // Load price history
  const prices = await loadPriceHistory(marketId, startTime, endTime)
  if (prices.length === 0) {
    throw new Error('No price data found for the specified period')
  }

  // Convert timeframe to minutes
  const timeframeMap: Record<string, number> = {
    '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
  }
  const timeframeMinutes = timeframeMap[strategy.timeframe] || 15

  // Create candles
  const direction = (strategy.direction === 'UP' || strategy.direction === 'up') ? 'UP' : 'DOWN'
  const candles = pricesToCandles(prices, timeframeMinutes, direction)
  
  if (candles.length < 50) {
    throw new Error(`Insufficient candle data (${candles.length} candles, need at least 50)`)
  }

  // Calculate all indicators
  const indicatorResults = new Map<string, IndicatorResult[]>()
  
  for (const indicator of strategy.indicators) {
    if (!indicator.useInConditions) continue

    const results = calculateIndicator(candles, {
      type: indicator.type as IndicatorType,
      parameters: indicator.parameters,
    })
    
    indicatorResults.set(indicator.id, results)
    console.log(`[Backtester] Calculated ${indicator.type}: ${results.length} values`)
  }

  // Run simulation
  let balance = initialBalance
  let position = 0  // Number of shares held
  let positionEntryPrice = 0
  let maxBalance = initialBalance
  let maxDrawdown = 0
  let conditionsTriggered = 0

  const trades: BacktestTrade[] = []
  const returns: number[] = []

  // Start from candle 50 to ensure indicators have warmed up
  for (let i = 50; i < candles.length; i++) {
    const candle = candles[i]
    const price = candle.close

    // Evaluate conditions
    const { triggered, reasons } = evaluateConditions(
      strategy.conditions,
      strategy.conditionLogic,
      indicatorResults,
      i,
      price
    )

    if (triggered) {
      conditionsTriggered++

      // Determine action based on strategy
      const side = strategy.side === 'buy' || strategy.direction === 'UP' ? 'BUY' : 'SELL'

      if (side === 'BUY' && position === 0) {
        // Open long position
        const orderSize = strategy.fixedSharesAmount || Math.floor(balance * 0.1 / price)
        const cost = orderSize * price
        
        if (cost <= balance) {
          position = orderSize
          positionEntryPrice = price
          balance -= cost

          trades.push({
            timestamp: candle.timestamp,
            side: 'BUY',
            price,
            shares: orderSize,
            value: cost,
            balance,
            triggerReason: reasons.join(', '),
          })
        }
      } else if (side === 'SELL' && position > 0) {
        // Close long position
        const value = position * price
        const pnl = value - (position * positionEntryPrice)
        balance += value
        
        returns.push(pnl / (position * positionEntryPrice))

        trades.push({
          timestamp: candle.timestamp,
          side: 'SELL',
          price,
          shares: position,
          value,
          pnl,
          balance,
          triggerReason: reasons.join(', '),
        })

        position = 0
        positionEntryPrice = 0
      }
    }

    // Update max balance and drawdown
    const currentValue = balance + (position * price)
    if (currentValue > maxBalance) {
      maxBalance = currentValue
    }
    const drawdown = maxBalance - currentValue
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }

  // Close any remaining position at last price
  if (position > 0) {
    const lastPrice = candles[candles.length - 1].close
    const value = position * lastPrice
    const pnl = value - (position * positionEntryPrice)
    balance += value
    returns.push(pnl / (position * positionEntryPrice))

    trades.push({
      timestamp: candles[candles.length - 1].timestamp,
      side: 'SELL',
      price: lastPrice,
      shares: position,
      value,
      pnl,
      balance,
      triggerReason: 'End of backtest',
    })
  }

  // Calculate statistics
  const finalBalance = balance
  const totalPnl = finalBalance - initialBalance
  const totalPnlPercent = (totalPnl / initialBalance) * 100

  const winningTrades = trades.filter(t => t.pnl && t.pnl > 0).length
  const losingTrades = trades.filter(t => t.pnl && t.pnl < 0).length
  const totalClosedTrades = winningTrades + losingTrades

  const wins = trades.filter(t => t.pnl && t.pnl > 0).map(t => t.pnl!)
  const losses = trades.filter(t => t.pnl && t.pnl < 0).map(t => Math.abs(t.pnl!))

  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0
  
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = losses.reduce((a, b) => a + b, 0)
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0

  // Sharpe Ratio (simplified)
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const stdReturn = returns.length > 1 
    ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
    : 0
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0  // Annualized

  const result: BacktestResult = {
    strategyId: strategy.id || 'unknown',
    strategyName: strategy.name,
    startTime,
    endTime,
    initialBalance,
    finalBalance,
    totalPnl,
    totalPnlPercent,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate: totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown,
    maxDrawdownPercent: (maxDrawdown / maxBalance) * 100,
    sharpeRatio,
    trades,
    candlesProcessed: candles.length,
    conditionsTriggered,
  }

  console.log(`[Backtester] Completed: ${trades.length} trades, PnL: $${totalPnl.toFixed(2)} (${totalPnlPercent.toFixed(2)}%)`)
  
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
