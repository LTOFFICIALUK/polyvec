/**
 * WebSocket service entry point
 * Main server that coordinates Polymarket connector, state store, and WebSocket server
 */

// Load environment variables from .env file
import 'dotenv/config'

import http from 'http'
import { WebSocketServer } from './ws/server'
import { MarketsStateStore } from './state/marketsState'
import { fetchMarketsList, fetchOrderbook, fetchMultipleOrderbooks, fetchMarketBySlug, MarketMetadata } from './polymarket/clobClient'
import { initializePriceRecorder, recordMarketPrices, closePriceRecorder, queryPriceHistory } from './db/priceRecorder'
import { 
  initializeIndicatorCache, 
  preCalculateIndicators, 
  cleanupOldIndicators,
  getCachedIndicators 
} from './db/indicatorCache'
import {
  initializeStrategyRecorder,
  closeStrategyRecorder,
  createStrategy,
  getStrategy,
  getUserStrategies,
  getAllStrategies,
  updateStrategy,
  deleteStrategy,
  toggleStrategyActive,
  recordTrade,
  getStrategyTrades,
  getStrategyAnalytics,
  updateStrategyAnalytics,
  Strategy,
} from './db/strategyRecorder'
import { getCryptoPriceFeeder } from './polymarket/cryptoPriceFeeder'
import { closeCandleRecorder, getCandleStats } from './db/candleRecorder'
import { 
  calculateIndicator, 
  getLatestIndicatorValue,
  IndicatorType,
  Candle as IndicatorCandle
} from './indicators/indicatorCalculator'
import { getStrategyMonitor, StrategyTrigger } from './strategies/strategyMonitor'
import { 
  initializeTradingKeyRecorder, 
  closeTradingKeyRecorder,
  storePrivateKey,
  hasStoredKey,
  getKeyMetadata,
} from './db/tradingKeyRecorder'
import {
  initializeCustodialWallet,
  getCustodialWalletPrivateKey,
} from './db/custodialWallet'
import {
  deactivateKey,
  deleteKey,
  getKeyAuditLog,
} from './db/tradingKeyRecorder'
import { isKeyVaultConfigured } from './security/keyVault'
import { verifySignature, extractSignatureFromRequest } from './security/authVerifier'
import { executeTrade, canExecuteTrades, testKeySignature } from './trading/tradeExecutor'
import { initializeBacktester, runBacktest, isStrategyProfitable, closeBacktester } from './backtesting/backtester'
import { makeAuthenticatedRequest } from './polymarket/hmacAuth'
import type { PolymarketApiCredentials } from './polymarket/hmacAuth'
import { ethers } from 'ethers'

const POLYMARKET_GAMMA_API = process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com'

// Railway provides PORT environment variable - use it for both HTTP and WebSocket
// For local development, fallback to HTTP_PORT if set, otherwise 8081
const HTTP_PORT = process.env.PORT 
  ? parseInt(process.env.PORT) 
  : (process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT) : 8081)
const PORT = HTTP_PORT // WebSocket uses same port as HTTP server

const PAIR_SLUG_MAP: Record<string, string> = {
  BTC: 'btc',
  SOL: 'sol',
  ETH: 'eth',
  XRP: 'xrp',
}

// Full pair names for hourly markets (they use "solana" not "sol" in slugs)
const PAIR_FULL_NAME_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  SOL: 'solana',
  ETH: 'ethereum',
  XRP: 'xrp',
}

const TIMEFRAME_CONFIG: Record<string, { minutes: number; slug: string }> = {
  '15m': { minutes: 15, slug: '15m' },
  '1h': { minutes: 60, slug: '1h' },
  'hourly': { minutes: 60, slug: 'hourly' }, // Support "hourly" as alternative to "1h"
}

const LAST_SLUG_FETCH: Record<string, number> = {}

const formatEtDateParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(date)
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  // Normalize offset into a valid ISO offset string like "-05:00" or "-04:00"
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-05:00'
  let offsetRaw = tzName.replace('GMT', '')
  // Handle values like "-5" or "-04:00"
  if (!offsetRaw.includes(':')) {
    const sign = offsetRaw.startsWith('-') ? '-' : '+'
    const num = Math.abs(parseInt(offsetRaw || '5', 10)) || 5
    offsetRaw = `${sign}${num.toString().padStart(2, '0')}:00`
  }
  const offset = offsetRaw
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    offset,
  }
}

const getEventWindowStart = (timeframeMinutes: number): number => {
  const now = new Date()
  const { year, month, day, hour, minute, offset } = formatEtDateParts(now)
  const minuteNum = parseInt(minute, 10)
  const flooredMinutes = Math.floor(minuteNum / timeframeMinutes) * timeframeMinutes
  const iso = `${year}-${month}-${day}T${hour}:${flooredMinutes.toString().padStart(2, '0')}:00${offset}`
  return new Date(iso).getTime()
}

const generateSlug = (pair: string, timeframe: string, eventStartSeconds: number) => {
  const pairSlug = PAIR_SLUG_MAP[pair.toUpperCase()]
  const timeframeSlug = TIMEFRAME_CONFIG[timeframe.toLowerCase()]?.slug
  if (!pairSlug || !timeframeSlug) return null
  
  // Hourly markets use a different format: "solana-up-or-down-november-27-2pm-et"
  if (timeframe.toLowerCase() === '1h' || timeframe.toLowerCase() === 'hourly') {
    const pairFullName = PAIR_FULL_NAME_MAP[pair.toUpperCase()]
    if (!pairFullName) return null
    
    try {
      // Convert timestamp to ET date/time
      const eventDate = new Date(eventStartSeconds * 1000)
      if (isNaN(eventDate.getTime())) return null // Invalid date
      
      const etDate = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        hour12: true,
      }).formatToParts(eventDate)
      
      const month = etDate.find(p => p.type === 'month')?.value.toLowerCase() || ''
      const day = etDate.find(p => p.type === 'day')?.value || ''
      const hour = etDate.find(p => p.type === 'hour')?.value || ''
      const dayPeriod = etDate.find(p => p.type === 'dayPeriod')?.value?.toLowerCase() || ''
      
      if (!month || !day || !hour || !dayPeriod) return null
      
      // Format: "november-27-2pm" (no minutes for hourly)
      const timeStr = `${hour}${dayPeriod}`
      return `${pairFullName}-up-or-down-${month}-${day}-${timeStr}-et`
    } catch (error) {
      return null
    }
  }
  
  // 15m markets use timestamp format
  return `${pairSlug}-updown-${timeframeSlug}-${eventStartSeconds}`
}

// Create HTTP server
const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const path = url.pathname

  // Health endpoint
  if (path === '/health') {
    const health = wsServer.getHealthStatus()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(health))
    return
  }

  // Crypto prices endpoint - get current BTC/ETH/SOL/XRP prices
  if (path === '/api/crypto/prices' && req.method === 'GET') {
    const feeder = getCryptoPriceFeeder()
    const prices = feeder.getAllPrices()
    const status = feeder.getStatus()
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      connected: status.connected,
      prices,
      candleCount: status.candleCount,
    }))
    return
  }

  // Crypto candles endpoint - get candle history for indicators
  if (path === '/api/crypto/candles' && req.method === 'GET') {
    const symbol = url.searchParams.get('symbol')?.toLowerCase() || 'btcusdt'
    const timeframe = url.searchParams.get('timeframe') || '15m'
    const count = parseInt(url.searchParams.get('count') || '50')

    const feeder = getCryptoPriceFeeder()
    const candles = feeder.getCandleHistory(symbol as any, timeframe as any, count)
    const current = feeder.getCurrentCandle(symbol as any, timeframe as any)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      symbol,
      timeframe,
      candles,
      current,
      count: candles.length,
    }))
    return
  }

  // Crypto candle stats endpoint - get database storage stats
  if (path === '/api/crypto/stats' && req.method === 'GET') {
    try {
      const stats = await getCandleStats()
      const feeder = getCryptoPriceFeeder()
      const status = feeder.getStatus()

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        connected: status.connected,
        memoryCandles: status.candleCount,
        database: {
          totalCandles: stats.totalCandles,
          symbols: stats.symbols,
          oldestCandle: stats.oldestCandle,
          newestCandle: stats.newestCandle,
        },
      }))
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message }))
    }
    return
  }

  // Strategy monitor status endpoint
  if (path === '/api/strategies/monitor' && req.method === 'GET') {
    const monitor = getStrategyMonitor()
    const status = monitor.getStatus()
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      monitor: {
        isRunning: status.isRunning,
        lastCheckTime: status.lastCheckTime,
        lastCheckTimeFormatted: status.lastCheckTime ? new Date(status.lastCheckTime).toISOString() : null,
        cacheSize: status.cacheSize,
      },
    }))
    return
  }

  // Manually trigger strategy check (for testing)
  if (path === '/api/strategies/monitor/check' && req.method === 'POST') {
    const monitor = getStrategyMonitor()
    await monitor.triggerCheck()
    
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      message: 'Strategy check triggered',
    }))
    return
  }

  // ============================================
  // Backtesting Endpoints
  // ============================================

  // Run a backtest on a strategy
  if (path === '/api/backtest' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    await new Promise<void>(resolve => req.on('end', resolve))

    try {
      const { 
        strategyId, 
        strategy, 
        marketId, 
        startTime, 
        endTime, 
        initialBalance,
        numberOfMarkets,
        exitPrice 
      } = JSON.parse(body)

      // Either provide strategyId to fetch from DB, or provide full strategy object
      let strategyToTest: Strategy | null = null
      
      if (strategyId) {
        strategyToTest = await getStrategy(strategyId)
        if (!strategyToTest) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Strategy not found' }))
          return
        }
      } else if (strategy) {
        strategyToTest = strategy as Strategy
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Missing strategyId or strategy object' }))
        return
      }

      // Parse dates (only used if not using numberOfMarkets mode)
      const start = startTime ? new Date(startTime) : undefined
      const end = endTime ? new Date(endTime) : undefined

      console.log(`[Backtest API] Running backtest for "${strategyToTest.name}"`)
      console.log(`[Backtest API] Mode: ${numberOfMarkets ? `Multi-market (${numberOfMarkets})` : 'Single market'}`)
      console.log(`[Backtest API] Exit Price: ${exitPrice ? `¢${exitPrice}` : 'None'}`)

      const result = await runBacktest({
        strategy: strategyToTest,
        startTime: start,
        endTime: end,
        initialBalance: initialBalance || 1000,
        marketId: marketId || strategyToTest.market,
        numberOfMarkets: numberOfMarkets,
        exitPrice: exitPrice,
      })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        result: result,
      }))
    } catch (error: any) {
      console.error('[Backtest API] Error:', error.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Backtest failed' }))
    }
    return
  }

  // Get chart data for backtest visualization
  if (path === '/api/backtest/chart-data' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    await new Promise<void>(resolve => req.on('end', resolve))

    try {
      const { asset, timeframe, direction, indicatorType, indicatorParameters, marketIds } = JSON.parse(body)

      if (!asset || !timeframe) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Missing asset or timeframe' }))
        return
      }

      // Use crypto price feeder for asset data (same as live trading)
      const feeder = getCryptoPriceFeeder()
      const symbolMap: Record<string, string> = {
        BTC: 'btcusdt',
        ETH: 'ethusdt',
        SOL: 'solusdt',
        XRP: 'xrpusdt',
      }
      const symbol = symbolMap[asset.toUpperCase()] || 'btcusdt'
      const tf = timeframe === '1h' || timeframe === 'hourly' ? '1h' : '15m'

      // Get candle history from VPS
      const rawCandles = feeder.getCandleHistory(symbol as any, tf as any, 500) // Get last 500 candles

      if (rawCandles.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          candles: [],
          indicatorData: [],
          message: 'No candle data available',
        }))
        return
      }

      // Convert to chart format
      const candles = rawCandles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))

      // Calculate indicator if specified
      let indicatorData: any[] = []
      if (indicatorType && indicatorParameters) {
        try {
          const { calculateIndicator } = await import('./indicators/indicatorCalculator')
          const indicatorCandles = rawCandles.map(c => ({
            timestamp: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }))
          
          const results = calculateIndicator(indicatorCandles, {
            type: indicatorType as any,
            parameters: indicatorParameters,
          })
          indicatorData = results.map(r => ({
            timestamp: r.timestamp,
            value: r.value,
            values: r.values,
          }))
        } catch (err: any) {
          console.warn(`[Chart Data] Failed to calculate indicator ${indicatorType}:`, err.message)
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        candles: candles.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        indicatorData,
      }))
    } catch (error: any) {
      console.error('[Chart Data API] Error:', error.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Failed to fetch chart data' }))
    }
    return
  }

  // Quick profitability check for a strategy
  if (path === '/api/backtest/quick' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    await new Promise<void>(resolve => req.on('end', resolve))

    try {
      const { strategyId, marketId, lookbackDays } = JSON.parse(body)

      if (!strategyId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Missing strategyId' }))
        return
      }

      const strategy = await getStrategy(strategyId)
      if (!strategy) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Strategy not found' }))
        return
      }

      const market = marketId || strategy.market
      if (!market) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'No market specified' }))
        return
      }

      const result = await isStrategyProfitable(strategy, market, lookbackDays || 7)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        data: result,
      }))
    } catch (error: any) {
      console.error('[Backtest Quick API] Error:', error.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Quick check failed' }))
    }
    return
  }

  // ============================================
  // Trading Key Management Endpoints
  // ============================================

  // Check if key vault is configured
  if (path === '/api/trading/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      vaultConfigured: isKeyVaultConfigured(),
    }))
    return
  }

  // Check if user has a trading key
  if (path === '/api/trading/key/check' && req.method === 'GET') {
    const userAddress = url.searchParams.get('address')
    if (!userAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Missing address parameter' }))
      return
    }

    const hasKey = await hasStoredKey(userAddress)
    const metadata = hasKey ? await getKeyMetadata(userAddress) : null

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      hasKey,
      metadata: metadata ? {
        isActive: metadata.isActive,
        createdAt: metadata.createdAt,
        lastUsedAt: metadata.lastUsedAt,
      } : null,
    }))
    return
  }

  // Store a trading key
  if (path === '/api/trading/key' && req.method === 'POST') {
    if (!isKeyVaultConfigured()) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Trading key vault not configured. Contact administrator.' 
      }))
      return
    }

    let body = ''
    req.on('data', chunk => { body += chunk })
    await new Promise<void>(resolve => req.on('end', resolve))

    try {
      const { userAddress, privateKey, signature, timestamp, nonce } = JSON.parse(body)

      if (!userAddress || !privateKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Missing userAddress or privateKey' }))
        return
      }

      // SECURITY: Require signature verification to prove ownership of the wallet
      // This prevents unauthorized users from storing keys for addresses they don't control
      // Note: For backward compatibility, we allow requests without signature but log a warning
      if (signature && timestamp) {
        const signaturePayload = {
          address: userAddress,
          signature,
          timestamp,
          nonce: nonce || '0',
        }

        if (!verifySignature(signaturePayload, userAddress)) {
          console.warn(`[API] Invalid signature for key storage request from ${userAddress.slice(0, 10)}...`)
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Invalid signature. Please sign the authentication message to prove wallet ownership.' 
          }))
          return
        }
      } else {
        // Log warning but allow (for backward compatibility during migration)
        console.warn(`[API] Key storage request without signature verification from ${userAddress.slice(0, 10)}...`)
      }

      // Get IP and user agent for audit
      const ipAddress = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress
      const userAgent = req.headers['user-agent']

      const result = await storePrivateKey(userAddress, privateKey, ipAddress, userAgent)

      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, message: 'Trading key stored securely' }))
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: result.error }))
      }
    } catch (error: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Invalid request body' }))
    }
    return
  }

  // Delete a trading key
  if (path === '/api/trading/key' && req.method === 'DELETE') {
    const userAddress = url.searchParams.get('address')
    const signature = url.searchParams.get('signature')
    const timestamp = url.searchParams.get('timestamp')
    const nonce = url.searchParams.get('nonce')

    if (!userAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Missing address parameter' }))
      return
    }

    // SECURITY: Require signature verification for key deletion
    if (signature && timestamp) {
      const signaturePayload = {
        address: userAddress,
        signature,
        timestamp,
        nonce: nonce || '0',
      }

      if (!verifySignature(signaturePayload, userAddress)) {
        console.warn(`[API] Invalid signature for key deletion request from ${userAddress.slice(0, 10)}...`)
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Invalid signature. Please sign the authentication message to prove wallet ownership.' 
        }))
        return
      }
    } else {
      // Log warning but allow (for backward compatibility)
      console.warn(`[API] Key deletion request without signature verification from ${userAddress.slice(0, 10)}...`)
    }

    const ipAddress = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress
    const userAgent = req.headers['user-agent']

    const deleted = await deleteKey(userAddress, ipAddress, userAgent)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      success: deleted, 
      message: deleted ? 'Trading key deleted' : 'No key found' 
    }))
    return
  }

  // Test that a stored key can sign
  if (path === '/api/trading/key/test' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    await new Promise<void>(resolve => req.on('end', resolve))

    try {
      const { userAddress } = JSON.parse(body)

      if (!userAddress) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Missing userAddress' }))
        return
      }

      const canSign = await testKeySignature(userAddress)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        success: true, 
        canSign,
        message: canSign ? 'Key verified successfully' : 'Key verification failed'
      }))
    } catch (error: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Invalid request body' }))
    }
    return
  }

  // Get key audit log
  if (path === '/api/trading/key/audit' && req.method === 'GET') {
    const userAddress = url.searchParams.get('address')
    if (!userAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Missing address parameter' }))
      return
    }

    const auditLog = await getKeyAuditLog(userAddress)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, auditLog }))
    return
  }

  // Check if user can execute trades
  if (path === '/api/trading/can-trade' && req.method === 'GET') {
    const userAddress = url.searchParams.get('address')
    if (!userAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Missing address parameter' }))
      return
    }

    const result = await canExecuteTrades(userAddress)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, ...result }))
    return
  }

  // Calculate indicator endpoint
  if (path === '/api/crypto/indicator' && req.method === 'GET') {
    const symbol = url.searchParams.get('symbol')?.toLowerCase() || 'btcusdt'
    const timeframe = url.searchParams.get('timeframe') || '15m'
    const type = url.searchParams.get('type') || 'RSI'
    
    // Parse parameters from query string
    const parameters: Record<string, number> = {}
    for (const [key, value] of url.searchParams.entries()) {
      if (!['symbol', 'timeframe', 'type'].includes(key)) {
        const num = parseFloat(value)
        if (!isNaN(num)) {
          parameters[key] = num
        }
      }
    }

    try {
      const feeder = getCryptoPriceFeeder()
      const rawCandles = feeder.getCandleHistory(symbol as any, timeframe as any, 100)
      
      // Convert to indicator candle format
      const candles: IndicatorCandle[] = rawCandles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))

      if (candles.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          symbol,
          timeframe,
          type,
          parameters,
          values: [],
          latest: null,
          message: 'Not enough candle data yet. Wait for candles to accumulate.',
        }))
        return
      }

      const results = calculateIndicator(candles, {
        type: type as IndicatorType,
        parameters,
      })

      const latest = results.length > 0 ? results[results.length - 1] : null

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        symbol,
        timeframe,
        type,
        parameters,
        candleCount: candles.length,
        values: results.slice(-20),  // Return last 20 values
        latest,
      }))
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message }))
    }
    return
  }

  // Admin endpoint - get cached indicators from database
  if (path === '/api/admin/indicators' && req.method === 'GET') {
    const asset = url.searchParams.get('asset') || 'BTC'
    const timeframe = url.searchParams.get('timeframe') || '15m'
    const indicatorType = url.searchParams.get('indicatorType')
    const startTime = url.searchParams.get('startTime')
    const endTime = url.searchParams.get('endTime')
    
      try {
        // Ensure indicator cache is initialized
        const { isIndicatorCacheInitialized, initializeIndicatorCache } = await import('./db/indicatorCache')
        if (!isIndicatorCacheInitialized()) {
          try {
            const { initializePriceRecorder } = await import('./db/priceRecorder')
            const pool = await initializePriceRecorder()
            if (pool) {
              await initializeIndicatorCache(pool)
              console.log('[Admin/Indicators] Indicator cache initialized')
            }
          } catch (initError: any) {
            console.error('[Admin/Indicators] Initialization error:', initError.message)
            // Continue anyway - might return empty results
          }
        }
        
        try {
          const { getCachedIndicators } = await import('./db/indicatorCache')
        
        // Get all cached indicators for this asset/timeframe
        const allIndicators: any[] = []
        const indicatorTypes = indicatorType 
          ? [indicatorType]
          : ['RSI', 'MACD', 'SMA', 'EMA', 'Bollinger Bands', 'Stochastic', 'ATR', 'VWAP', 'Rolling Up %']
        
        for (const type of indicatorTypes) {
          // Get all parameter variations for this indicator type
          const paramVariations: Record<string, any>[] = []
          
          if (type === 'RSI') {
            paramVariations.push({ length: 14 }, { length: 9 }, { length: 21 })
          } else if (type === 'MACD') {
            paramVariations.push({ fast: 12, slow: 26, signal: 9 }, { fast: 8, slow: 21, signal: 5 })
          } else if (type === 'SMA') {
            paramVariations.push({ length: 20 }, { length: 50 })
          } else if (type === 'EMA') {
            paramVariations.push({ length: 9 }, { length: 20 }, { length: 21 }, { length: 50 })
          } else if (type === 'Bollinger Bands') {
            paramVariations.push({ length: 20, stdDev: 2 })
          } else if (type === 'Stochastic') {
            paramVariations.push({ k: 14, smoothK: 1, d: 3 })
          } else if (type === 'ATR') {
            paramVariations.push({ length: 14 })
          } else if (type === 'VWAP') {
            paramVariations.push({ resetDaily: 1 })
          } else if (type === 'Rolling Up %') {
            paramVariations.push({ length: 50 })
          }
          
          for (const params of paramVariations) {
            try {
              const start = startTime ? parseInt(startTime) : undefined
              const end = endTime ? parseInt(endTime) : undefined
              const data = await getCachedIndicators(asset, timeframe, type, params, start, end)
              
              if (data.length > 0) {
                allIndicators.push({
                  indicator_type: type,
                  indicator_params: params,
                  data: data.slice(-100), // Last 100 values
                  latest_timestamp: data[data.length - 1]?.timestamp || 0,
                  count: data.length,
                })
              }
            } catch (queryError: any) {
              // Skip this indicator if query fails
              console.warn(`[Admin/Indicators] Error querying ${type}:`, queryError.message)
            }
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          asset,
          timeframe,
          indicators: allIndicators,
        }))
      } catch (cacheError: any) {
        // If cache is not available, return empty results instead of error
        console.warn('[Admin/Indicators] Cache not available:', cacheError.message)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          asset,
          timeframe,
          indicators: [],
          message: 'Indicator cache not yet initialized. Pre-calculation job will populate data shortly.',
        }))
      }
    } catch (error: any) {
      console.error('[Admin/Indicators] Error:', error.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message }))
    }
    return
  }

  // Get all indicators for a symbol (current values)
  if (path === '/api/crypto/indicators' && req.method === 'GET') {
    const symbol = url.searchParams.get('symbol')?.toLowerCase() || 'btcusdt'
    const timeframe = url.searchParams.get('timeframe') || '15m'

    try {
      const feeder = getCryptoPriceFeeder()
      const rawCandles = feeder.getCandleHistory(symbol as any, timeframe as any, 100)
      
      const candles: IndicatorCandle[] = rawCandles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))

      if (candles.length < 26) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          symbol,
          timeframe,
          candleCount: candles.length,
          indicators: {},
          message: `Need at least 26 candles for indicators. Currently have ${candles.length}.`,
        }))
        return
      }

      // Calculate all standard indicators
      const indicators: Record<string, any> = {}

      // RSI
      const rsi = getLatestIndicatorValue(candles, { type: 'RSI', parameters: { length: 14 } })
      if (rsi) indicators.rsi = { value: rsi.value, period: 14 }

      // MACD
      const macd = getLatestIndicatorValue(candles, { type: 'MACD', parameters: { fast: 12, slow: 26, signal: 9 } })
      if (macd) indicators.macd = { ...macd.values, parameters: { fast: 12, slow: 26, signal: 9 } }

      // EMAs
      const ema9 = getLatestIndicatorValue(candles, { type: 'EMA', parameters: { length: 9 } })
      const ema21 = getLatestIndicatorValue(candles, { type: 'EMA', parameters: { length: 21 } })
      if (ema9) indicators.ema9 = { value: ema9.value }
      if (ema21) indicators.ema21 = { value: ema21.value }

      // Bollinger Bands
      const bb = getLatestIndicatorValue(candles, { type: 'Bollinger Bands', parameters: { length: 20, stdDev: 2 } })
      if (bb) indicators.bollingerBands = { ...bb.values, parameters: { length: 20, stdDev: 2 } }

      // Stochastic
      const stoch = getLatestIndicatorValue(candles, { type: 'Stochastic', parameters: { k: 14, d: 3 } })
      if (stoch) indicators.stochastic = { ...stoch.values, parameters: { k: 14, d: 3 } }

      // ATR
      const atr = getLatestIndicatorValue(candles, { type: 'ATR', parameters: { length: 14 } })
      if (atr) indicators.atr = { value: atr.value, period: 14 }

      // Rolling Up % (custom)
      const upPct = getLatestIndicatorValue(candles, { type: 'Rolling Up %', parameters: { length: 50 } })
      if (upPct) indicators.rollingUpPercent = { value: upPct.value, period: 50 }

      // Current price
      const currentCandle = feeder.getCurrentCandle(symbol as any, timeframe as any)
      if (currentCandle) {
        indicators.price = {
          open: currentCandle.open,
          high: currentCandle.high,
          low: currentCandle.low,
          close: currentCandle.close,
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        symbol,
        timeframe,
        candleCount: candles.length,
        indicators,
      }))
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message }))
    }
    return
  }

  // Debug endpoint - returns all matching markets with full details
  if (path === '/markets/debug' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const { pair, timeframe } = JSON.parse(body)
        const stateStore = wsServer.getStateStore()
        const now = Date.now()
        
        // Get all markets
        const allMarkets = stateStore.getAllMarkets()
        
        // Parse event time helper (same as in /markets/current)
        const parseEventTime = (question: string): { eventStart: number | null; eventEnd: number | null } => {
          try {
            const datePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i
            const dateMatch = question.match(datePattern)
            
            const timePattern = /(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)\s+ET/i
            const match = question.match(timePattern)
            if (!match) return { eventStart: null, eventEnd: null }
            
            const nowInET = new Date()
            const etFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
            
            const etParts = etFormatter.formatToParts(nowInET)
            const todayYear = parseInt(etParts.find(p => p.type === 'year')?.value || '2025')
            const todayMonth = parseInt(etParts.find(p => p.type === 'month')?.value || '11')
            const todayDay = parseInt(etParts.find(p => p.type === 'day')?.value || '27')
            
            let etYear: number, etMonth: number, etDay: number
            if (dateMatch) {
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
              const monthName = dateMatch[1].toLowerCase()
              etMonth = monthNames.indexOf(monthName) + 1
              etDay = parseInt(dateMatch[2])
              etYear = todayYear
              
              if (etMonth < todayMonth || (etMonth === todayMonth && etDay < todayDay)) {
                etYear += 1
              }
            } else {
              etYear = todayYear
              etMonth = todayMonth
              etDay = todayDay
            }
            
            const parsedDateIsFuture = etYear > todayYear || 
                                      (etYear === todayYear && etMonth > todayMonth) ||
                                      (etYear === todayYear && etMonth === todayMonth && etDay > todayDay)
            
            const datesToTry: Array<{year: number, month: number, day: number}> = []
            if (parsedDateIsFuture) {
              datesToTry.push({ year: todayYear, month: todayMonth, day: todayDay })
              datesToTry.push({ year: etYear, month: etMonth, day: etDay })
            } else {
              datesToTry.push({ year: etYear, month: etMonth, day: etDay })
            }
            
            let startHour = parseInt(match[1])
            const startMin = parseInt(match[2])
            const startPeriod = match[3].toUpperCase()
            if (startPeriod === 'PM' && startHour !== 12) startHour += 12
            if (startPeriod === 'AM' && startHour === 12) startHour = 0
            
            let endHour = parseInt(match[4])
            const endMin = parseInt(match[5])
            const endPeriod = match[6].toUpperCase()
            if (endPeriod === 'PM' && endHour !== 12) endHour += 12
            if (endPeriod === 'AM' && endHour === 12) endHour = 0
            
            const createETTimestamp = (year: number, month: number, day: number, hour: number, minute: number): number => {
              const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`
              const offset = (month >= 11 || month <= 2) ? '-05:00' : '-04:00'
              const dateWithOffset = new Date(`${dateStr}${offset}`)
              const etTime = dateWithOffset.toLocaleString('en-US', { 
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })
              const expectedHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour)
              const expectedPeriod = hour >= 12 ? 'PM' : 'AM'
              const actualPeriod = etTime.includes('PM') ? 'PM' : 'AM'
              const actualHour = parseInt(etTime.split(':')[0])
              
              if (actualHour !== expectedHour || actualPeriod !== expectedPeriod) {
                const otherOffset = offset === '-05:00' ? '-04:00' : '-05:00'
                const dateWithOtherOffset = new Date(`${dateStr}${otherOffset}`)
                const etTimeOther = dateWithOtherOffset.toLocaleString('en-US', { 
                  timeZone: 'America/New_York',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })
                const otherPeriod = etTimeOther.includes('PM') ? 'PM' : 'AM'
                const otherHour = parseInt(etTimeOther.split(':')[0])
                
                if (otherHour === expectedHour && otherPeriod === expectedPeriod) {
                  return dateWithOtherOffset.getTime()
                }
              }
              
              return dateWithOffset.getTime()
            }
            
            const currentTime = Date.now()
            let bestMatch: { eventStart: number, eventEnd: number } | null = null
            
            for (const dateToTry of datesToTry) {
              const candidateStart = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, startHour, startMin)
              let candidateEnd = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, endHour, endMin)
              
              if (candidateEnd < candidateStart) {
                const nextDay = new Date(candidateEnd)
                nextDay.setDate(nextDay.getDate() + 1)
                candidateEnd = nextDay.getTime()
              }
              
              const isActive = currentTime >= candidateStart && currentTime < candidateEnd
              
              if (isActive) {
                return { eventStart: candidateStart, eventEnd: candidateEnd }
              }
              
              if (!bestMatch || (candidateStart < bestMatch.eventStart && candidateStart > currentTime)) {
                bestMatch = { eventStart: candidateStart, eventEnd: candidateEnd }
              }
            }
            
            if (bestMatch) {
              return bestMatch
            }
            
            const fallbackDate = datesToTry[0]
            const eventStart = createETTimestamp(fallbackDate.year, fallbackDate.month, fallbackDate.day, startHour, startMin)
            let eventEnd = createETTimestamp(fallbackDate.year, fallbackDate.month, fallbackDate.day, endHour, endMin)
            
            if (eventEnd < eventStart) {
              const nextDay = new Date(eventEnd)
              nextDay.setDate(nextDay.getDate() + 1)
              eventEnd = nextDay.getTime()
            }
            
            return { eventStart, eventEnd }
          } catch (error) {
            return { eventStart: null, eventEnd: null }
          }
        }
        
        // Filter to markets that match the pair and timeframe
        const matchingMarkets = allMarkets.filter((state) => {
          const metadata = state.metadata
          if (!metadata) return false
          
          const question = (metadata.question || '').toUpperCase()
          const pairUpper = (pair || '').toUpperCase()
          
          const pairMap: Record<string, string[]> = {
            'BTC': ['BITCOIN', 'BTC'],
            'SOL': ['SOLANA', 'SOL'],
            'ETH': ['ETHEREUM', 'ETH'],
            'XRP': ['XRP', 'RIPPLE'],
          }
          
          const pairVariants = pairMap[pairUpper] || [pairUpper]
          const hasPair = pairVariants.some(variant => question.includes(variant))
          
          const hasTimeframe = !timeframe || 
                              metadata.eventTimeframe === timeframe ||
                              metadata.eventTimeframe === timeframe.toUpperCase() ||
                              metadata.eventTimeframe === timeframe.toLowerCase()
          
          return hasPair && hasTimeframe
        })
        
        // Build detailed response for each matching market
        // Show ALL markets (including settled ones) for debugging
        const debugMarkets = matchingMarkets
          .map((state) => {
            const metadata = state.metadata
            if (!metadata) return null
            
            const { eventStart, eventEnd } = parseEventTime(metadata.question || '')
            
            const bid = state.bestBid
            const ask = state.bestAsk
            const isSettled = bid !== null && ask !== null && ((bid <= 0.02 && ask >= 0.98) || (bid >= 0.98 && ask <= 0.02))
            const isInWindow = eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : false
            const justEnded = eventStart && eventEnd ? (now >= eventEnd && now < eventEnd + (10 * 60 * 1000)) : false
            const aboutToStart = eventStart && eventEnd ? (eventStart > now && eventStart <= now + (30 * 60 * 1000)) : false
            const isInActiveRange = bid !== null && ask !== null && (bid >= 0.10 && bid <= 0.90) && (ask >= 0.10 && ask <= 0.90)
            
            const timeUntilStart = eventStart ? ((eventStart - now) / 1000 / 60) : null
            const timeUntilEnd = eventEnd ? ((eventEnd - now) / 1000 / 60) : null
            const timeSinceEnd = eventEnd ? ((now - eventEnd) / 1000 / 60) : null
            
            // Calculate distance from current time for sorting
            // Use eventStart if available, otherwise use metadata startTime
            const referenceTime = eventStart || metadata.startTime || 0
            const timeDistance = Math.abs(referenceTime - now)
            
            return {
              marketId: state.marketId,
              question: metadata.question,
              tokenId: metadata.yesTokenId || metadata.tokenId,
              yesTokenId: metadata.yesTokenId || metadata.tokenId,
              noTokenId: metadata.noTokenId || metadata.tokenIds?.[1],
              eventTimeframe: metadata.eventTimeframe,
              bestBid: bid,
              bestAsk: ask,
              lastPrice: state.lastPrice,
              metadataStartTime: metadata.startTime,
              metadataEndTime: metadata.endTime,
              parsedEventStart: eventStart,
              parsedEventEnd: eventEnd,
              parsedEventStartET: eventStart ? new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              parsedEventEndET: eventEnd ? new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              isInWindow,
              justEnded,
              aboutToStart,
              isInActiveRange,
              isSettled,
              timeUntilStartMinutes: timeUntilStart,
              timeUntilEndMinutes: timeUntilEnd,
              timeSinceEndMinutes: timeSinceEnd,
              bidCents: bid !== null ? (bid * 100).toFixed(1) : null,
              askCents: ask !== null ? (ask * 100).toFixed(1) : null,
              _timeDistance: timeDistance, // For sorting, will be removed before returning
            }
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
        
        // Sort by proximity to current time (closest first)
        debugMarkets.sort((a, b) => {
          return a._timeDistance - b._timeDistance
        })
        
        // Return ALL markets (no limit)
        const limitedMarkets = debugMarkets.map(({ _timeDistance, ...rest }) => rest)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          pair,
          timeframe,
          currentTime: new Date(now).toISOString(),
          currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
          totalMatching: matchingMarkets.length,
          marketsReturned: limitedMarkets.length,
          markets: limitedMarkets,
        }, null, 2))
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message || 'Invalid request' }))
      }
    })
    return
  }

  // Current markets endpoint
  if (path === '/markets/current' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', async () => {
      try {
        const { pair, timeframe, offset = 0 } = JSON.parse(body)
        const pairUpper = (pair || '').toUpperCase()
        const timeframeNormalized = timeframe ? timeframe.toLowerCase() : undefined

        // ========== OFFSET MARKET LOOKUP (past/future markets) ==========
        // If offset != 0, fetch the market for that specific time window
        // Use the same logic as ensureMarketMetadataForPair (current market) to ensure consistency
        if (offset !== 0 && pairUpper && timeframeNormalized) {
          const timeframeMinutes = timeframeNormalized === '15m' ? 15 : 60
          
          // Calculate the actual target window start (same logic as current market)
          const baseWindowStart = getEventWindowStart(timeframeMinutes)
          const targetWindowStart = baseWindowStart + (offset * timeframeMinutes * 60 * 1000)
          
          let slug: string | null = null
          
          // For 15m markets: use same logic as ensureMarketMetadataForPair (add 24h for slug generation)
          if (timeframeNormalized === '15m') {
            const windowStartMs = targetWindowStart + (24 * 60 * 60 * 1000)
            const eventStartSeconds = Math.floor(windowStartMs / 1000)
            slug = generateSlug(pairUpper, timeframeNormalized, eventStartSeconds)
          } else {
            // For 1h markets: use same logic as ensureMarketMetadataForPair (no 24h offset for slug)
            const eventStartSeconds = Math.floor(targetWindowStart / 1000)
            slug = generateSlug(pairUpper, timeframeNormalized, eventStartSeconds)
          }
          
          if (slug) {
            console.log(`[Server] Offset market lookup: pair=${pairUpper}, timeframe=${timeframeNormalized}, offset=${offset}, slug=${slug}`)
            
            try {
              const marketMetadata = await fetchMarketBySlug(slug)
              
              if (marketMetadata) {
                // Use eventStartTime from API if available (actual event time), otherwise use targetWindowStart
                // This matches the logic used in ensureMarketMetadataForPair
                const eventStart = marketMetadata.eventStartTime || targetWindowStart
                const eventEnd = marketMetadata.eventEndTime || (eventStart + (timeframeMinutes * 60 * 1000))
                const now = Date.now()
                
                // Determine market status
                const isPast = eventEnd < now
                const isFuture = eventStart > now
                const isLive = !isPast && !isFuture
                
                const yesTokenId = marketMetadata.yesTokenId || marketMetadata.tokenId || marketMetadata.tokenIds?.[0] || null
                const noTokenId = marketMetadata.noTokenId || marketMetadata.tokenIds?.[1] || null
                
                // IMPORTANT: Add this market to the state store so it gets polled
                const stateStore = wsServer.getStateStore()
                const enrichedMetadata = {
                  ...marketMetadata,
                  eventStartTime: eventStart,
                  eventEndTime: eventEnd,
                  eventTimeframe: timeframeNormalized,
                }
                stateStore.setMarketMetadata(marketMetadata.marketId, enrichedMetadata)
                console.log(`[Server] Added offset market ${marketMetadata.marketId} to state store for polling`)
                
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                  marketId: marketMetadata.marketId,
                  question: marketMetadata.question,
                  tokenId: yesTokenId,
                  yesTokenId,
                  noTokenId,
                  tokenIds: marketMetadata.tokenIds || (yesTokenId ? [yesTokenId, noTokenId].filter(Boolean) : undefined),
                  slug: marketMetadata.slug || slug,
                  bestBid: null, // Offset markets may not have live prices in state store
                  bestAsk: null,
                  lastPrice: null,
                  startTime: eventStart,
                  endTime: eventEnd,
                  eventTimeframe: timeframeNormalized,
                  // Additional metadata for offset markets
                  offset,
                  marketStatus: isPast ? 'ended' : isFuture ? 'upcoming' : 'live',
                  isPast,
                  isFuture,
                  isLive,
                  debug: {
                    offsetRequested: offset,
                    targetWindowStart: new Date(eventStart).toISOString(),
                    targetWindowStartET: new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }),
                    targetWindowEnd: new Date(eventEnd).toISOString(),
                    targetWindowEndET: new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }),
                    slugUsed: slug,
                  }
                }))
                return
              } else {
                console.log(`[Server] Offset market not found for slug: ${slug}`)
                // Fall through to return no market found
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                  marketId: null,
                  question: null,
                  error: `No market found for offset ${offset}`,
                  offset,
                  debug: { slugAttempted: slug }
                }))
                return
              }
            } catch (slugError: any) {
              console.error(`[Server] Error fetching offset market by slug ${slug}:`, slugError.message)
              // Fall through to return error
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                marketId: null,
                question: null,
                error: `Failed to fetch market for offset ${offset}: ${slugError.message}`,
                offset,
                debug: { slugAttempted: slug }
              }))
              return
            }
          }
        }
        // ========== END OFFSET MARKET LOOKUP ==========

        // Original current market logic (offset === 0 or no offset)
        await ensureMarketMetadataForPair(pairUpper, timeframeNormalized)

        const stateStore = wsServer.getStateStore()
        const now = Date.now()
        
        // Get all markets
        let allMarkets = stateStore.getAllMarkets()
        
        const filterByPairAndTimeframe = (state: ReturnType<typeof stateStore.getAllMarkets>[number]) => {
          const metadata = state.metadata
          if (!metadata) return false
          
          // Check if market matches pair - look for BTC, SOL, ETH, XRP in question
          const question = (metadata.question || '').toUpperCase()
          
          // Map pair codes to full names
          const pairMap: Record<string, string[]> = {
            'BTC': ['BITCOIN', 'BTC'],
            'SOL': ['SOLANA', 'SOL'],
            'ETH': ['ETHEREUM', 'ETH'],
            'XRP': ['XRP', 'RIPPLE'],
          }
          const pairVariants = pairUpper ? (pairMap[pairUpper] || [pairUpper]) : []
          const hasPair = pairVariants.length === 0 || pairVariants.some(variant => question.includes(variant))
          
          // Check timeframe - match 15m or 1h (also handle "hourly" as 1h)
          let marketTimeframe = metadata.eventTimeframe?.toLowerCase() || ''
          // Also check slug for timeframe indicator
          if (!marketTimeframe && metadata.slug) {
            // Hourly markets use format: "solana-up-or-down-november-27-2pm-et"
            if (metadata.slug.includes('-up-or-down-') && metadata.slug.endsWith('-et')) {
              marketTimeframe = '1h'
            } else if (metadata.slug.includes('-1h-') || metadata.slug.includes('-hourly-')) {
              marketTimeframe = '1h'
            } else if (metadata.slug.includes('-15m-')) {
              marketTimeframe = '15m'
            }
          }
          // Normalize "hourly" to "1h"
          if (marketTimeframe === 'hourly') {
            marketTimeframe = '1h'
          }
          const hasTimeframe = !timeframeNormalized || marketTimeframe === timeframeNormalized
          
          return hasPair && hasTimeframe
        }

        let matchingMarkets = allMarkets.filter(filterByPairAndTimeframe)
        
        // Always try to ensure we have the current market, even if we have other markets
        // This ensures we fetch the market for the current time slot
        if (pairUpper && timeframeNormalized) {
          await ensureMarketMetadataForPair(pairUpper, timeframeNormalized)
          allMarkets = stateStore.getAllMarkets()
          matchingMarkets = allMarkets.filter(filterByPairAndTimeframe)
        }
        
        // ⚠️⚠️⚠️ CRITICAL: parseEventTime function - DO NOT MODIFY ⚠️⚠️⚠️
        // This function parses event times from question text and handles 24h offset detection
        // It tries multiple date options (original, -24h, today) to find the correct market
        // Modifying this will break market time detection
        // See: ws-service/MARKET_SELECTION_CRITICAL.md
        // Parse the actual event time from the question (e.g., "November 27, 10:15AM-10:30AM ET")
        // This is the actual trading window (15m or 1h), not the full market window
        const parseEventTime = (metadata: any): { eventStart: number | null; eventEnd: number | null } => {
          try {
            const question: string = metadata?.question || ''
            // Pattern: "November 27, 10:15AM-10:30AM ET" or "10:15AM-10:30AM ET"
            // First try to extract date if present
            const datePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i
            const dateMatch = question.match(datePattern)
            
            const timePattern = /(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)\s+ET/i
            const match = question.match(timePattern)
            if (!match) return { eventStart: null, eventEnd: null }
            
            // Get current date components in ET timezone
            const nowDate = new Date()
            const etFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
            
            // Get today's date in ET
            const etParts = etFormatter.formatToParts(nowDate)
            const todayYear = parseInt(etParts.find(p => p.type === 'year')?.value || '2025')
            const todayMonth = parseInt(etParts.find(p => p.type === 'month')?.value || '11')
            const todayDay = parseInt(etParts.find(p => p.type === 'day')?.value || '27')
            
            // Parse date from question if present
            let etYear: number, etMonth: number, etDay: number
            if (dateMatch) {
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
              const monthName = dateMatch[1].toLowerCase()
              etMonth = monthNames.indexOf(monthName) + 1
              etDay = parseInt(dateMatch[2])
              etYear = todayYear
              
              // If the parsed month/day is in the past compared to today, assume it's next year
              if (etMonth < todayMonth || (etMonth === todayMonth && etDay < todayDay)) {
                etYear += 1
              }
            } else {
              // No date in question, use today
              etYear = todayYear
              etMonth = todayMonth
              etDay = todayDay
            }
            
            // Try multiple date options:
            // 1. The parsed date as-is (in case it's actually correct)
            // 2. The parsed date -24h (in case we're 24h ahead)
            // 3. Today as a fallback
            const datesToTry: Array<{year: number, month: number, day: number}> = []
            
            // Add parsed date as-is
            datesToTry.push({ year: etYear, month: etMonth, day: etDay })
            
            // Add parsed date -24h
            const parsedDate = new Date(etYear, etMonth - 1, etDay)
            parsedDate.setDate(parsedDate.getDate() - 1)
            datesToTry.push({ 
              year: parsedDate.getFullYear(), 
              month: parsedDate.getMonth() + 1, 
              day: parsedDate.getDate() 
            })
            
            // Add today as fallback
            datesToTry.push({ year: todayYear, month: todayMonth, day: todayDay })
            // Remove duplicates
            const uniqueDates = datesToTry.filter((date, index, self) => 
              index === self.findIndex(d => d.year === date.year && d.month === date.month && d.day === date.day)
            )
            
            // Parse start time
            let startHour = parseInt(match[1])
            const startMin = parseInt(match[2])
            const startPeriod = match[3].toUpperCase()
            if (startPeriod === 'PM' && startHour !== 12) startHour += 12
            if (startPeriod === 'AM' && startHour === 12) startHour = 0
            
            // Parse end time
            let endHour = parseInt(match[4])
            const endMin = parseInt(match[5])
            const endPeriod = match[6].toUpperCase()
            if (endPeriod === 'PM' && endHour !== 12) endHour += 12
            if (endPeriod === 'AM' && endHour === 12) endHour = 0
            
            // Create ET-based timestamps by attaching a fixed offset and then
            // letting JS normalize. This is approximate but consistent with our
            // earlier behavior.
            const createETTimestamp = (year: number, month: number, day: number, hour: number, minute: number): number => {
              const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`
              const offset = (month >= 11 || month <= 2) ? '-05:00' : '-04:00'
              const dateWithOffset = new Date(`${dateStr}${offset}`)
              return dateWithOffset.getTime()
            }
            
            const currentTime = Date.now()
            let bestMatch: { eventStart: number, eventEnd: number } | null = null
            
            for (const dateToTry of uniqueDates) {
              const candidateStart = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, startHour, startMin)
              let candidateEnd = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, endHour, endMin)
              
              // If end time is before start time, it's the next day
              if (candidateEnd < candidateStart) {
                const nextDay = new Date(candidateEnd)
                nextDay.setDate(nextDay.getDate() + 1)
                candidateEnd = nextDay.getTime()
              }
              
              const isActive = currentTime >= candidateStart && currentTime < candidateEnd
              
              if (isActive) {
                return { eventStart: candidateStart, eventEnd: candidateEnd }
              }
              
              if (!bestMatch || Math.abs(candidateStart - currentTime) < Math.abs(bestMatch.eventStart - currentTime)) {
                bestMatch = { eventStart: candidateStart, eventEnd: candidateEnd }
              }
            }
            
            if (bestMatch) {
              return bestMatch
            }
            
            return { eventStart: null, eventEnd: null }
          } catch (error) {
            return { eventStart: null, eventEnd: null }
          }
        }
        
        // ⚠️⚠️⚠️ CRITICAL MARKET SELECTION LOGIC - DO NOT MODIFY ⚠️⚠️⚠️
        // This section finds the current active market by:
        // 1. Using eventStartTime from API as primary source (most reliable)
        // 2. Falling back to slug timestamp parsing if eventStartTime not available
        // 3. Detecting 24h offset and adjusting timestamps
        // 4. Constructing adjusted slugs to point to today's markets
        // ANY CHANGES TO THIS LOGIC WILL BREAK MARKET DETECTION
        // See: ws-service/MARKET_SELECTION_CRITICAL.md for full explanation
        // Slug format: "sol-updown-15m-1764355500" or "sol-updown-1h-1764355500" where last number is Unix timestamp in seconds
        const marketsWithWindows = matchingMarkets
          .map(state => {
            const metadata = state.metadata
            if (!metadata) return null
            
            // First priority: Use eventStartTime from API if available (most reliable)
            let eventStart: number | null = null
            let eventEnd: number | null = null
            let adjustedSlug: string | null = null // Store adjusted slug if we detect 24h offset
            
            if (metadata.eventStartTime && metadata.eventEndTime) {
              // Use API-provided event times
              let eventStartMs = metadata.eventStartTime
              let eventEndMs = metadata.eventEndTime
              
              if (timeframeNormalized !== '15m') {
                // For non-15m markets, detect 24h offset and filter out far-away events
                let hoursFromNow = (eventStartMs - now) / (1000 * 60 * 60)
                if (hoursFromNow > 18 && hoursFromNow < 26) {
                  // Likely 24h offset - subtract 24 hours
                  eventStartMs = eventStartMs - (24 * 60 * 60 * 1000)
                  eventEndMs = eventEndMs - (24 * 60 * 60 * 1000)
                  hoursFromNow = (eventStartMs - now) / (1000 * 60 * 60)
                }
                
                // Check if within reasonable window (-6 to +6 hours)
                if (Math.abs(hoursFromNow) > 6) {
                  // Event time is too far away, skip this market
                  return null
                }
              }
              
              eventStart = eventStartMs
              eventEnd = eventEndMs
            } else if (metadata.slug) {
              // Fallback to slug parsing if eventStartTime not available
              // Handle hourly market slug format: "solana-up-or-down-november-27-2pm-et"
              if (metadata.slug.includes('-up-or-down-') && metadata.slug.endsWith('-et')) {
                try {
                  // Parse format: "solana-up-or-down-november-27-2pm-et"
                  const parts = metadata.slug.split('-up-or-down-')
                  if (parts.length === 2) {
                    const dateTimePart = parts[1].replace(/-et$/, '') // "november-27-2pm"
                    const dateTimeMatch = dateTimePart.match(/^([a-z]+)-(\d+)-(\d+)(am|pm)$/i)
                    if (dateTimeMatch) {
                      const monthName = dateTimeMatch[1]
                      const day = parseInt(dateTimeMatch[2], 10)
                      let hour = parseInt(dateTimeMatch[3], 10)
                      const period = dateTimeMatch[4].toLowerCase()
                      
                      // Convert to 24-hour format
                      if (period === 'pm' && hour !== 12) hour += 12
                      if (period === 'am' && hour === 12) hour = 0
                      
                      // Get current year
                      const nowDate = new Date()
                      const etFormatter = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'America/New_York',
                        year: 'numeric',
                      })
                      const year = parseInt(etFormatter.format(nowDate), 10)
                      
                      // Convert month name to number
                      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                         'july', 'august', 'september', 'october', 'november', 'december']
                      const month = monthNames.indexOf(monthName.toLowerCase()) + 1
                      
                      if (month > 0 && day > 0 && day <= 31 && hour >= 0 && hour <= 23) {
                        // Create ET timestamp for the start of the hour
                        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:00:00`
                        const offset = (month >= 11 || month <= 2) ? '-05:00' : '-04:00'
                        const eventDate = new Date(`${dateStr}${offset}`)
                        const eventStartMs = eventDate.getTime()
                        
                        // Validate the date is valid
                        if (!isNaN(eventStartMs)) {
                          const eventEndMs = eventStartMs + (60 * 60 * 1000) // 1 hour
                          
                          // Check if within reasonable window (-6 to +6 hours)
                          const hoursFromNow = (eventStartMs - now) / (1000 * 60 * 60)
                          if (Math.abs(hoursFromNow) <= 6) {
                            eventStart = eventStartMs
                            eventEnd = eventEndMs
                          }
                        }
                      }
                    }
                  }
                } catch (error) {
                  // Fall through to timestamp parsing
                }
              }
              
              // Handle timestamp-based slug format: "sol-updown-15m-1764355500" or "sol-updown-1h-1764355500"
              if (!eventStart && !eventEnd) {
                const slugMatch = metadata.slug.match(/-(\d+)$/)
                if (slugMatch) {
                  const slugTimestampSeconds = parseInt(slugMatch[1], 10)
                  if (!Number.isNaN(slugTimestampSeconds)) {
                    let slugTimestampMs = slugTimestampSeconds * 1000
                    
                    // Check if slug timestamp is within reasonable window
                    let hoursFromNow = (slugTimestampMs - now) / (1000 * 60 * 60)
                    let wasAdjusted = false
                    
                    // For 15m markets: if timestamp is 18-26 hours away, it's definitely tomorrow's market - skip it
                    // For 1h markets: try adjusting 24h offset
                    if (timeframeNormalized === '15m' && hoursFromNow > 18 && hoursFromNow < 26) {
                      // This is tomorrow's 15m market - skip it entirely
                      return null
                    }
                    
                    // For 1h markets, try adjusting 24h offset
                    if (timeframeNormalized === '1h' && hoursFromNow > 18 && hoursFromNow < 26) {
                      // Likely 24h offset - subtract 24 hours and check if that brings it close to now
                      slugTimestampMs = slugTimestampMs - (24 * 60 * 60 * 1000)
                      hoursFromNow = (slugTimestampMs - now) / (1000 * 60 * 60)
                      wasAdjusted = true
                    }
                    
                    // For 15m markets, be stricter: only accept if within current window or very recent past/future
                    // This prevents selecting tomorrow's markets
                    const maxHoursAway = timeframeNormalized === '15m' ? 2 : 6 // 15m: 2 hours, 1h: 6 hours
                    
                    // Only use if within reasonable window
                    if (Math.abs(hoursFromNow) <= maxHoursAway) {
                      eventStart = slugTimestampMs
                      const timeframeMinutes = timeframeNormalized === '1h' ? 60 : 15
                      eventEnd = eventStart + (timeframeMinutes * 60 * 1000)
                      
                      // If we adjusted the timestamp, construct today's slug
                      if (wasAdjusted && metadata.slug) {
                        const slugBase = metadata.slug.replace(/-\d+$/, '')
                        const adjustedTimestampSeconds = Math.floor(slugTimestampMs / 1000)
                        adjustedSlug = `${slugBase}-${adjustedTimestampSeconds}`
                      }
                    } else {
                      // Slug timestamp is too far away, skip this market
                      return null
                    }
                  }
                }
              }
            }
            
            // Fallback to parsing question text if slug doesn't have timestamp
            if (!eventStart || !eventEnd) {
              const parsed = parseEventTime(metadata)
              eventStart = parsed.eventStart
              eventEnd = parsed.eventEnd
            }
            
            if (!eventStart || !eventEnd) return null
            
            const isInWindow = now >= eventStart && now < eventEnd
            const timeUntilStart = eventStart - now
            const timeUntilEnd = eventEnd - now
            
            return {
              state,
              eventStart,
              eventEnd,
              isInWindow,
              timeUntilStart,
              timeUntilEnd,
              adjustedSlug, // Slug adjusted for today if we detected 24h offset
            }
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
        
        // ⚠️⚠️⚠️ CRITICAL: Market selection priority logic - DO NOT MODIFY ⚠️⚠️⚠️
        // This logic selects markets in priority order:
        // 1. Markets currently in their window (active) - ONLY THESE
        // 2. Closest upcoming markets
        // 3. Most recently ended markets (fallback)
        // Changing this order will cause incorrect market selection
        // See: ws-service/MARKET_SELECTION_CRITICAL.md
        let currentMarket: typeof matchingMarkets[0] | null = null
        let selectedMarketWindow: typeof marketsWithWindows[0] | null = null // Track selected market window data
        
        // Select markets that are currently in their window (active RIGHT NOW)
        // OR markets that just ended (within 15 minutes) - for 15m markets, this handles the case
        // where the market just ended but we're still in the same 15-minute period
        // Filter out future markets (eventStart > now) to ensure we only select markets that have actually started
        const inWindowMarkets = marketsWithWindows.filter(m => m.isInWindow && m.eventStart <= now)
        const justEndedMarkets = marketsWithWindows.filter(m => {
          if (m.isInWindow) return false // Already in window
          // Market ended within the last 15 minutes
          const timeSinceEnd = now - m.eventEnd
          return timeSinceEnd >= 0 && timeSinceEnd <= 15 * 60 * 1000
        })
        
        if (inWindowMarkets.length > 0) {
          // If multiple markets are in window, pick the one that started most recently
          inWindowMarkets.sort((a, b) => b.eventStart - a.eventStart)
          selectedMarketWindow = inWindowMarkets[0]
          currentMarket = inWindowMarkets[0].state
          console.log(`[Server] Found market in window: ${currentMarket.metadata?.question?.substring(0, 60)}...`)
        } else if (justEndedMarkets.length > 0) {
          // Use the most recently ended market (within grace period)
          justEndedMarkets.sort((a, b) => b.eventEnd - a.eventEnd)
          selectedMarketWindow = justEndedMarkets[0]
          currentMarket = justEndedMarkets[0].state
          console.log(`[Server] Found recently ended market: ${currentMarket.metadata?.question?.substring(0, 60)}...`)
        } else {
          // No market currently in window or recently ended - return null
          console.log(`[Server] No market currently in window or recently ended for ${pair} ${timeframe}`)
          currentMarket = null
        }
        
        // Debug logging
        console.log(`[Server] Current market request: pair=${pair}, timeframe=${timeframe}`)
        console.log(`[Server] Total markets: ${allMarkets.length}, Matching: ${matchingMarkets.length}, Markets with valid windows: ${marketsWithWindows.length}`)
        
        if (!currentMarket) {
          if (matchingMarkets.length > 0) {
            console.log(`[Server] Found ${matchingMarkets.length} matching markets for ${pair} ${timeframe}, but couldn't determine current market`)
            const sample = matchingMarkets[0]
            if (sample.metadata) {
              const { eventStart, eventEnd } = parseEventTime(sample.metadata)
              const startDate = eventStart ? new Date(eventStart).toISOString() : 'N/A'
              const endDate = eventEnd ? new Date(eventEnd).toISOString() : 'N/A'
              const nowDate = new Date(now).toISOString()
              console.log(`[Server] Sample market: ${sample.metadata.question}`)
              console.log(`[Server]   Start: ${startDate}, End: ${endDate}, Now: ${nowDate}`)
              console.log(`[Server]   Active: ${eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : 'N/A'}`)
            }
          } else {
            console.log(`[Server] No matching markets found for ${pair} ${timeframe}`)
            // Show sample of what we have
            const sampleMarkets = allMarkets.slice(0, 3)
            sampleMarkets.forEach(m => {
              if (m.metadata) {
                console.log(`[Server] Sample market: ${m.metadata.question} (${m.metadata.eventTimeframe || 'no timeframe'})`)
              }
            })
          }
        }
        
        // Get debug info - check all matching markets to see why they're filtered
        let debugInfo: any = null
        if (matchingMarkets.length > 0) {
          const inWindowMarkets: any[] = []
          
          for (const market of matchingMarkets.slice(0, 5)) {
            if (!market.metadata) continue
            const { eventStart, eventEnd } = parseEventTime(market.metadata)
            if (eventStart && eventEnd) {
              const isInWindow = now >= eventStart && now < eventEnd
              if (isInWindow) {
                const isSettled = market.bestBid !== null && market.bestAsk !== null && 
                                 ((market.bestBid <= 0.02 && market.bestAsk >= 0.98) || 
                                  (market.bestBid >= 0.98 && market.bestAsk <= 0.02))
                inWindowMarkets.push({
                  question: market.metadata.question,
                  marketId: market.marketId,
                  tokenId: market.metadata.tokenId,
                  bestBid: market.bestBid,
                  bestAsk: market.bestAsk,
                  isSettled,
                  hasPrices: market.bestBid !== null && market.bestAsk !== null,
                  eventStart: new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }),
                  eventEnd: new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }),
                })
              }
            }
          }
          
          const sampleMarket = matchingMarkets[0]
          if (sampleMarket.metadata) {
            const { eventStart, eventEnd } = parseEventTime(sampleMarket.metadata)
            debugInfo = {
              sampleMarket: sampleMarket.metadata.question,
              currentTime: new Date(now).toISOString(),
              currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
              parsedEventStart: eventStart ? new Date(eventStart).toISOString() : null,
              parsedEventStartET: eventStart ? new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              parsedEventEnd: eventEnd ? new Date(eventEnd).toISOString() : null,
              parsedEventEndET: eventEnd ? new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              timeUntilStart: eventStart ? ((eventStart - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
              timeUntilEnd: eventEnd ? ((eventEnd - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
              isInWindow: eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : null,
              inWindowMarkets: inWindowMarkets,
              totalMatching: matchingMarkets.length,
              marketsWithWindows: marketsWithWindows.length,
            }
          }
        }

        console.log(
          `[Server] Final check: currentMarket=${currentMarket ? 'exists' : 'null'}, hasMetadata=${
            currentMarket?.metadata ? 'yes' : 'no'
          }`
        )
        
        if (currentMarket && currentMarket.metadata) {
          // Use eventStart/eventEnd from selectedMarketWindow (which has slug timestamp adjustment)
          // Fallback to parsing question text if selectedMarketWindow not available
          const eventStart = selectedMarketWindow?.eventStart || parseEventTime(currentMarket.metadata).eventStart
          const eventEnd = selectedMarketWindow?.eventEnd || parseEventTime(currentMarket.metadata).eventEnd
          
          // Calculate isSettled and isInActiveRange from current market prices
          const bid = currentMarket.bestBid
          const ask = currentMarket.bestAsk
          const hasPrices = bid !== null && bid !== undefined && ask !== null && ask !== undefined
          const isSettled = hasPrices && ((bid <= 0.02 && ask >= 0.98) || (bid >= 0.98 && ask <= 0.02))
          const isInActiveRange = hasPrices && 
            (bid >= 0.10 && bid <= 0.90 && ask >= 0.10 && ask <= 0.90)
          
          console.log(`[Server] Returning market: ${currentMarket.marketId}, isSettled=${isSettled}, isInWindow=${eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : false}`)
          
          // IMPORTANT: Ensure this market is in the state store for polling
          const stateStore = wsServer.getStateStore()
          const enrichedMetadata = {
            ...currentMarket.metadata,
            eventStartTime: eventStart || undefined,
            eventEndTime: eventEnd || undefined,
          }
          stateStore.setMarketMetadata(currentMarket.marketId, enrichedMetadata)
          console.log(`[Server] Ensured market ${currentMarket.marketId} is in state store for polling`)
          
          res.writeHead(200, { 'Content-Type': 'application/json' })
          const yesTokenId = currentMarket.metadata.yesTokenId || currentMarket.metadata.tokenId || currentMarket.metadata.tokenIds?.[0] || null
          const noTokenId = currentMarket.metadata.noTokenId || currentMarket.metadata.tokenIds?.[1] || null

        // ⚠️ CRITICAL: Using adjusted slug to point to today's market (not tomorrow's)
        // The adjustedSlug is constructed when we detect a 24h offset in the slug timestamp
        // This ensures "View on Polymarket" links point to the correct market
        res.end(JSON.stringify({
          marketId: currentMarket.marketId,
          question: currentMarket.metadata.question,
          tokenId: yesTokenId,
          yesTokenId,
          noTokenId,
          tokenIds: currentMarket.metadata.tokenIds || (yesTokenId ? [yesTokenId, noTokenId].filter(Boolean) : undefined),
          slug: selectedMarketWindow?.adjustedSlug || currentMarket.metadata.slug || null, // Use adjusted slug if available
          bestBid: currentMarket.bestBid,
          bestAsk: currentMarket.bestAsk,
          lastPrice: currentMarket.lastPrice,
          startTime: eventStart || currentMarket.metadata.startTime, // Use adjusted parsed time
          endTime: eventEnd || currentMarket.metadata.endTime, // Use adjusted parsed time
          eventTimeframe: currentMarket.metadata.eventTimeframe,
          isSettled: isSettled,
          isInActiveRange: isInActiveRange,
          debug: {
            parsedEventStart: eventStart ? new Date(eventStart).toISOString() : null,
            parsedEventStartET: eventStart ? new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
            parsedEventEnd: eventEnd ? new Date(eventEnd).toISOString() : null,
            parsedEventEndET: eventEnd ? new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
            currentTime: new Date(now).toISOString(),
            currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
            timeUntilStart: eventStart ? ((eventStart - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
            timeUntilEnd: eventEnd ? ((eventEnd - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
            isInWindow: eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : null,
          }
        }))
        } else {
          // Return 200 with null to indicate no market found (not an error)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            marketId: null,
            question: null,
            tokenId: null,
            yesTokenId: null,
            noTokenId: null,
            slug: null,
            bestBid: null,
            bestAsk: null,
            lastPrice: null,
            startTime: null,
            endTime: null,
            eventTimeframe: null,
            error: 'No active market found',
            debug: {
              currentTime: new Date(now).toISOString(),
              currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
              totalMatching: matchingMarkets.length,
              marketsWithWindows: marketsWithWindows.length,
            }
          }))
        }
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message || 'Invalid request' }))
      }
    })
    return
  }

  // Price history endpoint - serves chart data from optimized JSONB storage
  if (path === '/api/price-history' && req.method === 'GET') {
    const marketId = url.searchParams.get('marketId')
    const yesTokenId = url.searchParams.get('yesTokenId')
    const noTokenId = url.searchParams.get('noTokenId')
    const startTimeParam = url.searchParams.get('startTime')
    const endTimeParam = url.searchParams.get('endTime')

    if (!marketId && (!yesTokenId || !noTokenId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing required parameters: marketId OR (yesTokenId and noTokenId)' }))
      return
    }

    try {
      const startTime = startTimeParam ? new Date(parseInt(startTimeParam)) : null
      const endTime = endTimeParam ? new Date(parseInt(endTimeParam)) : null

      const chartData = await queryPriceHistory(
        marketId,
        yesTokenId,
        noTokenId,
        startTime,
        endTime
      )

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        data: chartData,
        count: chartData.length,
      }))
    } catch (error: any) {
      console.error('[Server] Error querying price history:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message || 'Failed to fetch price history' }))
    }
    return
  }

  // ============================================
  // STRATEGY API ENDPOINTS
  // ============================================

  // Create a new strategy
  if (path === '/api/strategies' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', async () => {
      try {
        const strategyData = JSON.parse(body)
        
        if (!strategyData.userAddress) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Missing userAddress' }))
          return
        }
        
        if (!strategyData.name) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Missing strategy name' }))
          return
        }

        const strategy = await createStrategy(strategyData)
        
        if (strategy) {
          console.log(`[Server] Created strategy: ${strategy.name} (${strategy.id})`)
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: strategy }))
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Failed to create strategy' }))
        }
      } catch (error: any) {
        console.error('[Server] Error creating strategy:', error)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message || 'Invalid request' }))
      }
    })
    return
  }

  // Get all strategies (for browsing/scraping)
  if (path === '/api/strategies' && req.method === 'GET') {
    try {
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')
      
      const strategies = await getAllStrategies(limit, offset)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, data: strategies, count: strategies.length }))
    } catch (error: any) {
      console.error('[Server] Error fetching strategies:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Failed to fetch strategies' }))
    }
    return
  }

  // Get strategies for a specific user
  if (path === '/api/strategies/user' && req.method === 'GET') {
    const userAddress = url.searchParams.get('address')
    
    if (!userAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'Missing address parameter' }))
      return
    }

    try {
      const strategies = await getUserStrategies(userAddress)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, data: strategies, count: strategies.length }))
    } catch (error: any) {
      console.error('[Server] Error fetching user strategies:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Failed to fetch strategies' }))
    }
    return
  }

  // Get/Update/Delete a specific strategy by ID
  const strategyIdMatch = path.match(/^\/api\/strategies\/([a-f0-9-]+)$/)
  if (strategyIdMatch) {
    const strategyId = strategyIdMatch[1]
    
    // GET - Get strategy by ID
    if (req.method === 'GET') {
      try {
        const strategy = await getStrategy(strategyId)
        
        if (strategy) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: strategy }))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Strategy not found' }))
        }
      } catch (error: any) {
        console.error('[Server] Error fetching strategy:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message || 'Failed to fetch strategy' }))
      }
      return
    }
    
    // PUT - Update strategy
    if (req.method === 'PUT') {
      let body = ''
      req.on('data', (chunk) => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const updates = JSON.parse(body)
          const strategy = await updateStrategy(strategyId, updates)
          
          if (strategy) {
            console.log(`[Server] Updated strategy: ${strategy.name} (${strategy.id})`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, data: strategy }))
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'Strategy not found' }))
          }
        } catch (error: any) {
          console.error('[Server] Error updating strategy:', error)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: error.message || 'Invalid request' }))
        }
      })
      return
    }
    
    // DELETE - Delete strategy
    if (req.method === 'DELETE') {
      try {
        const deleted = await deleteStrategy(strategyId)
        
        if (deleted) {
          console.log(`[Server] Deleted strategy: ${strategyId}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Strategy not found' }))
        }
      } catch (error: any) {
        console.error('[Server] Error deleting strategy:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message || 'Failed to delete strategy' }))
      }
      return
    }
  }

  // Toggle strategy active status
  const toggleMatch = path.match(/^\/api\/strategies\/([a-f0-9-]+)\/toggle$/)
  if (toggleMatch && req.method === 'POST') {
    const strategyId = toggleMatch[1]
    
    try {
      const strategy = await toggleStrategyActive(strategyId)
      
      if (strategy) {
        console.log(`[Server] Toggled strategy ${strategyId} active status to ${strategy.isActive}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: strategy }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Strategy not found' }))
      }
    } catch (error: any) {
      console.error('[Server] Error toggling strategy:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Failed to toggle strategy' }))
    }
    return
  }

  // Get strategy analytics
  const analyticsMatch = path.match(/^\/api\/strategies\/([a-f0-9-]+)\/analytics$/)
  if (analyticsMatch && req.method === 'GET') {
    const strategyId = analyticsMatch[1]
    
    try {
      const analytics = await getStrategyAnalytics(strategyId)
      
      if (analytics) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: analytics }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Analytics not found' }))
      }
    } catch (error: any) {
      console.error('[Server] Error fetching analytics:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Failed to fetch analytics' }))
    }
    return
  }

  // Recalculate strategy analytics
  const recalcMatch = path.match(/^\/api\/strategies\/([a-f0-9-]+)\/analytics\/recalculate$/)
  if (recalcMatch && req.method === 'POST') {
    const strategyId = recalcMatch[1]
    
    try {
      const analytics = await updateStrategyAnalytics(strategyId)
      
      if (analytics) {
        console.log(`[Server] Recalculated analytics for strategy ${strategyId}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: analytics }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Strategy not found' }))
      }
    } catch (error: any) {
      console.error('[Server] Error recalculating analytics:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Failed to recalculate analytics' }))
    }
    return
  }

  // Get trades for a strategy
  const tradesMatch = path.match(/^\/api\/strategies\/([a-f0-9-]+)\/trades$/)
  if (tradesMatch && req.method === 'GET') {
    const strategyId = tradesMatch[1]
    const limit = parseInt(url.searchParams.get('limit') || '100')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    
    try {
      const trades = await getStrategyTrades(strategyId, limit, offset)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, data: trades, count: trades.length }))
    } catch (error: any) {
      console.error('[Server] Error fetching trades:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: error.message || 'Failed to fetch trades' }))
    }
    return
  }

  // Record a new trade for a strategy
  if (tradesMatch && req.method === 'POST') {
    const strategyId = tradesMatch[1]
    
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', async () => {
      try {
        const tradeData = JSON.parse(body)
        tradeData.strategyId = strategyId
        
        const trade = await recordTrade(tradeData)
        
        if (trade) {
          console.log(`[Server] Recorded trade for strategy ${strategyId}`)
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, data: trade }))
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Failed to record trade' }))
        }
      } catch (error: any) {
        console.error('[Server] Error recording trade:', error)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message || 'Invalid request' }))
      }
    })
    return
  }

  // Sign order endpoint - signs orders using custodial wallet private key (SECURE - keys never leave VPS)
  if (path === '/api/trade/sign-order' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body)
        const {
          userId,
          tokenId,
          side,
          price,
          size,
          negRisk = false,
        } = requestData

        if (!userId || !tokenId || price === undefined || size === undefined || side === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Missing required fields: userId, tokenId, side, price, size',
            errorCode: 'MISSING_FIELDS',
          }))
          return
        }

        // Get custodial wallet private key
        const walletData = await getCustodialWalletPrivateKey(userId)
        if (!walletData) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Custodial wallet not found',
            errorCode: 'WALLET_NOT_FOUND',
          }))
          return
        }

        const { walletAddress, privateKey: privateKeyValue } = walletData

        // Create wallet from private key
        let wallet = new ethers.Wallet(privateKeyValue)

        // Verify wallet address matches
        if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Wallet address mismatch',
            errorCode: 'ADDRESS_MISMATCH',
          }))
          return
        }

        // Calculate amounts
        const TOKEN_DECIMALS = 1e6
        let makerAmount: string
        let takerAmount: string

        const orderSide = side === 0 || side === 'BUY' ? 'BUY' : 'SELL'
        if (orderSide === 'BUY') {
          const rawTakerAmount = Math.floor(size * 100) / 100
          const rawMakerAmount = Math.floor(rawTakerAmount * price * 10000) / 10000
          makerAmount = Math.floor(rawMakerAmount * TOKEN_DECIMALS).toString()
          takerAmount = Math.floor(rawTakerAmount * TOKEN_DECIMALS).toString()
        } else {
          const rawMakerAmount = Math.floor(size * 100) / 100
          const rawTakerAmount = Math.floor(rawMakerAmount * price * 10000) / 10000
          makerAmount = Math.floor(rawMakerAmount * TOKEN_DECIMALS).toString()
          takerAmount = Math.floor(rawTakerAmount * TOKEN_DECIMALS).toString()
        }

        // Get exchange nonce
        const nonceResponse = await fetch(`https://clob.polymarket.com/nonce?address=${walletAddress}`)
        const nonceData = await nonceResponse.json().catch(() => ({ nonce: '0' }))
        const nonce = nonceData.nonce?.toString() || '0'

        // Generate salt
        const salt = Math.round(Math.random() * Date.now())
        const saltBigInt = BigInt(salt)

        // Determine exchange address
        const EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
        const NEG_RISK_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a'
        const exchangeAddress = negRisk ? NEG_RISK_EXCHANGE_ADDRESS : EXCHANGE_ADDRESS
        const POLYGON_CHAIN_ID = 137

        // EIP-712 domain
        const domain = {
          name: 'Polymarket CTF Exchange',
          version: '1',
          chainId: POLYGON_CHAIN_ID,
          verifyingContract: exchangeAddress,
        }

        // EIP-712 types
        const types = {
          Order: [
            { name: 'salt', type: 'uint256' },
            { name: 'maker', type: 'address' },
            { name: 'signer', type: 'address' },
            { name: 'taker', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
            { name: 'makerAmount', type: 'uint256' },
            { name: 'takerAmount', type: 'uint256' },
            { name: 'expiration', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'feeRateBps', type: 'uint256' },
            { name: 'side', type: 'uint8' },
            { name: 'signatureType', type: 'uint8' },
          ],
        }

        // Build order for signing
        const numericSide = orderSide === 'BUY' ? 0 : 1
        const orderForSigning = {
          salt: saltBigInt,
          maker: ethers.getAddress(walletAddress),
          signer: ethers.getAddress(walletAddress),
          taker: ethers.ZeroAddress,
          tokenId: BigInt(tokenId),
          makerAmount: BigInt(makerAmount),
          takerAmount: BigInt(takerAmount),
          expiration: BigInt(0),
          nonce: BigInt(nonce),
          feeRateBps: BigInt(0),
          side: numericSide,
          signatureType: 0, // EOA
        }

        // Sign the order
        const signature = await wallet.signTypedData(domain, types, orderForSigning)

        // Note: We don't need to manually clear wallet - Node.js garbage collector will handle it
        // The wallet object will be garbage collected after the function completes

        // Return signed order
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          signedOrder: {
            salt: saltBigInt.toString(),
            maker: orderForSigning.maker,
            signer: orderForSigning.signer,
            taker: orderForSigning.taker,
            tokenId: BigInt(tokenId).toString(),
            makerAmount: makerAmount,
            takerAmount: takerAmount,
            expiration: '0',
            nonce: nonce,
            feeRateBps: '0',
            side: orderSide,
            signatureType: 0,
            signature: signature,
          },
        }))
      } catch (error: any) {
        console.error('[VPS Sign Order] Error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          success: false, 
          error: error.message || 'Failed to sign order',
          errorCode: 'INTERNAL_ERROR',
        }))
      }
    })
    return
  }

  // Trade submission endpoint - accepts signed orders from Next.js and submits to Polymarket
  // Uses official Polymarket SDK's postOrder() method for clean, reliable order submission
  if (path === '/api/trade/submit-order' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body)
        const {
          walletAddress,
          credentials,
          signedOrder, // SDK's SignedOrder object from createOrder()
          orderType = 'GTC', // 'GTC', 'GTD', 'FOK', or 'FAK'
        } = requestData

        // Validate required fields
        if (!walletAddress || !credentials || !signedOrder) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Missing required fields: walletAddress, credentials, signedOrder',
            errorCode: 'MISSING_FIELDS',
          }))
          return
        }

        // Validate credentials structure
        if (!credentials.apiKey || !credentials.secret || !credentials.passphrase) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Invalid credentials structure',
            errorCode: 'INVALID_CREDENTIALS',
          }))
          return
        }

        console.log('[VPS Trade] Submitting order to Polymarket:', {
          walletAddress: walletAddress.substring(0, 10) + '...',
          tokenId: signedOrder.tokenId?.substring(0, 20) + '...',
          side: signedOrder.side,
          orderType: orderType,
        })

        // Construct order payload in the format Polymarket API expects
        // The API expects: { order: {...orderFields}, signature, owner, orderType }
        const orderPayload = {
          order: {
            salt: signedOrder.salt,
            maker: signedOrder.maker,
            signer: signedOrder.signer,
            taker: signedOrder.taker,
            tokenId: signedOrder.tokenId,
            makerAmount: signedOrder.makerAmount,
            takerAmount: signedOrder.takerAmount,
            expiration: signedOrder.expiration,
            nonce: signedOrder.nonce,
            feeRateBps: signedOrder.feeRateBps,
            side: signedOrder.side === 'BUY' ? 0 : 1, // Convert to numeric
            signatureType: signedOrder.signatureType,
          },
          signature: signedOrder.signature,
          owner: walletAddress, // Maker address
          orderType: orderType.toUpperCase(), // 'GTC', 'GTD', 'FOK', or 'FAK'
        }

        // Make authenticated request to Polymarket CLOB API using HMAC auth
        const response = await makeAuthenticatedRequest(
          'POST',
          '/order',
          walletAddress,
          credentials as PolymarketApiCredentials,
          orderPayload
        )

        const responseText = await response.text()
        let responseData: any
        try {
          responseData = JSON.parse(responseText)
        } catch {
          responseData = { errorMsg: responseText }
        }

        if (!response.ok) {
          console.error('[VPS Trade] Polymarket error response:', {
            status: response.status,
            error: responseData,
          })

          // Check if Cloudflare blocked the request
          if (response.status === 403 && (
            responseText.includes('Cloudflare') || 
            responseText.includes('cf-error-details') || 
            responseText.includes('Attention Required')
          )) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              success: false,
              error: 'Request blocked by Cloudflare. Please wait a few seconds and try again.',
              errorCode: 'CLOUDFLARE_BLOCK',
              details: { errorMsg: 'Cloudflare security challenge triggered. Try again in a few seconds.' },
            }))
            return
          }

          // Map Polymarket error codes to user-friendly messages
          const errorMessages: Record<string, string> = {
            'INVALID_ORDER_MIN_TICK_SIZE': 'Order price breaks minimum tick size rules',
            'INVALID_ORDER_MIN_SIZE': 'Order size is below the minimum requirement',
            'INVALID_ORDER_DUPLICATED': 'This order has already been placed',
            'INVALID_ORDER_NOT_ENOUGH_BALANCE': 'Insufficient balance or allowance',
            'INVALID_ORDER_EXPIRATION': 'Order expiration is invalid',
            'INVALID_ORDER_ERROR': 'Could not insert order',
            'EXECUTION_ERROR': 'Could not execute trade',
            'ORDER_DELAYED': 'Order match delayed due to market conditions',
            'DELAYING_ORDER_ERROR': 'Error delaying the order',
            'FOK_ORDER_NOT_FILLED_ERROR': 'FOK order could not be fully filled',
            'MARKET_NOT_READY': 'Market is not yet ready to process new orders',
          }

          const errorCode = responseData.errorCode || responseData.code
          const errorMessage = errorMessages[errorCode] || responseData.errorMsg || 'Order placement failed'

          res.writeHead(response.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: false,
            error: errorMessage,
            errorCode: errorCode || 'UNKNOWN_ERROR',
            details: responseData,
          }))
          return
        }

        // Success
        console.log('[VPS Trade] Order submitted successfully:', {
          orderId: responseData.orderID || responseData.id,
        })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          orderId: responseData.orderID || responseData.id,
          data: responseData,
        }))
      } catch (error: any) {
        console.error('[VPS Trade] Error submitting order:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ 
          success: false, 
          error: error.message || 'Failed to submit order',
          errorCode: 'INTERNAL_ERROR',
        }))
      }
    })
    return
  }

  // API endpoints for user data (kept for backward compatibility)
  // Only check for address parameter on specific endpoints that require it
  // Exclude endpoints that are already handled above (like /api/trade/sign-order)
  const address = url.searchParams.get('address')
  const requiresAddress = path === '/api/balance' || path === '/api/positions' || path === '/api/orders' || path === '/api/history'
  
  if (requiresAddress && !address) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Missing address parameter' }))
    return
  }

  try {
    // These endpoints can be implemented here or delegated to another service
    if (path === '/api/balance' || path === '/api/positions' || path === '/api/orders' || path === '/api/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, data: [] }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Not found' }))
  } catch (error: any) {
    console.error(`Error handling ${path}:`, error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: error.message }))
  }
})

// Create WebSocket server
const wsServer = new WebSocketServer(httpServer, PORT)

// ⚠️⚠️⚠️ CRITICAL: ensureMarketMetadataForPair function - DO NOT MODIFY ⚠️⚠️⚠️
// This function ensures the current market is fetched from Polymarket's API
// It constructs slugs for the current time window and fetches market metadata
// Removing or modifying this will cause markets to not be found
// See: ws-service/MARKET_SELECTION_CRITICAL.md
const ensureMarketMetadataForPair = async (pair?: string, timeframe?: string): Promise<void> => {
  if (!pair || !timeframe) return
  const pairKey = pair.toUpperCase()
  const timeframeKey = timeframe.toLowerCase()
  const pairSlug = PAIR_SLUG_MAP[pairKey]
  const timeframeCfg = TIMEFRAME_CONFIG[timeframeKey]
  if (!pairSlug || !timeframeCfg) return

  const throttleKey = `${pairKey}-${timeframeKey}`
  const now = Date.now()
  // Reduce throttle to 10 seconds to allow more frequent fetching
  if (now - (LAST_SLUG_FETCH[throttleKey] || 0) < 10 * 1000) {
    return
  }
  LAST_SLUG_FETCH[throttleKey] = now
  console.log(`[Server] ensureMarketMetadataForPair called for ${pairKey} ${timeframeKey}`)

  const stateStore = wsServer.getStateStore()

  // For 15m markets: construct slug for the *current* 15m ET window and fetch by slug
  // Slug format (from Gamma / website): "{pairSlug}-updown-15m-{eventStartTimeUtcInSeconds}"
  // Example: "sol-updown-15m-1764351000" → eventStartTime "2025-11-28T17:30:00Z" (12:30PM ET)
  if (timeframeKey === '15m') {
    try {
      // Start of the current 15m window in ET, converted to UTC ms
      const actualWindowStart = getEventWindowStart(15)
      // Polymarket labels markets 24h ahead, so add 24h to the timestamp when generating the slug
      const windowStartMs = actualWindowStart + (24 * 60 * 60 * 1000)
      const eventStartSeconds = Math.floor(windowStartMs / 1000)
      const slug = generateSlug(pairKey, timeframeKey, eventStartSeconds)

      if (!slug) {
        console.error(`[Server] 15m slug generation failed for ${pairKey}`)
        return
      }

      console.log(
        `[Server] 15m slug lookup for ${pairKey}: ${slug} (actualWindowStartET=${new Date(actualWindowStart).toLocaleString(
          'en-US',
          { timeZone: 'America/New_York' }
        )}, slugTimestampET=${new Date(windowStartMs).toLocaleString('en-US', { timeZone: 'America/New_York' })})`
      )

      let marketMetadata = await fetchMarketBySlug(slug)
      if (!marketMetadata) {
        console.log(`[Server] 15m slug lookup returned no market for ${pairKey} slug ${slug}`)
        // Try without 24h offset as fallback
        const fallbackSlug = generateSlug(pairKey, timeframeKey, Math.floor(actualWindowStart / 1000))
        if (fallbackSlug && fallbackSlug !== slug) {
          console.log(`[Server] Trying fallback slug without 24h offset: ${fallbackSlug}`)
          marketMetadata = await fetchMarketBySlug(fallbackSlug)
          if (!marketMetadata) {
            console.log(`[Server] Fallback slug also returned no market`)
        return
          }
          console.log(`[Server] Found market with fallback slug, using it`)
        } else {
          return
        }
      }

      // Verify the market's eventStartTime - use API's eventStartTime as the source of truth
      // The API's eventStartTime should match the actual current window (not the slug timestamp)
      if (marketMetadata.eventStartTime) {
        const hoursDiff = (marketMetadata.eventStartTime - actualWindowStart) / (1000 * 60 * 60)
        console.log(`[Server] Market eventStartTime is ${hoursDiff.toFixed(1)}h from actual window start`)
        // If eventStartTime is 18-26 hours in the future, it's likely tomorrow's market, skip it
        if (hoursDiff > 18 && hoursDiff < 26) {
          console.log(`[Server] Market eventStartTime is ${hoursDiff.toFixed(1)}h in future - this is tomorrow's market, skipping`)
          return
        }
      }

      if (!marketMetadata.tokenIds || marketMetadata.tokenIds.length < 2) {
        console.log(
          `[Server] 15m slug lookup for ${pairKey} slug ${slug} returned insufficient tokenIds (len=${
            marketMetadata.tokenIds?.length ?? 0
          })`
        )
        return
      }

      // Check if we have an existing market entry for this slug/marketId
      const existing = stateStore.getAllMarkets().find(
        (m) => m.marketId === marketMetadata.marketId || m.metadata?.slug === slug
      )

      if (existing) {
        stateStore.setMarketMetadata(existing.marketId, marketMetadata)
        console.log(
          `[Server] Updated current 15m market ${marketMetadata.marketId} for ${pairKey} (slug: ${slug}, eventStartTime: ${
            marketMetadata.eventStartTime ? new Date(marketMetadata.eventStartTime).toISOString() : 'N/A'
          })`
        )
      } else {
        stateStore.setMarketMetadata(marketMetadata.marketId, marketMetadata)
        console.log(
          `[Server] Loaded current 15m market ${marketMetadata.marketId} for ${pairKey} (slug: ${slug}, eventStartTime: ${
            marketMetadata.eventStartTime ? new Date(marketMetadata.eventStartTime).toISOString() : 'N/A'
          })`
        )
      }

      const subscribeId = marketMetadata.yesTokenId || marketMetadata.tokenId || marketMetadata.marketId
      wsServer.getPolymarketConnector().subscribeToMarket(subscribeId)
      return
    } catch (error) {
      console.error(`[Server] Error fetching 15m market via slug for ${pairKey}:`, error)
      return
    }
  }

  // For 1h markets: Use slug-based lookup (original logic)
  const baseStart = getEventWindowStart(timeframeCfg.minutes)
  const intervalMs = timeframeCfg.minutes * 60 * 1000
  const candidateStarts = [
    baseStart,
    baseStart + intervalMs,
    baseStart + intervalMs * 2,
    baseStart + intervalMs * 3,
    baseStart - intervalMs,
    baseStart - intervalMs * 2,
  ]

  for (const startMs of candidateStarts) {
    if (startMs <= 0) continue
    
    // For 1h markets, try both "1h" and "hourly" slug formats
    const slugVariants = [
      generateSlug(pairKey, timeframeKey, Math.floor(startMs / 1000)),
      generateSlug(pairKey, 'hourly', Math.floor(startMs / 1000)),
    ].filter(Boolean) as string[]
    
    for (const slug of slugVariants) {
      if (!slug) continue

      // Skip if we already have metadata with eventStartTime for this slug
      const existingWithMetadata = stateStore.getAllMarkets().find((m) => m.metadata?.slug === slug && m.metadata?.eventStartTime)
      if (existingWithMetadata) continue

      const marketMetadata = await fetchMarketBySlug(slug)
      if (marketMetadata) {
        const alreadyEnded = marketMetadata.endTime && marketMetadata.endTime < Date.now() - intervalMs
        if (alreadyEnded) {
          continue
        }
        // Check if we have an existing market that matches (by slug, marketId, or question)
        const existingBySlug = stateStore.getAllMarkets().find((m) => m.metadata?.slug === slug)
        const existingById = stateStore.getAllMarkets().find((m) => m.marketId === marketMetadata.marketId)
        const existingByQuestion = stateStore.getAllMarkets().find((m) => 
          m.metadata?.question === marketMetadata.question || 
          (!m.metadata && m.marketId && marketMetadata.marketId && m.marketId === marketMetadata.marketId)
        )
        
        const existing = existingBySlug || existingById || existingByQuestion
        if (existing) {
          // Update existing market's metadata
          stateStore.setMarketMetadata(existing.marketId, marketMetadata)
          console.log(`[Server] Updated existing market ${existing.marketId} with metadata from slug ${slug}${marketMetadata.eventStartTime ? ` (eventStartTime: ${new Date(marketMetadata.eventStartTime).toISOString()})` : ' (NO eventStartTime)'}`)
        } else {
          // Create new market entry
          stateStore.setMarketMetadata(marketMetadata.marketId, marketMetadata)
          console.log(`[Server] Created new market ${marketMetadata.marketId} from slug ${slug}${marketMetadata.eventStartTime ? ` (eventStartTime: ${new Date(marketMetadata.eventStartTime).toISOString()})` : ' (NO eventStartTime)'}`)
        }
        const subscribeId = marketMetadata.yesTokenId || marketMetadata.tokenId || marketMetadata.marketId
        wsServer.getPolymarketConnector().subscribeToMarket(subscribeId)
        console.log(`[Server] Loaded market metadata via slug ${slug}${marketMetadata.eventStartTime ? ` (eventStartTime: ${new Date(marketMetadata.eventStartTime).toISOString()})` : ' (NO eventStartTime)'}`)
        if (marketMetadata.acceptingOrders !== false && marketMetadata.closed !== true) {
          break
        }
      }
    }
  }
}

// Poll orderbook data for tracked markets
function startOrderbookPolling(wsServer: WebSocketServer, markets: any[]): void {
  console.log('[Server] Starting orderbook polling for tracked markets...')
  
  const POLL_INTERVAL = 1000 // 1 second - poll every second for real-time feel
  let pollCount = 0
  let errorCount = 0
  
  // Pairs and timeframes we care about (8 markets total)
  const TRACKED_PAIRS = ['BTC', 'SOL', 'ETH', 'XRP']
  const TRACKED_TIMEFRAMES = ['15m', '1h']
  
  setInterval(async () => {
    const stateStore = wsServer.getStateStore()
    const allMarkets = stateStore.getAllMarkets()
    
    if (allMarkets.length === 0) return
    
    pollCount++
    let updatedCount = 0
    
    // Filter to markets that are active (not expired)
    const now = Date.now()
    const activeMarketsToPoll = allMarkets.filter(m => {
      const metadata = m.metadata
      if (!metadata) return false
      
      // Must have a token ID
      const primaryToken = metadata?.yesTokenId || metadata?.tokenId || metadata?.tokenIds?.[0]
      if (!primaryToken) return false
      
      // Market must not have ended
      const eventEnd = metadata.eventEndTime || metadata.endTime
      if (eventEnd && now > eventEnd + 60000) return false // Allow 1 min grace period
      
      // Must match one of our tracked pairs
      const question = (metadata.question || '').toUpperCase()
      const pairMap: Record<string, string[]> = {
        'BTC': ['BITCOIN', 'BTC'],
        'SOL': ['SOLANA', 'SOL'],
        'ETH': ['ETHEREUM', 'ETH'],
        'XRP': ['XRP', 'RIPPLE'],
      }
      const matchesPair = TRACKED_PAIRS.some(pair => {
        const variants = pairMap[pair] || [pair]
        return variants.some(variant => question.includes(variant))
      })
      if (!matchesPair) return false
      
      return true
    })
    
    // Also get all subscribed tokenIds from clients (in case they subscribed to markets not in our filter)
    const subscribedIds = wsServer.getAllSubscribedIds()
    
    // Log which markets we're polling (once every 30 seconds)
    if (pollCount % 30 === 1) {
      console.log(`[Server] Polling: ${activeMarketsToPoll.length} LIVE markets from ${allMarkets.length} total`)
      activeMarketsToPoll.forEach(m => {
        const meta = m.metadata
        console.log(`[Server]   - ${m.marketId}: ${meta?.question?.substring(0, 50)}... (${meta?.eventTimeframe || 'unknown'})`)
      })
    }
    
    // Poll ALL active tracked markets every interval (no rotation)
    const marketsToPoll = activeMarketsToPoll
    
    // Collect token IDs for batch fetch
    const tokenIds: string[] = []
    const marketMap = new Map<string, typeof marketsToPoll[0]>()
    const subscribedTokenIds = new Set<string>()
    
    // First, collect tokenIds from filtered markets (both UP and DOWN tokens)
    for (const marketState of marketsToPoll) {
      const metadata = marketState.metadata
      const upTokenId = metadata?.yesTokenId || metadata?.tokenId || metadata?.tokenIds?.[0]
      const downTokenId = metadata?.noTokenId || metadata?.tokenIds?.[1]
      
      // Add UP token
      if (upTokenId) {
        tokenIds.push(upTokenId)
        marketMap.set(upTokenId, marketState)
      }
      
      // Add DOWN token (if available)
      if (downTokenId) {
        tokenIds.push(downTokenId)
        marketMap.set(downTokenId, marketState)
      }
    }
    
    // Also add any subscribed tokenIds that aren't already in our list
    for (const subscribedId of Array.from(subscribedIds)) {
      // Check if this is a tokenId (long numeric string) or marketId
      // If it's not in our marketMap, try to fetch it directly
      if (!marketMap.has(subscribedId) && subscribedId.length > 20) {
        // Likely a tokenId - add it to polling
        tokenIds.push(subscribedId)
        subscribedTokenIds.add(subscribedId)
        console.log(`[Server] Adding subscribed tokenId to polling: ${subscribedId.substring(0, 20)}...`)
      }
    }
    
    if (tokenIds.length === 0) return
    
    try {
      // Use batch API for efficiency
      const orderbooks = await fetchMultipleOrderbooks(tokenIds)
      
      // Process results
      for (const [tokenId, orderbook] of Array.from(orderbooks.entries())) {
        if (!orderbook || orderbook.bids.length === 0 || orderbook.asks.length === 0) {
          continue
        }
        
        const marketState = marketMap.get(tokenId)
        const bestBid = parseFloat(orderbook.bids[0].price)
        const bestAsk = parseFloat(orderbook.asks[0].price)
        
        // Only update if values are valid
        if (!isNaN(bestBid) && !isNaN(bestAsk) && bestBid > 0 && bestAsk > 0) {
          // Convert orderbook data to number arrays for client
          const bidsArray = orderbook.bids.map((b: any) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
          }))
          const asksArray = orderbook.asks.map((a: any) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
          }))
          
          // If this is a subscribed tokenId without a marketState, use tokenId as marketId
          const marketId = marketState ? marketState.marketId : tokenId
          
          // Update state if we have marketState
          if (marketState) {
            stateStore.updateMarket({
              type: 'orderbook',
              marketId: marketState.marketId,
              bestBid,
              bestAsk,
            })
          }
          
          // Record price to database (optimized - groups by market event)
          if (marketState && marketState.metadata) {
            const meta = marketState.metadata
            const isYesToken = tokenId === meta.yesTokenId || tokenId === meta.tokenId
            
            // Debug log to trace what's being recorded
            const recordCount = ((recordMarketPrices as any).callCount || 0) + 1
            ;(recordMarketPrices as any).callCount = recordCount
            if (recordCount % 30 === 0) {
              console.log(`[Server] Recording: ${isYesToken ? 'UP' : 'DOWN'} token, bid=${(bestBid*100).toFixed(0)}c for market ${marketId.substring(0,20)}...`)
            }
            
            // Use recordMarketPrices for optimized storage
            // The priceRecorder will buffer and batch these into JSONB
            recordMarketPrices(
              marketId,
              meta.yesTokenId || meta.tokenId || tokenId,
              meta.noTokenId || '',
              isYesToken ? bestBid : 0,
              isYesToken ? bestAsk : 0,
              !isYesToken ? bestBid : 0,
              !isYesToken ? bestAsk : 0,
              meta.eventStartTime || meta.startTime,
              meta.eventEndTime || meta.endTime
            )
          }
          
          // Only broadcast if there are subscribers for this tokenId/marketId
          const hasSubscribers = wsServer.hasSubscribers(marketId) || wsServer.hasSubscribers(tokenId)
          if (!hasSubscribers) {
            continue // Skip broadcasting if no one is subscribed
          }
          
          // Broadcast full orderbook update to clients (by marketId and tokenId)
          const firstBidPrice = bidsArray[0]?.price || 0
          const firstAskPrice = asksArray[0]?.price || 0
          const marketInfo = marketState ? `${marketState.metadata?.question || marketId}` : `tokenId: ${tokenId.substring(0, 20)}...`
          console.log(`[Server] Broadcasting orderbook_update for ${marketInfo}, marketId: ${marketId}, tokenId: ${tokenId.substring(0, 20)}..., bids: ${bidsArray.length}, asks: ${asksArray.length}, bestBid: ${firstBidPrice} (${(firstBidPrice*100).toFixed(0)}c), bestAsk: ${firstAskPrice} (${(firstAskPrice*100).toFixed(0)}c)`)
          wsServer.broadcastOrderbookUpdate(marketId, tokenId, bidsArray, asksArray)
          
          // Also emit for Polymarket connector (for other listeners)
          if (marketState) {
            wsServer.getPolymarketConnector().emit('marketUpdate', {
              type: 'orderbook',
              marketId: marketState.marketId,
              bestBid,
              bestAsk,
            })
          }
          
          updatedCount++
        }
      }
      
      // Fallback: if batch didn't work, try individual fetches for first few
      if (updatedCount === 0 && pollCount <= 2) {
        for (const marketState of marketsToPoll.slice(0, 3)) {
          const metadata = marketState.metadata
          const primaryTokenId = metadata?.yesTokenId || metadata?.tokenId || metadata?.tokenIds?.[0]
          if (!metadata || !primaryTokenId) continue
          
          try {
            const orderbook = await fetchOrderbook(primaryTokenId)
            if (orderbook && orderbook.bids && orderbook.bids.length > 0 && orderbook.asks && orderbook.asks.length > 0) {
              const bestBid = parseFloat(orderbook.bids[0].price)
              const bestAsk = parseFloat(orderbook.asks[0].price)
              
              if (!isNaN(bestBid) && !isNaN(bestAsk) && bestBid > 0 && bestAsk > 0) {
                stateStore.updateMarket({
                  type: 'orderbook',
                  marketId: marketState.marketId,
                  bestBid,
                  bestAsk,
                })
                
                wsServer.getPolymarketConnector().emit('marketUpdate', {
                  type: 'orderbook',
                  marketId: marketState.marketId,
                  bestBid,
                  bestAsk,
                })
                
                updatedCount++
              }
            }
          } catch (error) {
            // Silent fail
          }
        }
      }
    } catch (error: any) {
      errorCount++
      // Log first few errors
      if (pollCount <= 3) {
        console.warn(`[Server] Error in batch orderbook fetch:`, error.message || String(error).substring(0, 100))
      }
    }
    
    // Log every 10 polls (10 seconds) or when we get updates
    if (pollCount % 10 === 0 || updatedCount > 0) {
      const activeCount = activeMarketsToPoll.length
      console.log(`[Server] Polling: Updated ${updatedCount}/${marketsToPoll.length} markets. Active tracked: ${activeCount}. Errors: ${errorCount}`)
    }
  }, POLL_INTERVAL)
  
  console.log(`[Server] Polling orderbook every ${POLL_INTERVAL}ms (all ${TRACKED_PAIRS.length * TRACKED_TIMEFRAMES.length} tracked markets per cycle, batch API)`)
}

// Initialize markets on startup
async function initializeMarkets() {
  console.log('[Server] Fetching initial markets list...')
  try {
    const markets = await fetchMarketsList()
    const stateStore = wsServer.getStateStore()
    
    if (markets.length === 0) {
      console.warn('[Server] No markets fetched - API may be unavailable. Server will continue running.')
      console.warn('[Server] Markets can be added dynamically when clients subscribe.')
      return
    }
    
    // Filter to only active markets (not expired)
    const now = Date.now()
    const activeMarkets = markets.filter(m => {
      // Market is active if it hasn't ended yet, or if endTime is not set
      return !m.endTime || m.endTime > now
    })
    
    console.log(`[Server] Found ${markets.length} total markets, ${activeMarkets.length} are currently active`)
    
    for (const market of activeMarkets) {
      stateStore.setMarketMetadata(market.marketId, market)
      // Subscribe to updates - use token ID for RTDS if available
      const subscribeId = market.yesTokenId || market.tokenId || market.marketId
      wsServer.getPolymarketConnector().subscribeToMarket(subscribeId)
    }
    
    console.log(`[Server] Initialized ${activeMarkets.length} active markets`)
    
    // Start polling for orderbook data (fallback/primary method) - only poll active markets
    startOrderbookPolling(wsServer, activeMarkets)
  } catch (error) {
    console.error('[Server] Error initializing markets:', error)
    console.warn('[Server] Server will continue running - markets can be added dynamically')
  }
}

// Automatically refresh markets for all pairs/timeframes periodically
function startAutomaticMarketRefresh() {
  console.log('[Server] Starting automatic market refresh...')
  
  const pairs = ['BTC', 'SOL', 'ETH', 'XRP']
  const timeframes = ['15m', '1h']
  
  // Refresh 15m markets every 1 minute (so new markets are discovered quickly)
  setInterval(async () => {
    console.log('[Server] Auto-refreshing 15m markets...')
    for (const pair of pairs) {
      try {
        await ensureMarketMetadataForPair(pair, '15m')
      } catch (error) {
        console.error(`[Server] Error auto-refreshing ${pair} 15m:`, error)
      }
    }
  }, 60 * 1000) // 1 minute
  
  // Refresh 1h markets every 15 minutes (more frequent to catch new markets quickly)
  setInterval(async () => {
    console.log('[Server] Auto-refreshing 1h markets...')
    for (const pair of pairs) {
      try {
        await ensureMarketMetadataForPair(pair, '1h')
      } catch (error) {
        console.error(`[Server] Error auto-refreshing ${pair} 1h:`, error)
      }
    }
  }, 15 * 60 * 1000) // 15 minutes (was 1 hour - changed to discover new markets faster)
  
  // Also do an initial refresh after 1 minute (to catch any markets that appeared after startup)
  setTimeout(async () => {
    console.log('[Server] Running initial market refresh...')
    for (const pair of pairs) {
      for (const timeframe of timeframes) {
        try {
          await ensureMarketMetadataForPair(pair, timeframe)
        } catch (error) {
          console.error(`[Server] Error in initial refresh ${pair} ${timeframe}:`, error)
        }
      }
    }
  }, 60 * 1000) // 1 minute after startup
}

// Initialize database recorders (price, strategy, trading keys, backtester, and indicator cache)
// Initialize indicator cache after PriceRecorder is ready
const initializeIndicatorCacheAfterPriceRecorder = async () => {
  // Try to get pool from PriceRecorder (it might already be initialized)
  const { getPriceRecorderPool } = await import('./db/priceRecorder')
  let pool = getPriceRecorderPool()
  
  // If not initialized yet, wait for it
  if (!pool) {
    console.log('[IndicatorCache] Waiting for PriceRecorder to initialize...')
    pool = await initializePriceRecorder()
  }
  
  console.log('[IndicatorCache] PriceRecorder pool available:', pool ? 'YES' : 'NO')
  if (pool) {
    try {
      console.log('[IndicatorCache] Initializing indicator cache with database pool...')
      await initializeIndicatorCache(pool)
      console.log('[IndicatorCache] ✅ Indicator cache initialized successfully')
      
      // Initialize custodial wallet access
      await initializeCustodialWallet(pool)
      console.log('[CustodialWallet] ✅ Custodial wallet access initialized')
      
      // Start background job to pre-calculate indicators every 15 minutes
      const preCalculateAllIndicators = async () => {
        try {
          console.log('[IndicatorCache] Starting pre-calculation job...')
          const assets = ['BTC', 'ETH', 'SOL', 'XRP']
          const timeframes = ['15m', '1h']
          
          for (const asset of assets) {
            for (const timeframe of timeframes) {
              try {
                console.log(`[IndicatorCache] Pre-calculating ${asset} ${timeframe}...`)
                await preCalculateIndicators(asset, timeframe, 200)
                console.log(`[IndicatorCache] ✅ Completed ${asset} ${timeframe}`)
              } catch (error: any) {
                console.error(`[IndicatorCache] Error pre-calculating ${asset} ${timeframe}:`, error.message)
              }
            }
          }
          
          // Cleanup old indicators
          await cleanupOldIndicators()
          console.log('[IndicatorCache] ✅ Pre-calculation job completed')
        } catch (error: any) {
          console.error('[IndicatorCache] Pre-calculation job error:', error.message)
          console.error('[IndicatorCache] Stack:', error.stack)
        }
      }
      
      // Run immediately on startup (after a short delay to ensure DB is ready)
      console.log('[IndicatorCache] Scheduling initial pre-calculation job in 5 seconds...')
      setTimeout(preCalculateAllIndicators, 5000)
      
      // Then run every 15 minutes as a backup/fallback
      // Note: Indicators are also recalculated immediately when candles close (see candleClosed event listener)
      console.log('[IndicatorCache] Scheduling periodic pre-calculation job (every 15 minutes) as backup...')
      setInterval(preCalculateAllIndicators, 15 * 60 * 1000)
    } catch (error: any) {
      console.error('[IndicatorCache] Initialization error:', error.message)
      console.error('[IndicatorCache] Stack:', error.stack)
    }
  } else {
    console.error('[IndicatorCache] No database pool available from PriceRecorder')
  }
}

// Start initialization after a short delay to ensure PriceRecorder is ready
setTimeout(initializeIndicatorCacheAfterPriceRecorder, 2000)
initializeStrategyRecorder()
initializeTradingKeyRecorder()
initializeBacktester()

// Start crypto price feeder (BTC, ETH, SOL, XRP from Polymarket RTDS)
const cryptoPriceFeeder = getCryptoPriceFeeder()
cryptoPriceFeeder.start()
cryptoPriceFeeder.on('price', (data) => {
  // Log price updates periodically (every 30 seconds per symbol)
  const logKey = `price_log_${data.symbol}`
  const now = Date.now()
  const lastLog = (cryptoPriceFeeder as any)[logKey] || 0
  if (now - lastLog > 30000) {
    console.log(`[CryptoPrices] ${data.symbol.toUpperCase()}: $${data.price.toFixed(2)}`)
    ;(cryptoPriceFeeder as any)[logKey] = now
  }
})
cryptoPriceFeeder.on('candleClosed', async (candle) => {
  console.log(`[CryptoPrices] ${candle.symbol} ${candle.timeframe} candle closed: O=${candle.open.toFixed(2)} C=${candle.close.toFixed(2)}`)
  
  // Recalculate indicators immediately when 15m or 1h candles close
  if (candle.timeframe === '15m' || candle.timeframe === '1h') {
    try {
      // Map symbol to asset name
      const symbolToAsset: Record<string, string> = {
        'btcusdt': 'BTC',
        'ethusdt': 'ETH',
        'solusdt': 'SOL',
        'xrpusdt': 'XRP',
      }
      
      const asset = symbolToAsset[candle.symbol]
      if (asset) {
        // Check if indicator cache is initialized
        const { isIndicatorCacheInitialized } = await import('./db/indicatorCache')
        if (!isIndicatorCacheInitialized()) {
          console.log(`[IndicatorCache] Cache not yet initialized, skipping recalculation for ${asset} ${candle.timeframe}`)
          return
        }
        console.log(`[IndicatorCache] 🔄 Candle closed - recalculating indicators for ${asset} ${candle.timeframe}...`)
        
        // Import indicator cache functions
        const { preCalculateIndicators } = await import('./db/indicatorCache')
        
        // Recalculate indicators for this specific asset/timeframe
        await preCalculateIndicators(asset, candle.timeframe, 200)
        console.log(`[IndicatorCache] ✅ Indicators updated for ${asset} ${candle.timeframe} after candle close`)
      }
    } catch (error: any) {
      console.error(`[IndicatorCache] Error recalculating indicators after candle close:`, error.message)
    }
  }
})

// Start strategy monitor (checks active strategies every minute)
const strategyMonitor = getStrategyMonitor()
strategyMonitor.start()
strategyMonitor.on('strategyTriggered', async (trigger: StrategyTrigger) => {
  console.log(`[StrategyMonitor] 🎯 TRIGGERED: "${trigger.strategyName}" for ${trigger.asset}`)
  console.log(`[StrategyMonitor]   User: ${trigger.userAddress}`)
  console.log(`[StrategyMonitor]   Conditions: ${trigger.triggeredConditions.map((c: { description: string }) => c.description).join(', ')}`)
  
  // Execute the trade automatically
  try {
    // Check if user can trade (has key configured)
    const canTrade = await canExecuteTrades(trigger.userAddress)
    if (!canTrade.canTrade) {
      console.log(`[StrategyMonitor] ⚠️ Cannot execute trade: ${canTrade.reason}`)
      return
    }

    // Get full strategy details for trade parameters
    const strategy = await getStrategy(trigger.strategyId)
    if (!strategy) {
      console.log(`[StrategyMonitor] ⚠️ Strategy not found: ${trigger.strategyId}`)
      return
    }

    // Determine trade direction from strategy
    const side = strategy.direction === 'UP' ? 'BUY' : 'SELL'
    
    // Calculate order size based on strategy settings
    let orderSize = 10 // Default 10 shares
    if (strategy.orderSizeMode === 'fixed_shares' && strategy.fixedSharesAmount) {
      orderSize = strategy.fixedSharesAmount
    } else if (strategy.orderSizeMode === 'fixed_dollar' && strategy.fixedDollarAmount) {
      // Approximate shares from dollar amount (assuming ~$0.50 per share avg)
      orderSize = Math.floor(strategy.fixedDollarAmount * 2)
    }

    // Get tokenId from strategy's market - try to resolve from state store or fetch
    let tokenId: string | null = null
    let currentPrice = 0.50 // Default price for market orders
    
    if (strategy.market) {
      // First check state store for cached market data
      const stateStore = wsServer.getStateStore()
      const allMarkets = stateStore.getAllMarkets()
      
      // Try to find by marketId, slug, or partial match
      const strategyMarket = strategy.market || ''
      const marketData = allMarkets.find(m => 
        m.marketId === strategyMarket ||
        m.metadata?.slug === strategyMarket ||
        (strategyMarket && m.metadata?.question?.toLowerCase().includes(strategyMarket.toLowerCase()))
      )
      
      if (marketData?.metadata) {
        // Get the appropriate tokenId based on direction
        if (strategy.direction === 'UP') {
          tokenId = marketData.metadata.yesTokenId || marketData.metadata.tokenId || marketData.metadata.tokenIds?.[0] || null
        } else {
          tokenId = marketData.metadata.noTokenId || marketData.metadata.tokenIds?.[1] || null
        }
        
        // Get current best price from market state
        if (side === 'BUY' && marketData.bestAsk) {
          currentPrice = marketData.bestAsk
        } else if (side === 'SELL' && marketData.bestBid) {
          currentPrice = marketData.bestBid
        }
      }
      
      // If not in state store, try to fetch by slug
      if (!tokenId && strategy.market) {
        try {
          const marketMetadata = await fetchMarketBySlug(strategy.market)
          if (marketMetadata) {
            if (strategy.direction === 'UP') {
              tokenId = marketMetadata.yesTokenId || marketMetadata.tokenId || marketMetadata.tokenIds?.[0] || null
            } else {
              tokenId = marketMetadata.noTokenId || marketMetadata.tokenIds?.[1] || null
            }
          }
        } catch (err) {
          console.error(`[StrategyMonitor] Failed to fetch market metadata:`, err)
        }
      }
    }
    
    if (!tokenId) {
      console.log(`[StrategyMonitor] ⚠️ Could not resolve tokenId for market: ${strategy.market}`)
      return
    }

    console.log(`[StrategyMonitor] 📈 Executing trade:`)
    console.log(`[StrategyMonitor]   Side: ${side}`)
    console.log(`[StrategyMonitor]   Size: ${orderSize} shares`)
    console.log(`[StrategyMonitor]   Market: ${strategy.market}`)
    console.log(`[StrategyMonitor]   TokenId: ${tokenId}`)
    console.log(`[StrategyMonitor]   Price: ${currentPrice}`)
    console.log(`[StrategyMonitor]   Order Type: ${strategy.orderType || 'market'}`)

    // Execute the trade using stored encrypted key (fully automated, no user interaction)
    const result = await executeTrade({
      strategyId: trigger.strategyId,
      userAddress: trigger.userAddress,
      tokenId: tokenId,
      side: side as 'BUY' | 'SELL',
      size: orderSize,
      price: currentPrice,
      orderType: (strategy.orderType as 'market' | 'limit') || 'market',
    })

    if (result.success) {
      console.log(`[StrategyMonitor] ✅ Trade executed successfully! OrderId: ${result.orderId}`)
    } else {
      console.log(`[StrategyMonitor] ❌ Trade failed: ${result.error}`)
    }
  } catch (error: any) {
    console.error(`[StrategyMonitor] ❌ Trade execution error:`, error.message)
  }
})

// Start server
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP server listening on http://0.0.0.0:${HTTP_PORT}`)
  console.log(`[Server] WebSocket server listening on ws://0.0.0.0:${HTTP_PORT}/ws`)
  console.log(`[Server] Health endpoint: http://0.0.0.0:${HTTP_PORT}/health`)
  console.log('\n[Server] Initializing markets...')
  
  initializeMarkets()
  
  // Start automatic market refresh (15m markets every 15min, 1h markets every hour)
  startAutomaticMarketRefresh()
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...')
  strategyMonitor.stop()
  httpServer.close(async () => {
    console.log('[Server] HTTP server closed')
    await closePriceRecorder()
    await closeStrategyRecorder()
    await closeCandleRecorder()
    await closeTradingKeyRecorder()
    await closeBacktester()
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down gracefully...')
  strategyMonitor.stop()
  httpServer.close(async () => {
    console.log('[Server] HTTP server closed')
    await closePriceRecorder()
    await closeStrategyRecorder()
    await closeCandleRecorder()
    await closeTradingKeyRecorder()
    await closeBacktester()
    process.exit(0)
  })
})

