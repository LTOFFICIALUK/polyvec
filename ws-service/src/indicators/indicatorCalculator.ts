/**
 * Indicator Calculator - TradingView Parity Edition
 * 
 * Pure TypeScript implementations matching TradingView's exact Pine Script formulas.
 * No external library dependencies - full control over calculations.
 */

// ============================================
// Types
// ============================================

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndicatorResult {
  timestamp: number
  value: number | null
  values?: Record<string, number | null>
}

export interface MACDResult extends IndicatorResult {
  values: {
    macd: number | null
    signal: number | null
    histogram: number | null
  }
}

export interface BollingerResult extends IndicatorResult {
  values: {
    upper: number | null
    middle: number | null
    lower: number | null
  }
}

export interface StochasticResult extends IndicatorResult {
  values: {
    k: number | null
    d: number | null
  }
}

// ============================================
// Core Building Blocks (TradingView Exact)
// ============================================

/**
 * SMA - Simple Moving Average
 * Pine: ta.sma(source, length)
 * Formula: sum(source, length) / length
 */
const sma = (values: number[], period: number): number[] => {
  const result: number[] = []
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += values[i - j]
      }
      result.push(sum / period)
    }
  }
  
  return result
}

/**
 * EMA - Exponential Moving Average
 * Pine: ta.ema(source, length)
 * Formula: alpha = 2 / (length + 1), EMA = alpha * source + (1 - alpha) * EMA[1]
 */
const ema = (values: number[], period: number): number[] => {
  const result: number[] = []
  const alpha = 2 / (period + 1)
  
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      result.push(values[i])
    } else if (i < period - 1) {
      // TradingView initializes EMA with first values then applies formula
      result.push(alpha * values[i] + (1 - alpha) * result[i - 1])
    } else if (i === period - 1) {
      // First "real" EMA uses SMA as seed
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += values[i - j]
      }
      result.push(sum / period)
    } else {
      result.push(alpha * values[i] + (1 - alpha) * result[i - 1])
    }
  }
  
  return result
}

/**
 * RMA - Wilder's Smoothing (Rolling Moving Average)
 * Pine: ta.rma(source, length)
 * Formula: alpha = 1 / length, RMA = alpha * source + (1 - alpha) * RMA[1]
 * 
 * This is what TradingView uses for RSI and ATR!
 */
const rma = (values: number[], period: number): number[] => {
  const result: number[] = []
  const alpha = 1 / period
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else if (i === period - 1) {
      // First RMA is SMA
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += values[i - j]
      }
      result.push(sum / period)
    } else {
      result.push(alpha * values[i] + (1 - alpha) * result[i - 1])
    }
  }
  
  return result
}

/**
 * Standard Deviation
 * Pine: ta.stdev(source, length)
 */
const stdev = (values: number[], period: number): number[] => {
  const smaValues = sma(values, period)
  const result: number[] = []
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || isNaN(smaValues[i])) {
      result.push(NaN)
    } else {
      let sumSquaredDiff = 0
      for (let j = 0; j < period; j++) {
        const diff = values[i - j] - smaValues[i]
        sumSquaredDiff += diff * diff
      }
      result.push(Math.sqrt(sumSquaredDiff / period))
    }
  }
  
  return result
}

/**
 * True Range
 * Pine: ta.tr(handle_na)
 * Formula: max(high - low, abs(high - close[1]), abs(low - close[1]))
 */
const trueRange = (high: number[], low: number[], close: number[]): number[] => {
  const result: number[] = []
  
  for (let i = 0; i < high.length; i++) {
    if (i === 0) {
      result.push(high[i] - low[i])
    } else {
      const hl = high[i] - low[i]
      const hc = Math.abs(high[i] - close[i - 1])
      const lc = Math.abs(low[i] - close[i - 1])
      result.push(Math.max(hl, hc, lc))
    }
  }
  
  return result
}

/**
 * Highest value over period
 * Pine: ta.highest(source, length)
 */
const highest = (values: number[], period: number): number[] => {
  const result: number[] = []
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else {
      let max = values[i]
      for (let j = 1; j < period; j++) {
        if (values[i - j] > max) max = values[i - j]
      }
      result.push(max)
    }
  }
  
  return result
}

/**
 * Lowest value over period
 * Pine: ta.lowest(source, length)
 */
const lowest = (values: number[], period: number): number[] => {
  const result: number[] = []
  
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else {
      let min = values[i]
      for (let j = 1; j < period; j++) {
        if (values[i - j] < min) min = values[i - j]
      }
      result.push(min)
    }
  }
  
  return result
}

// ============================================
// Indicators (TradingView Exact)
// ============================================

/**
 * RSI - Relative Strength Index
 * Pine: ta.rsi(source, length)
 * 
 * TradingView's RSI uses RMA (Wilder's smoothing), not regular EMA!
 * Formula:
 *   change = source - source[1]
 *   gain = change > 0 ? change : 0
 *   loss = change < 0 ? -change : 0
 *   avgGain = ta.rma(gain, length)
 *   avgLoss = ta.rma(loss, length)
 *   rs = avgGain / avgLoss
 *   rsi = 100 - (100 / (1 + rs))
 */
export const calculateRSI = (candles: Candle[], period: number = 14): IndicatorResult[] => {
  if (candles.length < period + 1) return []

  const closes = candles.map(c => c.close)
  
  // Calculate gains and losses
  const gains: number[] = [0]
  const losses: number[] = [0]
  
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? -change : 0)
  }
  
  // Apply RMA (Wilder's smoothing)
  const avgGain = rma(gains, period)
  const avgLoss = rma(losses, period)
  
  // Calculate RSI
  const results: IndicatorResult[] = []
  
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(avgGain[i]) || isNaN(avgLoss[i])) continue
    
    let rsiValue: number
    if (avgLoss[i] === 0) {
      rsiValue = 100
    } else if (avgGain[i] === 0) {
      rsiValue = 0
    } else {
      const rs = avgGain[i] / avgLoss[i]
      rsiValue = 100 - (100 / (1 + rs))
    }
    
    results.push({
      timestamp: candles[i].timestamp,
      value: rsiValue,
    })
  }
  
  return results
}

/**
 * MACD - Moving Average Convergence Divergence
 * Pine: ta.macd(source, fastlen, slowlen, siglen)
 * 
 * Formula:
 *   fastMA = ta.ema(source, fastlen)
 *   slowMA = ta.ema(source, slowlen)
 *   macd = fastMA - slowMA
 *   signal = ta.ema(macd, siglen)
 *   histogram = macd - signal
 */
export const calculateMACD = (
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult[] => {
  if (candles.length < slowPeriod + signalPeriod) return []

  const closes = candles.map(c => c.close)
  
  // Calculate EMAs
  const fastEMA = ema(closes, fastPeriod)
  const slowEMA = ema(closes, slowPeriod)
  
  // Calculate MACD line
  const macdLine: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macdLine.push(NaN)
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i])
    }
  }
  
  // Calculate signal line (EMA of MACD)
  // For signal, we need to filter out NaN values first
  const validMacdStart = macdLine.findIndex(v => !isNaN(v))
  const validMacd = macdLine.slice(validMacdStart)
  const signalLine = ema(validMacd, signalPeriod)
  
  // Build results
  const results: MACDResult[] = []
  
  for (let i = 0; i < signalLine.length; i++) {
    const originalIndex = validMacdStart + i
    if (isNaN(signalLine[i])) continue
    
    const macdValue = macdLine[originalIndex]
    const signalValue = signalLine[i]
    const histogramValue = macdValue - signalValue
    
    results.push({
      timestamp: candles[originalIndex].timestamp,
      value: histogramValue,
      values: {
        macd: macdValue,
        signal: signalValue,
        histogram: histogramValue,
      },
    })
  }
  
  return results
}

/**
 * SMA - Simple Moving Average
 * Pine: ta.sma(source, length)
 */
export const calculateSMA = (candles: Candle[], period: number = 20): IndicatorResult[] => {
  if (candles.length < period) return []

  const closes = candles.map(c => c.close)
  const smaValues = sma(closes, period)

  const results: IndicatorResult[] = []
  
  for (let i = 0; i < smaValues.length; i++) {
    if (isNaN(smaValues[i])) continue
    results.push({
      timestamp: candles[i].timestamp,
      value: smaValues[i],
    })
  }

  return results
}

/**
 * EMA - Exponential Moving Average
 * Pine: ta.ema(source, length)
 */
export const calculateEMA = (candles: Candle[], period: number = 20): IndicatorResult[] => {
  if (candles.length < period) return []

  const closes = candles.map(c => c.close)
  const emaValues = ema(closes, period)

  const results: IndicatorResult[] = []
  
  // Start from period-1 where first valid EMA is calculated
  for (let i = period - 1; i < emaValues.length; i++) {
    results.push({
      timestamp: candles[i].timestamp,
      value: emaValues[i],
    })
  }

  return results
}

/**
 * Bollinger Bands
 * Pine: ta.bb(source, length, mult)
 * 
 * Formula:
 *   basis = ta.sma(source, length)
 *   dev = mult * ta.stdev(source, length)
 *   upper = basis + dev
 *   lower = basis - dev
 */
export const calculateBollingerBands = (
  candles: Candle[],
  period: number = 20,
  mult: number = 2
): BollingerResult[] => {
  if (candles.length < period) return []

  const closes = candles.map(c => c.close)
  const basis = sma(closes, period)
  const dev = stdev(closes, period)

  const results: BollingerResult[] = []

  for (let i = 0; i < closes.length; i++) {
    if (isNaN(basis[i]) || isNaN(dev[i])) continue
    
    const upper = basis[i] + mult * dev[i]
    const lower = basis[i] - mult * dev[i]
    
    results.push({
      timestamp: candles[i].timestamp,
      value: basis[i],
      values: {
        upper,
        middle: basis[i],
        lower,
      },
    })
  }

  return results
}

/**
 * Stochastic Oscillator
 * Pine: ta.stoch(close, high, low, length)
 * 
 * TradingView's built-in Stochastic indicator:
 *   %K = ta.sma(ta.stoch(close, high, low, lengthK), smoothK)
 *   %D = ta.sma(%K, lengthD)
 * 
 * Where ta.stoch = 100 * (close - lowest(low, length)) / (highest(high, length) - lowest(low, length))
 */
export const calculateStochastic = (
  candles: Candle[],
  lengthK: number = 14,
  smoothK: number = 1,
  lengthD: number = 3
): StochasticResult[] => {
  if (candles.length < lengthK + lengthD) return []

  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const closes = candles.map(c => c.close)
  
  const highestHigh = highest(highs, lengthK)
  const lowestLow = lowest(lows, lengthK)
  
  // Raw stochastic
  const rawK: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(highestHigh[i]) || isNaN(lowestLow[i])) {
      rawK.push(NaN)
    } else {
      const range = highestHigh[i] - lowestLow[i]
      if (range === 0) {
        rawK.push(50) // Avoid division by zero
      } else {
        rawK.push(100 * (closes[i] - lowestLow[i]) / range)
      }
    }
  }
  
  // Smooth %K
  const kLine = smoothK > 1 ? sma(rawK, smoothK) : rawK
  
  // %D is SMA of %K
  const dLine = sma(kLine, lengthD)
  
  const results: StochasticResult[] = []
  
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(kLine[i]) || isNaN(dLine[i])) continue
    
    results.push({
      timestamp: candles[i].timestamp,
      value: kLine[i],
      values: {
        k: kLine[i],
        d: dLine[i],
      },
    })
  }

  return results
}

/**
 * ATR - Average True Range
 * Pine: ta.atr(length)
 * 
 * TradingView uses RMA (Wilder's smoothing) for ATR!
 * Formula: ta.rma(ta.tr(true), length)
 */
export const calculateATR = (candles: Candle[], period: number = 14): IndicatorResult[] => {
  if (candles.length < period + 1) return []

  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const closes = candles.map(c => c.close)
  
  const tr = trueRange(highs, lows, closes)
  const atrValues = rma(tr, period)

  const results: IndicatorResult[] = []

  for (let i = 0; i < atrValues.length; i++) {
    if (isNaN(atrValues[i])) continue
    results.push({
      timestamp: candles[i].timestamp,
      value: atrValues[i],
    })
  }

  return results
}

/**
 * VWAP - Volume Weighted Average Price
 * Pine: ta.vwap(hlc3)
 * 
 * TradingView's VWAP resets at session start. We provide both options:
 * - resetDaily: true (default) - Resets at start of each day (TradingView behavior)
 * - resetDaily: false - Cumulative VWAP
 * 
 * Formula: cumulative(typicalPrice * volume) / cumulative(volume)
 * where typicalPrice = (high + low + close) / 3
 */
export const calculateVWAP = (candles: Candle[], resetDaily: boolean = true): IndicatorResult[] => {
  if (candles.length === 0) return []

  const results: IndicatorResult[] = []
  let cumulativeTPV = 0
  let cumulativeVolume = 0
  let lastDay = -1

  for (const candle of candles) {
    // Check for day change (reset VWAP)
    const candleDate = new Date(candle.timestamp)
    const currentDay = candleDate.getUTCDate()
    
    if (resetDaily && lastDay !== -1 && currentDay !== lastDay) {
      // New day - reset cumulative values
      cumulativeTPV = 0
      cumulativeVolume = 0
    }
    lastDay = currentDay
    
    const typicalPrice = (candle.high + candle.low + candle.close) / 3
    const volume = candle.volume || 1
    
    cumulativeTPV += typicalPrice * volume
    cumulativeVolume += volume

    results.push({
      timestamp: candle.timestamp,
      value: cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice,
    })
  }

  return results
}

// ============================================
// Custom Indicators
// ============================================

/**
 * Rolling Up % (Custom Indicator)
 * 
 * Exact port from Pine Script:
 *   is_up = close >= open
 *   up_count = math.sum(is_up ? 1 : 0, len)
 *   up_pct = up_count / len * 100
 * 
 * @param candles - Array of OHLCV candles
 * @param lookbackLength - Number of candles to look back (default: 50)
 * @returns Array of indicator results with up percentage (0-100)
 */
export const calculateRollingUpPercent = (
  candles: Candle[],
  lookbackLength: number = 50
): IndicatorResult[] => {
  if (candles.length < lookbackLength) return []

  const results: IndicatorResult[] = []

  for (let i = lookbackLength - 1; i < candles.length; i++) {
    // Count green candles (close >= open) in lookback window
    let upCount = 0
    for (let j = i - lookbackLength + 1; j <= i; j++) {
      if (candles[j].close >= candles[j].open) {
        upCount++
      }
    }

    // Calculate percentage (matches Pine: up_count / len * 100)
    const upPercent = (upCount / lookbackLength) * 100

    results.push({
      timestamp: candles[i].timestamp,
      value: upPercent,
    })
  }

  return results
}

// ============================================
// Unified Calculator
// ============================================

export type IndicatorType = 
  | 'RSI'
  | 'MACD'
  | 'SMA'
  | 'EMA'
  | 'Bollinger Bands'
  | 'Stochastic'
  | 'ATR'
  | 'VWAP'
  | 'Rolling Up %'

export interface IndicatorConfig {
  type: IndicatorType
  parameters: Record<string, number>
}

/**
 * Calculate any indicator by type
 */
export const calculateIndicator = (
  candles: Candle[],
  config: IndicatorConfig
): IndicatorResult[] => {
  const { type, parameters } = config

  switch (type) {
    case 'RSI':
      return calculateRSI(candles, parameters.length || 14)

    case 'MACD':
      return calculateMACD(
        candles,
        parameters.fast || 12,
        parameters.slow || 26,
        parameters.signal || 9
      )

    case 'SMA':
      return calculateSMA(candles, parameters.length || 20)

    case 'EMA':
      return calculateEMA(candles, parameters.length || 20)

    case 'Bollinger Bands':
      return calculateBollingerBands(
        candles,
        parameters.length || 20,
        parameters.stdDev || 2
      )

    case 'Stochastic':
      return calculateStochastic(
        candles,
        parameters.k || 14,
        parameters.smoothK || 1,
        parameters.d || 3
      )

    case 'ATR':
      return calculateATR(candles, parameters.length || 14)

    case 'VWAP':
      return calculateVWAP(candles, parameters.resetDaily !== 0)

    case 'Rolling Up %':
      return calculateRollingUpPercent(candles, parameters.length || 50)

    default:
      console.warn(`[IndicatorCalculator] Unknown indicator type: ${type}`)
      return []
  }
}

/**
 * Get the latest indicator value
 */
export const getLatestIndicatorValue = (
  candles: Candle[],
  config: IndicatorConfig
): IndicatorResult | null => {
  const results = calculateIndicator(candles, config)
  return results.length > 0 ? results[results.length - 1] : null
}

/**
 * Check if indicator crossed above a threshold
 * Pine: ta.crossover(source, threshold)
 */
export const crossedAbove = (
  results: IndicatorResult[],
  threshold: number
): boolean => {
  if (results.length < 2) return false
  
  const prev = results[results.length - 2].value
  const curr = results[results.length - 1].value
  
  if (prev === null || curr === null) return false
  
  return prev < threshold && curr >= threshold
}

/**
 * Check if indicator crossed below a threshold
 * Pine: ta.crossunder(source, threshold)
 */
export const crossedBelow = (
  results: IndicatorResult[],
  threshold: number
): boolean => {
  if (results.length < 2) return false
  
  const prev = results[results.length - 2].value
  const curr = results[results.length - 1].value
  
  if (prev === null || curr === null) return false
  
  return prev > threshold && curr <= threshold
}

/**
 * Check if one indicator crossed above another
 * Pine: ta.crossover(sourceA, sourceB)
 */
export const crossedAboveIndicator = (
  resultsA: IndicatorResult[],
  resultsB: IndicatorResult[]
): boolean => {
  if (resultsA.length < 2 || resultsB.length < 2) return false
  
  const prevA = resultsA[resultsA.length - 2].value
  const currA = resultsA[resultsA.length - 1].value
  const prevB = resultsB[resultsB.length - 2].value
  const currB = resultsB[resultsB.length - 1].value
  
  if (prevA === null || currA === null || prevB === null || currB === null) return false
  
  return prevA < prevB && currA >= currB
}

/**
 * Check if one indicator crossed below another
 * Pine: ta.crossunder(sourceA, sourceB)
 */
export const crossedBelowIndicator = (
  resultsA: IndicatorResult[],
  resultsB: IndicatorResult[]
): boolean => {
  if (resultsA.length < 2 || resultsB.length < 2) return false
  
  const prevA = resultsA[resultsA.length - 2].value
  const currA = resultsA[resultsA.length - 1].value
  const prevB = resultsB[resultsB.length - 2].value
  const currB = resultsB[resultsB.length - 1].value
  
  if (prevA === null || currA === null || prevB === null || currB === null) return false
  
  return prevA > prevB && currA <= currB
}
