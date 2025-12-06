/**
 * Crypto Price Feeder
 * 
 * Subscribes to Polymarket RTDS crypto_prices topic to get real-time
 * BTC, ETH, SOL, XRP prices (sourced from Binance).
 * 
 * Builds OHLCV candles and stores them for indicator calculations.
 */

import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { 
  initializeCandleRecorder, 
  saveCandle, 
  loadCandles, 
  isConnected as isCandleDbConnected,
  getCandleStats
} from '../db/candleRecorder'

const POLYMARKET_RTDS_WS = process.env.POLYMARKET_RTDS_WS || 'wss://ws-live-data.polymarket.com'

// Supported symbols
const SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'xrpusdt'] as const
type Symbol = typeof SYMBOLS[number]

// Candle timeframes we track
const TIMEFRAMES = ['1m', '5m', '15m', '1h'] as const
type Timeframe = typeof TIMEFRAMES[number]

// OHLCV Candle structure
export interface Candle {
  symbol: Symbol
  timeframe: Timeframe
  timestamp: number      // Start of candle (ms)
  open: number
  high: number
  low: number
  close: number
  volume: number         // Not available from price feed, will be 0
  isClosed: boolean      // True when candle is finalized
}

// Price update from RTDS
interface CryptoPriceUpdate {
  topic: 'crypto_prices'
  type: 'update'
  timestamp: number
  payload: {
    symbol: string
    timestamp: number
    value: number
  }
}

export class CryptoPriceFeeder extends EventEmitter {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private isConnected = false

  // Current prices
  private prices: Map<Symbol, number> = new Map()

  // Candle builders - key: `${symbol}_${timeframe}`
  private candles: Map<string, Candle> = new Map()

  // Historical candles for indicator calculation - key: `${symbol}_${timeframe}`
  // Stores last 100 closed candles per symbol/timeframe
  private candleHistory: Map<string, Candle[]> = new Map()

  constructor() {
    super()
  }

  /**
   * Start the price feeder
   */
  async start(): Promise<void> {
    console.log('[CryptoPriceFeeder] Starting...')
    
    // Initialize database
    await initializeCandleRecorder()
    
    // Load historical candles from database
    await this.loadHistoricalCandles()
    
    // Connect to WebSocket
    this.connect()
  }

  /**
   * Load historical candles from database on startup
   */
  private async loadHistoricalCandles(): Promise<void> {
    if (!isCandleDbConnected()) {
      console.log('[CryptoPriceFeeder] Database not connected, skipping history load')
      return
    }

    console.log('[CryptoPriceFeeder] Loading historical candles from database...')
    
    let totalLoaded = 0
    
    for (const symbol of SYMBOLS) {
      for (const timeframe of TIMEFRAMES) {
        const key = `${symbol}_${timeframe}`
        const dbCandles = await loadCandles(symbol, timeframe, 100)
        
        if (dbCandles.length > 0) {
          // Map DB candles to local Candle type
          const candles: Candle[] = dbCandles.map(c => ({
            symbol: c.symbol as Symbol,
            timeframe: c.timeframe as Timeframe,
            timestamp: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            isClosed: c.isClosed,
          }))
          this.candleHistory.set(key, candles)
          totalLoaded += candles.length
        }
      }
    }

    if (totalLoaded > 0) {
      console.log(`[CryptoPriceFeeder] Loaded ${totalLoaded} historical candles from database`)
    }
    
    // Log database stats
    const stats = await getCandleStats()
    if (stats.totalCandles > 0) {
      console.log(`[CryptoPriceFeeder] Database has ${stats.totalCandles} candles for: ${stats.symbols.join(', ')}`)
    }
  }

  /**
   * Connect to RTDS WebSocket
   */
  private connect(): void {
    try {
      this.ws = new WebSocket(POLYMARKET_RTDS_WS)

      this.ws.on('open', () => {
        console.log('[CryptoPriceFeeder] Connected to RTDS')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
        this.subscribe()
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          // Ignore parse errors
        }
      })

      this.ws.on('error', (error: Error) => {
        console.error('[CryptoPriceFeeder] WebSocket error:', error.message)
        this.isConnected = false
      })

      this.ws.on('close', () => {
        console.log('[CryptoPriceFeeder] Disconnected, reconnecting...')
        this.isConnected = false
        this.scheduleReconnect()
      })
    } catch (error) {
      console.error('[CryptoPriceFeeder] Failed to connect:', error)
      this.scheduleReconnect()
    }
  }

  /**
   * Subscribe to crypto_prices topic
   */
  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    // Subscribe without filters first to get all crypto prices
    // According to docs, filters is optional
    const subscription = {
      action: 'subscribe',
      subscriptions: [
        {
          topic: 'crypto_prices',
          type: 'update'
        }
      ]
    }

    this.ws.send(JSON.stringify(subscription))
    console.log(`[CryptoPriceFeeder] Subscribed to crypto_prices (all symbols)`)
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: any): void {
    // Check if it's a crypto price update
    if (message.topic !== 'crypto_prices' || message.type !== 'update') {
      return
    }

    const update = message as CryptoPriceUpdate
    const symbol = update.payload.symbol.toLowerCase() as Symbol
    const price = update.payload.value
    const timestamp = update.payload.timestamp

    // Validate symbol
    if (!SYMBOLS.includes(symbol)) {
      return
    }

    // Update current price
    this.prices.set(symbol, price)

    // Update candles for all timeframes
    for (const timeframe of TIMEFRAMES) {
      this.updateCandle(symbol, timeframe, price, timestamp)
    }

    // Emit price update event
    this.emit('price', { symbol, price, timestamp })
  }

  /**
   * Update candle for a symbol/timeframe
   */
  private updateCandle(symbol: Symbol, timeframe: Timeframe, price: number, timestamp: number): void {
    const key = `${symbol}_${timeframe}`
    const candleStart = this.getCandleStart(timestamp, timeframe)

    let candle = this.candles.get(key)

    // Check if we need a new candle
    if (!candle || candle.timestamp !== candleStart) {
      // Close the old candle if it exists
      if (candle && !candle.isClosed) {
        candle.isClosed = true
        this.saveCandleToHistory(candle) // Save to memory + DB
        this.emit('candleClosed', candle)
      }

      // Create new candle
      candle = {
        symbol,
        timeframe,
        timestamp: candleStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        isClosed: false,
      }
      this.candles.set(key, candle)
      this.emit('candleOpened', candle)
    } else {
      // Update existing candle
      candle.high = Math.max(candle.high, price)
      candle.low = Math.min(candle.low, price)
      candle.close = price
    }
  }

  /**
   * Get the start timestamp of a candle
   */
  private getCandleStart(timestamp: number, timeframe: Timeframe): number {
    const minutes = this.getTimeframeMinutes(timeframe)
    const ms = minutes * 60 * 1000
    return Math.floor(timestamp / ms) * ms
  }

  /**
   * Get timeframe in minutes
   */
  private getTimeframeMinutes(timeframe: Timeframe): number {
    switch (timeframe) {
      case '1m': return 1
      case '5m': return 5
      case '15m': return 15
      case '1h': return 60
      default: return 1
    }
  }

  /**
   * Save closed candle to history (memory + database)
   */
  private async saveCandleToHistory(candle: Candle): Promise<void> {
    const key = `${candle.symbol}_${candle.timeframe}`
    let history = this.candleHistory.get(key)
    
    if (!history) {
      history = []
      this.candleHistory.set(key, history)
    }

    history.push(candle)

    // Keep only last 100 candles in memory
    if (history.length > 100) {
      history.shift()
    }

    // Save to database
    if (isCandleDbConnected()) {
      const saved = await saveCandle(candle)
      if (saved) {
        console.log(`[CryptoPriceFeeder] 💾 ${candle.symbol} ${candle.timeframe}: O=${candle.open.toFixed(2)} H=${candle.high.toFixed(2)} L=${candle.low.toFixed(2)} C=${candle.close.toFixed(2)}`)
      }
    } else {
      console.log(`[CryptoPriceFeeder] ${candle.symbol} ${candle.timeframe}: O=${candle.open.toFixed(2)} H=${candle.high.toFixed(2)} L=${candle.low.toFixed(2)} C=${candle.close.toFixed(2)} (memory only)`)
    }
  }

  /**
   * Get current price for a symbol
   */
  getPrice(symbol: Symbol): number | undefined {
    return this.prices.get(symbol)
  }

  /**
   * Get all current prices
   */
  getAllPrices(): Record<Symbol, number> {
    const result: Partial<Record<Symbol, number>> = {}
    for (const [symbol, price] of this.prices) {
      result[symbol] = price
    }
    return result as Record<Symbol, number>
  }

  /**
   * Get current (building) candle
   */
  getCurrentCandle(symbol: Symbol, timeframe: Timeframe): Candle | undefined {
    return this.candles.get(`${symbol}_${timeframe}`)
  }

  /**
   * Get closed candle history for indicator calculation
   */
  getCandleHistory(symbol: Symbol, timeframe: Timeframe, count: number = 50): Candle[] {
    const key = `${symbol}_${timeframe}`
    const history = this.candleHistory.get(key) || []
    return history.slice(-count)
  }

  /**
   * Get closing prices for indicator calculation
   */
  getClosingPrices(symbol: Symbol, timeframe: Timeframe, count: number = 50): number[] {
    const candles = this.getCandleHistory(symbol, timeframe, count)
    return candles.map(c => c.close)
  }

  /**
   * Schedule reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[CryptoPriceFeeder] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000)

    console.log(`[CryptoPriceFeeder] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    setTimeout(() => this.connect(), delay)
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; symbols: string[]; candleCount: number } {
    let candleCount = 0
    for (const history of this.candleHistory.values()) {
      candleCount += history.length
    }

    return {
      connected: this.isConnected,
      symbols: Array.from(this.prices.keys()),
      candleCount,
    }
  }

  /**
   * Stop the price feeder
   */
  stop(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    console.log('[CryptoPriceFeeder] Stopped')
  }
}

// Singleton instance
let instance: CryptoPriceFeeder | null = null

export const getCryptoPriceFeeder = (): CryptoPriceFeeder => {
  if (!instance) {
    instance = new CryptoPriceFeeder()
  }
  return instance
}
