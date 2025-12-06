/**
 * Strategy Monitor
 * 
 * Background loop that checks active strategies against current indicator values.
 * Runs every minute (aligned with candle closes) and emits events when conditions are met.
 */

import { EventEmitter } from 'events'
import { getCryptoPriceFeeder } from '../polymarket/cryptoPriceFeeder'
import {
  calculateIndicator,
  crossedAbove,
  crossedBelow,
  crossedAboveIndicator,
  crossedBelowIndicator,
  IndicatorResult,
  Candle,
  IndicatorType,
} from '../indicators/indicatorCalculator'

// ============================================
// Types
// ============================================

interface Indicator {
  id: string
  type: string
  timeframe: string
  parameters: Record<string, number>
  useInConditions: boolean
  preset?: string
}

interface Condition {
  id: string
  sourceA: string
  operator: string
  sourceB: string
  value?: number
  value2?: number
  candle: 'current' | 'previous'
}

interface Strategy {
  id: string
  userAddress: string
  name: string
  asset: string
  direction: string
  timeframe: string
  isActive: boolean
  indicators: Indicator[]
  conditionLogic: 'all' | 'any'
  conditions: Condition[]
}

interface StrategyTrigger {
  strategyId: string
  strategyName: string
  userAddress: string
  asset: string
  direction: string
  triggeredConditions: {
    conditionId: string
    description: string
  }[]
  indicatorValues: Record<string, number | null>
  timestamp: number
}

type Timeframe = '1m' | '5m' | '15m' | '1h'

// Symbol mapping from strategy asset to feeder symbol
const ASSET_TO_SYMBOL: Record<string, string> = {
  'BTC': 'btcusdt',
  'ETH': 'ethusdt',
  'SOL': 'solusdt',
  'XRP': 'xrpusdt',
}

// ============================================
// Strategy Monitor Class
// ============================================

class StrategyMonitor extends EventEmitter {
  private isRunning = false
  private checkInterval: NodeJS.Timeout | null = null
  private lastCheckTime = 0
  private indicatorCache: Map<string, { results: IndicatorResult[], timestamp: number }> = new Map()
  private readonly CACHE_TTL = 55000 // 55 seconds (slightly less than 1 minute)

  /**
   * Start the strategy monitor
   * Checks every minute, aligned with candle closes
   */
  start(): void {
    if (this.isRunning) {
      console.log('[StrategyMonitor] Already running')
      return
    }

    this.isRunning = true
    console.log('[StrategyMonitor] Started - checking strategies every minute')

    // Run immediately on start
    this.runCheck()

    // Then run every minute, aligned to candle closes
    this.scheduleNextCheck()
  }

  /**
   * Schedule next check aligned to minute boundary
   */
  private scheduleNextCheck(): void {
    const now = Date.now()
    const nextMinute = Math.ceil(now / 60000) * 60000
    const delay = nextMinute - now + 1000 // Add 1 second buffer for candle to close

    this.checkInterval = setTimeout(() => {
      if (this.isRunning) {
        this.runCheck()
        this.scheduleNextCheck()
      }
    }, delay)
  }

  /**
   * Run a single check cycle
   */
  async runCheck(): Promise<void> {
    const startTime = Date.now()
    
    try {
      // Get active strategies from database
      const strategies = await this.getActiveStrategies()
      
      if (strategies.length === 0) {
        return
      }

      console.log(`[StrategyMonitor] Checking ${strategies.length} active strategies...`)

      let triggeredCount = 0

      for (const strategy of strategies) {
        try {
          const triggered = await this.checkStrategy(strategy)
          if (triggered) {
            triggeredCount++
          }
        } catch (error) {
          console.error(`[StrategyMonitor] Error checking strategy ${strategy.name}:`, error)
        }
      }

      const duration = Date.now() - startTime
      console.log(`[StrategyMonitor] Check complete: ${triggeredCount}/${strategies.length} triggered in ${duration}ms`)
      
      this.lastCheckTime = startTime
    } catch (error) {
      console.error('[StrategyMonitor] Check cycle error:', error)
    }
  }

  /**
   * Check a single strategy's conditions
   */
  private async checkStrategy(strategy: Strategy): Promise<boolean> {
    const feeder = getCryptoPriceFeeder()
    const symbol = ASSET_TO_SYMBOL[strategy.asset]
    
    if (!symbol) {
      console.warn(`[StrategyMonitor] Unknown asset: ${strategy.asset}`)
      return false
    }

    // Calculate all indicator values needed for this strategy
    const indicatorValues: Record<string, IndicatorResult[]> = {}
    
    for (const indicator of strategy.indicators) {
      const timeframe = indicator.timeframe === 'Use strategy timeframe' 
        ? strategy.timeframe 
        : indicator.timeframe

      // Get candles for this symbol/timeframe
      const candles = this.getCandles(symbol, timeframe as Timeframe)
      
      if (candles.length === 0) {
        continue
      }

      // Calculate indicator (with caching)
      const cacheKey = `${symbol}_${timeframe}_${indicator.type}_${JSON.stringify(indicator.parameters)}`
      const cached = this.indicatorCache.get(cacheKey)
      
      let results: IndicatorResult[]
      
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        results = cached.results
      } else {
        results = calculateIndicator(candles, {
          type: indicator.type as IndicatorType,
          parameters: indicator.parameters,
        })
        this.indicatorCache.set(cacheKey, { results, timestamp: Date.now() })
      }

      indicatorValues[`indicator_${indicator.id}`] = results
    }

    // Also get price data for price-based conditions
    const mainTimeframe = strategy.timeframe as Timeframe
    const priceCandles = this.getCandles(symbol, mainTimeframe)
    
    // Check conditions
    const conditionResults: { conditionId: string; met: boolean; description: string }[] = []

    for (const condition of strategy.conditions) {
      const met = this.evaluateCondition(condition, indicatorValues, priceCandles)
      conditionResults.push({
        conditionId: condition.id,
        met,
        description: this.describeCondition(condition, indicatorValues),
      })
    }

    // Determine if strategy triggered based on conditionLogic
    let triggered: boolean
    if (strategy.conditionLogic === 'all') {
      triggered = conditionResults.every(r => r.met)
    } else {
      triggered = conditionResults.some(r => r.met)
    }

    if (triggered) {
      // Build trigger event
      const trigger: StrategyTrigger = {
        strategyId: strategy.id,
        strategyName: strategy.name,
        userAddress: strategy.userAddress,
        asset: strategy.asset,
        direction: strategy.direction,
        triggeredConditions: conditionResults
          .filter(r => r.met)
          .map(r => ({ conditionId: r.conditionId, description: r.description })),
        indicatorValues: this.getLatestIndicatorValues(indicatorValues),
        timestamp: Date.now(),
      }

      console.log(`[StrategyMonitor] 🎯 Strategy triggered: "${strategy.name}" for ${strategy.asset}`)
      this.emit('strategyTriggered', trigger)
    }

    return triggered
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: Condition,
    indicatorValues: Record<string, IndicatorResult[]>,
    priceCandles: Candle[]
  ): boolean {
    const { sourceA, operator, sourceB, value } = condition

    // Get source A value
    const sourceAResults = this.getSourceResults(sourceA, indicatorValues, priceCandles)
    if (!sourceAResults || sourceAResults.length < 2) return false

    // Handle different operators
    switch (operator) {
      case 'crosses above': {
        if (sourceB && sourceB.startsWith('indicator_')) {
          // Crossing another indicator
          const sourceBResults = this.getSourceResults(sourceB, indicatorValues, priceCandles)
          if (!sourceBResults || sourceBResults.length < 2) return false
          return crossedAboveIndicator(sourceAResults, sourceBResults)
        } else {
          // Crossing a threshold value
          const threshold = value ?? 0
          return crossedAbove(sourceAResults, threshold)
        }
      }

      case 'crosses below': {
        if (sourceB && sourceB.startsWith('indicator_')) {
          const sourceBResults = this.getSourceResults(sourceB, indicatorValues, priceCandles)
          if (!sourceBResults || sourceBResults.length < 2) return false
          return crossedBelowIndicator(sourceAResults, sourceBResults)
        } else {
          const threshold = value ?? 0
          return crossedBelow(sourceAResults, threshold)
        }
      }

      case '>':
      case 'greater than': {
        const currentA = sourceAResults[sourceAResults.length - 1]?.value
        if (currentA === null || currentA === undefined) return false
        
        if (sourceB && sourceB.startsWith('indicator_')) {
          const sourceBResults = this.getSourceResults(sourceB, indicatorValues, priceCandles)
          const currentB = sourceBResults?.[sourceBResults.length - 1]?.value
          if (currentB === null || currentB === undefined) return false
          return currentA > currentB
        } else {
          return currentA > (value ?? 0)
        }
      }

      case '<':
      case 'less than': {
        const currentA = sourceAResults[sourceAResults.length - 1]?.value
        if (currentA === null || currentA === undefined) return false
        
        if (sourceB && sourceB.startsWith('indicator_')) {
          const sourceBResults = this.getSourceResults(sourceB, indicatorValues, priceCandles)
          const currentB = sourceBResults?.[sourceBResults.length - 1]?.value
          if (currentB === null || currentB === undefined) return false
          return currentA < currentB
        } else {
          return currentA < (value ?? 0)
        }
      }

      case '>=':
      case 'greater than or equal': {
        const currentA = sourceAResults[sourceAResults.length - 1]?.value
        if (currentA === null || currentA === undefined) return false
        return currentA >= (value ?? 0)
      }

      case '<=':
      case 'less than or equal': {
        const currentA = sourceAResults[sourceAResults.length - 1]?.value
        if (currentA === null || currentA === undefined) return false
        return currentA <= (value ?? 0)
      }

      case '==':
      case 'equals': {
        const currentA = sourceAResults[sourceAResults.length - 1]?.value
        if (currentA === null || currentA === undefined) return false
        return Math.abs(currentA - (value ?? 0)) < 0.0001
      }

      case 'between': {
        const currentA = sourceAResults[sourceAResults.length - 1]?.value
        if (currentA === null || currentA === undefined) return false
        const { value: v1, value2: v2 } = condition
        if (v1 === undefined || v2 === undefined) return false
        return currentA >= v1 && currentA <= v2
      }

      default:
        console.warn(`[StrategyMonitor] Unknown operator: ${operator}`)
        return false
    }
  }

  /**
   * Get results for a source (indicator or price)
   */
  private getSourceResults(
    source: string,
    indicatorValues: Record<string, IndicatorResult[]>,
    priceCandles: Candle[]
  ): IndicatorResult[] | null {
    if (source.startsWith('indicator_')) {
      return indicatorValues[source] || null
    }

    // Price-based sources
    if (priceCandles.length === 0) return null

    const results: IndicatorResult[] = priceCandles.map(c => {
      let value: number
      switch (source) {
        case 'Close':
          value = c.close
          break
        case 'Open':
          value = c.open
          break
        case 'High':
          value = c.high
          break
        case 'Low':
          value = c.low
          break
        default:
          value = c.close
      }
      return { timestamp: c.timestamp, value }
    })

    return results
  }

  /**
   * Get candles from the price feeder
   */
  private getCandles(symbol: string, timeframe: Timeframe): Candle[] {
    const feeder = getCryptoPriceFeeder()
    const history = feeder.getCandleHistory(symbol as 'btcusdt' | 'ethusdt' | 'solusdt' | 'xrpusdt', timeframe)
    
    // Convert to Candle format
    return history.map(c => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  }

  /**
   * Describe a condition in human-readable format
   */
  private describeCondition(
    condition: Condition,
    indicatorValues: Record<string, IndicatorResult[]>
  ): string {
    const { sourceA, operator, sourceB, value } = condition
    
    const sourceAName = sourceA.startsWith('indicator_') 
      ? `Indicator ${sourceA.replace('indicator_', '')}`
      : sourceA

    if (sourceB && sourceB.startsWith('indicator_')) {
      const sourceBName = `Indicator ${sourceB.replace('indicator_', '')}`
      return `${sourceAName} ${operator} ${sourceBName}`
    } else {
      return `${sourceAName} ${operator} ${value ?? ''}`
    }
  }

  /**
   * Get latest values from indicator results
   */
  private getLatestIndicatorValues(
    indicatorValues: Record<string, IndicatorResult[]>
  ): Record<string, number | null> {
    const latest: Record<string, number | null> = {}
    
    for (const [key, results] of Object.entries(indicatorValues)) {
      if (results.length > 0) {
        latest[key] = results[results.length - 1].value
      }
    }
    
    return latest
  }

  /**
   * Get active strategies from database
   * TODO: Import from strategyRecorder when DB is connected
   */
  private async getActiveStrategies(): Promise<Strategy[]> {
    // Import dynamically to avoid circular dependencies
    try {
      const { getActiveStrategies } = await import('../db/strategyRecorder')
      const strategies = await getActiveStrategies()
      return strategies as Strategy[]
    } catch (error) {
      // DB not available, return empty
      return []
    }
  }

  /**
   * Stop the strategy monitor
   */
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    
    if (this.checkInterval) {
      clearTimeout(this.checkInterval)
      this.checkInterval = null
    }

    this.indicatorCache.clear()
    console.log('[StrategyMonitor] Stopped')
  }

  /**
   * Get monitor status
   */
  getStatus(): {
    isRunning: boolean
    lastCheckTime: number
    cacheSize: number
  } {
    return {
      isRunning: this.isRunning,
      lastCheckTime: this.lastCheckTime,
      cacheSize: this.indicatorCache.size,
    }
  }

  /**
   * Manually trigger a check (for testing)
   */
  async triggerCheck(): Promise<void> {
    await this.runCheck()
  }

  /**
   * Clear the indicator cache
   */
  clearCache(): void {
    this.indicatorCache.clear()
  }
}

// ============================================
// Singleton Instance
// ============================================

let monitorInstance: StrategyMonitor | null = null

export const getStrategyMonitor = (): StrategyMonitor => {
  if (!monitorInstance) {
    monitorInstance = new StrategyMonitor()
  }
  return monitorInstance
}

export type { StrategyTrigger, Strategy, Indicator, Condition }
