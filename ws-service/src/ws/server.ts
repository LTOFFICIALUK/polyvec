/**
 * WebSocket server
 * Handles client connections and broadcasts market updates
 */

import WebSocket from 'ws'
import { Server as HTTPServer } from 'http'
import {
  ClientMessage,
  SubscribeMarketsMessage,
  UnsubscribeMarketsMessage,
  PingMessage,
  MarketSnapshotMessage,
  OrderbookUpdateMessage,
  TradeMessage,
  HeartbeatMessage,
  PongMessage,
} from './messageTypes'
import { MarketsStateStore } from '../state/marketsState'
import { OrderbookCache } from '../state/orderbookCache'
import { PolymarketConnector, MarketUpdate } from '../polymarket/subscriptions'
import { fetchOrderbook } from '../polymarket/clobClient'

export class WebSocketServer {
  private wss: WebSocket.Server
  private httpServer: HTTPServer
  private stateStore: MarketsStateStore
  private orderbookCache: OrderbookCache
  private polymarketConnector: PolymarketConnector
  private clientSubscriptions = new Map<WebSocket, Set<string>>()
  private updateThrottle = new Map<string, number>()
  private readonly MAX_UPDATES_PER_SECOND = 10
  private readonly THROTTLE_WINDOW = 1000

  constructor(httpServer: HTTPServer, port: number) {
    this.httpServer = httpServer
    this.wss = new WebSocket.Server({ server: httpServer, path: '/ws' })
    this.stateStore = new MarketsStateStore()
    this.orderbookCache = new OrderbookCache()
    this.polymarketConnector = new PolymarketConnector()

    this.setupPolymarketConnector()
    this.setupWebSocketHandlers()
    this.startHeartbeat()
    this.startCleanup()
  }

  private setupPolymarketConnector(): void {
    // Listen to market updates from Polymarket
    this.polymarketConnector.on('marketUpdate', (update: MarketUpdate) => {
      // Update state store
      this.stateStore.updateMarket(update)

      // Broadcast to subscribed clients (with throttling)
      this.broadcastMarketUpdate(update)
    })

    // Start connector
    this.polymarketConnector.start()
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocketServer] Client connected')
      this.clientSubscriptions.set(ws, new Set())

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString())
          this.handleClientMessage(ws, message)
        } catch (error) {
          console.error('[WebSocketServer] Error parsing client message:', error)
          ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }))
        }
      })

      ws.on('close', () => {
        console.log('[WebSocketServer] Client disconnected')
        this.clientSubscriptions.delete(ws)
      })

      ws.on('error', (error: unknown) => {
        console.error('[WebSocketServer] Client error:', error)
      })
    })
  }

  private handleClientMessage(ws: WebSocket, message: ClientMessage): void {
    console.log('[WebSocketServer] Received client message:', message)
    switch (message.type) {
      case 'subscribe_markets':
        // Handle async subscription
        this.handleSubscribeMarkets(ws, message as SubscribeMarketsMessage).catch((error) => {
          console.error('[WebSocketServer] Error handling subscribe_markets:', error)
          ws.send(JSON.stringify({ type: 'error', error: 'Failed to subscribe to markets' }))
        })
        break
      case 'unsubscribe_markets':
        this.handleUnsubscribeMarkets(ws, message as UnsubscribeMarketsMessage)
        break
      case 'ping':
        this.handlePing(ws, message as PingMessage)
        break
      default:
        ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }))
    }
  }

  private async handleSubscribeMarkets(ws: WebSocket, message: SubscribeMarketsMessage): Promise<void> {
    const subscriptions = this.clientSubscriptions.get(ws)!
    
    for (const marketIdOrTokenId of message.markets) {
      subscriptions.add(marketIdOrTokenId)
      
      // Subscribe to Polymarket updates
      this.polymarketConnector.subscribeToMarket(marketIdOrTokenId)
      
      // Check if we have state for this market
      let state = this.stateStore.getMarketState(marketIdOrTokenId)
      
      // If no state exists, try to fetch orderbook data
      let fullOrderbook: { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> } | null = null
      if (!state) {
        try {
          // Try fetching orderbook - marketIdOrTokenId could be a token ID
          fullOrderbook = await fetchOrderbook(marketIdOrTokenId)
          if (fullOrderbook && fullOrderbook.bids.length > 0 && fullOrderbook.asks.length > 0) {
            // Create initial state from orderbook
            const bestBid = parseFloat(fullOrderbook.bids[0].price)
            const bestAsk = parseFloat(fullOrderbook.asks[0].price)
            
            // Update state store
            this.stateStore.updateMarket({
              type: 'orderbook',
              marketId: marketIdOrTokenId,
              bestBid,
              bestAsk,
            })
            
            state = this.stateStore.getMarketState(marketIdOrTokenId)
          }
        } catch (error) {
          console.warn(`[WebSocketServer] Could not fetch orderbook for ${marketIdOrTokenId}:`, error)
        }
      }
      
      // Send full orderbook update if we have it, otherwise send snapshot
      if (fullOrderbook && fullOrderbook.bids.length > 0 && fullOrderbook.asks.length > 0) {
        // Send full orderbook_update with complete data
        const bidsArray = fullOrderbook.bids.map((b: any) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        }))
        const asksArray = fullOrderbook.asks.map((a: any) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        }))
        
        const orderbookUpdate: OrderbookUpdateMessage = {
          type: 'orderbook_update',
          marketId: marketIdOrTokenId,
          bids: bidsArray,
          asks: asksArray,
          ts: Date.now(),
        }
        ws.send(JSON.stringify(orderbookUpdate))
      } else {
        // Fallback to snapshot if we don't have full orderbook
        const snapshot: MarketSnapshotMessage = {
          type: 'market_snapshot',
          marketId: marketIdOrTokenId,
          bestBid: state?.bestBid || null,
          bestAsk: state?.bestAsk || null,
          lastPrice: state?.lastPrice || null,
          ts: state?.lastUpdateTs || Date.now(),
        }
        ws.send(JSON.stringify(snapshot))
      }
    }
  }

  private handleUnsubscribeMarkets(ws: WebSocket, message: UnsubscribeMarketsMessage): void {
    const subscriptions = this.clientSubscriptions.get(ws)!
    
    for (const marketId of message.markets) {
      subscriptions.delete(marketId)
      
      // Check if any other client is subscribed
      let hasOtherSubscribers = false
      for (const [client, subs] of this.clientSubscriptions.entries()) {
        if (client !== ws && subs.has(marketId)) {
          hasOtherSubscribers = true
          break
        }
      }
      
      // Unsubscribe from Polymarket if no other clients need it
      if (!hasOtherSubscribers) {
        this.polymarketConnector.unsubscribeFromMarket(marketId)
      }
    }
  }

  private handlePing(ws: WebSocket, message: PingMessage): void {
    const pong: PongMessage = { type: 'pong' }
    ws.send(JSON.stringify(pong))
  }

  hasSubscribers(marketIdOrTokenId: string): boolean {
    for (const subscriptions of this.clientSubscriptions.values()) {
      if (subscriptions.has(marketIdOrTokenId)) {
        return true
      }
    }
    return false
  }

  broadcastOrderbookUpdate(marketId: string, tokenId: string, bids: Array<{ price: number; size: number }>, asks: Array<{ price: number; size: number }>): void {
    // Throttle updates per market (use tokenId as key since that's what clients subscribe with)
    const throttleKey = tokenId || marketId
    const now = Date.now()
    const lastUpdate = this.updateThrottle.get(throttleKey) || 0
    const timeSinceLastUpdate = now - lastUpdate
    const minInterval = this.THROTTLE_WINDOW / this.MAX_UPDATES_PER_SECOND

    if (timeSinceLastUpdate < minInterval) {
      console.log(`[WebSocketServer] Throttled orderbook update for ${throttleKey} (${timeSinceLastUpdate}ms < ${minInterval}ms)`)
      return // Skip this update (throttled)
    }

    this.updateThrottle.set(throttleKey, now)

    let sentCount = 0
    // Find all clients subscribed to this market (by marketId or tokenId)
    for (const [client, subscriptions] of this.clientSubscriptions.entries()) {
      const isSubscribed = subscriptions.has(marketId) || subscriptions.has(tokenId)
      if (client.readyState === WebSocket.OPEN && isSubscribed) {
        try {
          // Send with the ID the client subscribed with (tokenId or marketId)
          const subscribedId = subscriptions.has(tokenId) ? tokenId : marketId
          const orderbookUpdate: OrderbookUpdateMessage = {
            type: 'orderbook_update',
            marketId: subscribedId, // Use the ID the client subscribed with
            bids: bids,
            asks: asks,
            ts: Date.now(),
          }
          const firstBidPrice = bids[0]?.price || 0
          const firstAskPrice = asks[0]?.price || 0
          console.log(`[WebSocketServer] Sent orderbook_update to client (subscribedId: ${subscribedId.substring(0, 20)}..., bids: ${bids.length}, asks: ${asks.length}, bestBid: ${firstBidPrice} (${(firstBidPrice*100).toFixed(0)}c), bestAsk: ${firstAskPrice} (${(firstAskPrice*100).toFixed(0)}c))`)
          client.send(JSON.stringify(orderbookUpdate))
          sentCount++
        } catch (error) {
          console.error('[WebSocketServer] Error sending orderbook update to client:', error)
        }
      }
    }
    if (sentCount === 0) {
      console.warn(`[WebSocketServer] No clients subscribed to marketId: ${marketId} or tokenId: ${tokenId}`)
      console.warn(`[WebSocketServer] Active subscriptions:`, Array.from(this.clientSubscriptions.values()).flatMap(s => Array.from(s)))
    }
  }

  private broadcastMarketUpdate(update: MarketUpdate): void {
    // Throttle updates per market
    const now = Date.now()
    const lastUpdate = this.updateThrottle.get(update.marketId) || 0
    const timeSinceLastUpdate = now - lastUpdate
    const minInterval = this.THROTTLE_WINDOW / this.MAX_UPDATES_PER_SECOND

    if (timeSinceLastUpdate < minInterval) {
      return // Skip this update (throttled)
    }

    this.updateThrottle.set(update.marketId, now)

    // Find all clients subscribed to this market
    for (const [client, subscriptions] of this.clientSubscriptions.entries()) {
      if (client.readyState === WebSocket.OPEN && subscriptions.has(update.marketId)) {
        try {
          if (update.type === 'orderbook') {
            const state = this.stateStore.getMarketState(update.marketId)
            if (state) {
              const snapshot: MarketSnapshotMessage = {
                type: 'market_snapshot',
                marketId: update.marketId,
                bestBid: update.bestBid,
                bestAsk: update.bestAsk,
                lastPrice: state.lastPrice,
                ts: Date.now(),
              }
              client.send(JSON.stringify(snapshot))
            }
          } else if (update.type === 'trade') {
            const trade: TradeMessage = {
              type: 'trade',
              marketId: update.marketId,
              price: update.price,
              size: update.size,
              side: update.side,
              ts: Date.now(),
            }
            client.send(JSON.stringify(trade))
          }
        } catch (error) {
          console.error('[WebSocketServer] Error sending update to client:', error)
        }
      }
    }
  }

  private startHeartbeat(): void {
    setInterval(() => {
      const heartbeat: HeartbeatMessage = {
        type: 'heartbeat',
        ts: Date.now(),
      }
      
      for (const [client] of this.clientSubscriptions.entries()) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(heartbeat))
          } catch (error) {
            console.error('[WebSocketServer] Error sending heartbeat:', error)
          }
        }
      }
    }, 30000) // Every 30 seconds
  }

  private startCleanup(): void {
    // Clear stale orderbook cache entries
    setInterval(() => {
      this.orderbookCache.clearStale()
    }, 60000) // Every minute
  }

  getStateStore(): MarketsStateStore {
    return this.stateStore
  }

  getPolymarketConnector(): PolymarketConnector {
    return this.polymarketConnector
  }

  /**
   * Get all subscribed tokenIds/marketIds from all clients
   */
  getAllSubscribedIds(): Set<string> {
    const subscribedIds = new Set<string>()
    for (const subscriptions of this.clientSubscriptions.values()) {
      for (const id of subscriptions) {
        subscribedIds.add(id)
      }
    }
    return subscribedIds
  }

  getHealthStatus(): {
    polymarket_connection: 'up' | 'down'
    markets_tracked: number
    last_update_age_ms: Record<string, number>
    clients_connected: number
  } {
    const connectionStatus = this.polymarketConnector.getConnectionStatus()
    const isConnected = connectionStatus.rtds || connectionStatus.clob

    return {
      polymarket_connection: isConnected ? 'up' : 'down',
      markets_tracked: this.stateStore.getMarketsCount(),
      last_update_age_ms: this.stateStore.getLastUpdateAges(),
      clients_connected: this.clientSubscriptions.size,
    }
  }
}

