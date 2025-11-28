/**
 * Polymarket WebSocket subscriptions
 * Connects to Polymarket RTDS and CLOB WebSocket endpoints
 */

import { EventEmitter } from 'events'
import WebSocket from 'ws'

const POLYMARKET_CLOB_WS = process.env.POLYMARKET_CLOB_WS || 'wss://ws-subscriptions-clob.polymarket.com/ws/'
const POLYMARKET_RTDS_WS = process.env.POLYMARKET_RTDS_WS || 'wss://ws-live-data.polymarket.com'

export type MarketUpdate =
  | { type: 'orderbook'; marketId: string; bestBid: number; bestAsk: number }
  | { type: 'trade'; marketId: string; price: number; size: number; side: 'buy' | 'sell' }
  | { type: 'marketStatus'; marketId: string; status: 'open' | 'closed' }

export class PolymarketConnector extends EventEmitter {
  private rtdsWs: WebSocket | null = null
  private clobWs: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private isConnected = false
  private subscribedMarkets = new Set<string>()

  constructor() {
    super()
    // Add default error listener to prevent unhandled error crashes
    this.on('error', (error) => {
      // Error is already logged, just prevent crash
      console.warn('[PolymarketConnector] Error event (handled):', error)
    })
  }

  start(): void {
    this.connectToRTDS()
    this.connectToCLOB()
  }

  private connectToRTDS(): void {
    try {
      this.rtdsWs = new WebSocket(POLYMARKET_RTDS_WS)

      this.rtdsWs.on('open', () => {
        console.log('[PolymarketConnector] Connected to RTDS')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
        this.emit('connected', { type: 'rtds' })
      })

      this.rtdsWs.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString())
          // Log first few messages to understand format
          if (this.subscribedMarkets.size > 0) {
            console.log('[PolymarketConnector] RTDS message:', JSON.stringify(message).substring(0, 200))
          }
          this.handleRTDSMessage(message)
        } catch (error) {
          console.error('[PolymarketConnector] Error parsing RTDS message:', error)
        }
      })

      this.rtdsWs.on('error', (error: unknown) => {
        console.error('[PolymarketConnector] RTDS error:', error)
        this.isConnected = false
        // Don't emit error event - just log it to prevent crashes
        // The close handler will handle reconnection
      })

      this.rtdsWs.on('close', () => {
        console.log('[PolymarketConnector] RTDS disconnected, reconnecting...')
        this.isConnected = false
        this.emit('disconnected', { type: 'rtds' })
        this.scheduleReconnect('rtds')
      })
    } catch (error) {
      console.error('[PolymarketConnector] Failed to connect to RTDS:', error)
      this.scheduleReconnect('rtds')
    }
  }

  private connectToCLOB(): void {
    try {
      this.clobWs = new WebSocket(POLYMARKET_CLOB_WS)

      this.clobWs.on('open', () => {
        console.log('[PolymarketConnector] Connected to CLOB')
        this.emit('connected', { type: 'clob' })
      })

      this.clobWs.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleCLOBMessage(message)
        } catch (error) {
          console.error('[PolymarketConnector] Error parsing CLOB message:', error)
        }
      })

      this.clobWs.on('error', (error: unknown) => {
        // Log error but don't emit to prevent crashes
        // CLOB connection is optional - RTDS is the primary source
        console.warn('[PolymarketConnector] CLOB connection error (non-fatal):', error)
        // Don't emit error event - just log it
      })

      this.clobWs.on('close', (code?: number, reason?: Buffer) => {
        // Only reconnect if it wasn't a 404 or similar error
        if (code && code !== 1006 && code !== 404) {
          console.log('[PolymarketConnector] CLOB disconnected, will not reconnect (optional connection)')
        } else {
          console.log('[PolymarketConnector] CLOB endpoint not available, using RTDS only')
        }
        // Don't reconnect CLOB - it's optional
        this.clobWs = null
      })
    } catch (error) {
      console.warn('[PolymarketConnector] Failed to connect to CLOB (non-fatal):', error)
      // Don't reconnect - CLOB is optional
      this.clobWs = null
    }
  }

  private scheduleReconnect(type: 'rtds' | 'clob'): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[PolymarketConnector] Max reconnect attempts reached for ${type}`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000)
    
    setTimeout(() => {
      if (type === 'rtds') {
        this.connectToRTDS()
      } else {
        this.connectToCLOB()
      }
    }, delay)
  }

  private handleRTDSMessage(message: any): void {
    // Handle real-time data service messages
    // RTDS can send various formats - try to extract market data
    let marketId: string | null = null
    let bestBid: number | null = null
    let bestAsk: number | null = null
    let price: number | null = null
    let size: number | null = null
    let side: 'buy' | 'sell' | null = null

    // Try different message formats
    if (message.market_id) marketId = message.market_id
    if (message.marketId) marketId = message.marketId
    if (message.token_id) marketId = message.token_id
    if (message.tokenId) marketId = message.tokenId
    
    if (message.best_bid !== undefined) bestBid = parseFloat(message.best_bid)
    if (message.bestBid !== undefined) bestBid = parseFloat(message.bestBid)
    if (message.bid !== undefined) bestBid = parseFloat(message.bid)
    
    if (message.best_ask !== undefined) bestAsk = parseFloat(message.best_ask)
    if (message.bestAsk !== undefined) bestAsk = parseFloat(message.bestAsk)
    if (message.ask !== undefined) bestAsk = parseFloat(message.ask)
    
    if (message.price !== undefined) price = parseFloat(message.price)
    if (message.size !== undefined) size = parseFloat(message.size)
    if (message.side) side = message.side as 'buy' | 'sell'

    // Emit orderbook update if we have bid/ask
    if (marketId && (bestBid !== null || bestAsk !== null)) {
      const update: MarketUpdate = {
        type: 'orderbook',
        marketId,
        bestBid: bestBid || 0,
        bestAsk: bestAsk || 0,
      }
      this.emit('marketUpdate', update)
    }

    // Emit trade update if we have price/size
    if (marketId && price !== null && size !== null) {
      const update: MarketUpdate = {
        type: 'trade',
        marketId,
        price,
        size,
        side: side || 'buy',
      }
      this.emit('marketUpdate', update)
    }
  }

  private handleCLOBMessage(message: any): void {
    // Handle CLOB orderbook updates
    if (message.type === 'orderbook' || message.orderbook) {
      const marketId = message.market_id || message.marketId
      if (marketId) {
        const orderbook = message.orderbook || message
        const bids = orderbook.bids || []
        const asks = orderbook.asks || []
        
        if (bids.length > 0 && asks.length > 0) {
          const update: MarketUpdate = {
            type: 'orderbook',
            marketId,
            bestBid: parseFloat(bids[0].price || 0),
            bestAsk: parseFloat(asks[0].price || 0),
          }
          this.emit('marketUpdate', update)
        }
      }
    }
  }

  subscribeToMarket(marketId: string): void {
    if (this.subscribedMarkets.has(marketId)) {
      return
    }

    this.subscribedMarkets.add(marketId)

    // Subscribe via WebSocket if connected
    if (this.rtdsWs?.readyState === WebSocket.OPEN) {
      this.rtdsWs.send(JSON.stringify({
        type: 'subscribe',
        market_id: marketId,
      }))
    }

    if (this.clobWs?.readyState === WebSocket.OPEN) {
      this.clobWs.send(JSON.stringify({
        type: 'subscribe',
        market_id: marketId,
      }))
    }
  }

  unsubscribeFromMarket(marketId: string): void {
    this.subscribedMarkets.delete(marketId)

    if (this.rtdsWs?.readyState === WebSocket.OPEN) {
      this.rtdsWs.send(JSON.stringify({
        type: 'unsubscribe',
        market_id: marketId,
      }))
    }

    if (this.clobWs?.readyState === WebSocket.OPEN) {
      this.clobWs.send(JSON.stringify({
        type: 'unsubscribe',
        market_id: marketId,
      }))
    }
  }

  getConnectionStatus(): { rtds: boolean; clob: boolean } {
    return {
      rtds: this.rtdsWs?.readyState === WebSocket.OPEN,
      clob: this.clobWs?.readyState === WebSocket.OPEN,
    }
  }

  stop(): void {
    if (this.rtdsWs) {
      this.rtdsWs.close()
      this.rtdsWs = null
    }
    if (this.clobWs) {
      this.clobWs.close()
      this.clobWs = null
    }
    this.isConnected = false
  }
}

