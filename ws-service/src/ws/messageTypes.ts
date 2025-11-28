/**
 * WebSocket message type definitions
 * Defines the protocol between browser ↔ ws service
 */

// Client → Server messages
export interface ClientMessage {
  type: 'subscribe_markets' | 'unsubscribe_markets' | 'ping'
  markets?: string[]
}

export interface SubscribeMarketsMessage extends ClientMessage {
  type: 'subscribe_markets'
  markets: string[]
}

export interface UnsubscribeMarketsMessage extends ClientMessage {
  type: 'unsubscribe_markets'
  markets: string[]
}

export interface PingMessage extends ClientMessage {
  type: 'ping'
}

// Server → Client messages
export interface ServerMessage {
  type: 'market_snapshot' | 'orderbook_update' | 'trade' | 'heartbeat' | 'pong'
  ts?: number
}

export interface MarketSnapshotMessage extends ServerMessage {
  type: 'market_snapshot'
  marketId: string
  bestBid: number | null
  bestAsk: number | null
  lastPrice: number | null
  ts: number
}

export interface OrderbookUpdateMessage extends ServerMessage {
  type: 'orderbook_update'
  marketId: string
  bids: Array<{ price: number; size: number }>
  asks: Array<{ price: number; size: number }>
  ts: number
}

export interface TradeMessage extends ServerMessage {
  type: 'trade'
  marketId: string
  price: number
  size: number
  side: 'buy' | 'sell'
  ts: number
}

export interface HeartbeatMessage extends ServerMessage {
  type: 'heartbeat'
  ts: number
}

export interface PongMessage extends ServerMessage {
  type: 'pong'
}

