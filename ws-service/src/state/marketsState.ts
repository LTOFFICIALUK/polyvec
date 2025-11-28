/**
 * In-memory state store for market data
 * Maintains per-market state: best bid/ask, last trade, 24h stats, etc.
 */

import { MarketUpdate } from '../polymarket/subscriptions'
import { MarketMetadata } from '../polymarket/clobClient'

export interface MarketState {
  marketId: string
  metadata?: MarketMetadata
  bestBid: number | null
  bestAsk: number | null
  lastPrice: number | null
  lastTrade: {
    price: number
    size: number
    side: 'buy' | 'sell'
    timestamp: number
  } | null
  lastUpdateTs: number
  status: 'open' | 'closed'
}

export class MarketsStateStore {
  private markets = new Map<string, MarketState>()
  private metadataCache = new Map<string, MarketMetadata>()

  /**
   * Update market state from a MarketUpdate event
   */
  updateMarket(update: MarketUpdate): void {
    const existing = this.markets.get(update.marketId)
    let marketState: MarketState
    
    if (existing) {
      // Preserve existing metadata and other fields
      marketState = existing
    } else {
      // Create new market state, but check if we have metadata in cache
      const cachedMetadata = this.metadataCache.get(update.marketId)
      marketState = {
        marketId: update.marketId,
        metadata: cachedMetadata, // Use cached metadata if available
        bestBid: null,
        bestAsk: null,
        lastPrice: null,
        lastTrade: null,
        lastUpdateTs: Date.now(),
        status: 'open' as const,
      }
    }

    if (update.type === 'orderbook') {
      marketState.bestBid = update.bestBid
      marketState.bestAsk = update.bestAsk
      marketState.lastUpdateTs = Date.now()
    } else if (update.type === 'trade') {
      marketState.lastPrice = update.price
      marketState.lastTrade = {
        price: update.price,
        size: update.size,
        side: update.side,
        timestamp: Date.now(),
      }
      marketState.lastUpdateTs = Date.now()
    } else if (update.type === 'marketStatus') {
      marketState.status = update.status
      marketState.lastUpdateTs = Date.now()
    }

    this.markets.set(update.marketId, marketState)
  }

  /**
   * Set market metadata
   */
  setMarketMetadata(marketId: string, metadata: MarketMetadata): void {
    this.metadataCache.set(marketId, metadata)
    const existing = this.markets.get(marketId)
    if (existing) {
      existing.metadata = metadata
      this.markets.set(marketId, existing)
    } else {
      // Create initial state if it doesn't exist
      this.markets.set(marketId, {
        marketId,
        metadata,
        bestBid: null,
        bestAsk: null,
        lastPrice: null,
        lastTrade: null,
        lastUpdateTs: Date.now(),
        status: 'open',
      })
    }
  }

  /**
   * Get current state for a market
   */
  getMarketState(marketId: string): MarketState | null {
    return this.markets.get(marketId) || null
  }

  /**
   * Get all tracked markets
   */
  getAllMarkets(): MarketState[] {
    return Array.from(this.markets.values())
  }

  /**
   * Get markets by asset and timeframe
   */
  getMarketsByAsset(asset: string, timeframe?: string): MarketState[] {
    return Array.from(this.markets.values()).filter((state) => {
      const metadata = state.metadata
      if (!metadata) return false
      
      const question = metadata.question?.toUpperCase() || ''
      const hasAsset = question.includes(asset.toUpperCase())
      
      if (timeframe) {
        return hasAsset && metadata.eventTimeframe === timeframe
      }
      return hasAsset
    })
  }

  /**
   * Get current event for an asset and timeframe
   * Returns the event that is currently active
   */
  getCurrentEvent(asset: string, timeframe: string): MarketState | null {
    const now = Date.now()
    const markets = this.getMarketsByAsset(asset, timeframe)
    
    return markets.find((state) => {
      const metadata = state.metadata
      if (!metadata) return false
      
      const startTime = metadata.startTime || 0
      const endTime = metadata.endTime || Infinity
      
      return now >= startTime && now < endTime && state.status === 'open'
    }) || null
  }

  /**
   * Get next event for an asset and timeframe
   * Returns the event that starts next
   */
  getNextEvent(asset: string, timeframe: string): MarketState | null {
    const now = Date.now()
    const markets = this.getMarketsByAsset(asset, timeframe)
    
    const upcoming = markets
      .filter((state) => {
        const metadata = state.metadata
        if (!metadata) return false
        const startTime = metadata.startTime || 0
        return startTime > now
      })
      .sort((a, b) => {
        const aStart = a.metadata?.startTime || 0
        const bStart = b.metadata?.startTime || 0
        return aStart - bStart
      })

    return upcoming[0] || null
  }

  /**
   * Get last update age for all markets
   */
  getLastUpdateAges(): Record<string, number> {
    const ages: Record<string, number> = {}
    const now = Date.now()
    
    this.markets.forEach((state, marketId) => {
      ages[marketId] = now - state.lastUpdateTs
    })
    
    return ages
  }

  /**
   * Get count of tracked markets
   */
  getMarketsCount(): number {
    return this.markets.size
  }

  /**
   * Get all market IDs
   */
  getAllMarketIds(): string[] {
    return Array.from(this.markets.keys())
  }

  /**
   * Get market metadata
   */
  getMarketMetadata(marketId: string): MarketMetadata | null {
    return this.metadataCache.get(marketId) || null
  }
}

