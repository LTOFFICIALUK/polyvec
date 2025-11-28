/**
 * Orderbook cache
 * Stores full orderbook data for markets
 */

export interface OrderbookEntry {
  price: number
  size: number
}

export interface OrderbookData {
  marketId: string
  bids: OrderbookEntry[]
  asks: OrderbookEntry[]
  timestamp: number
}

export class OrderbookCache {
  private cache = new Map<string, OrderbookData>()
  private maxAge = 60000 // 1 minute

  /**
   * Update orderbook for a market
   */
  updateOrderbook(marketId: string, bids: OrderbookEntry[], asks: OrderbookEntry[]): void {
    this.cache.set(marketId, {
      marketId,
      bids,
      asks,
      timestamp: Date.now(),
    })
  }

  /**
   * Get orderbook for a market
   */
  getOrderbook(marketId: string): OrderbookData | null {
    const data = this.cache.get(marketId)
    if (!data) return null

    // Check if stale
    if (Date.now() - data.timestamp > this.maxAge) {
      this.cache.delete(marketId)
      return null
    }

    return data
  }

  /**
   * Clear stale entries
   */
  clearStale(): void {
    const now = Date.now()
    for (const [marketId, data] of this.cache.entries()) {
      if (now - data.timestamp > this.maxAge) {
        this.cache.delete(marketId)
      }
    }
  }
}

