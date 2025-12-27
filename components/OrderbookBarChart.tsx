'use client'

import { useEffect, useState, useCallback } from 'react'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'

interface OrderBookEntry {
  price: number
  size: number
  total?: number
}

interface OrderBookData {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
}

const normalizeOrderbookData = (payload: any): OrderBookData => {
  let bids: OrderBookEntry[] = []
  let asks: OrderBookEntry[] = []

  const raw = Array.isArray(payload) ? payload[0] : payload
  const data = raw?.data || raw

  if (data?.bids && Array.isArray(data.bids)) {
    bids = data.bids
  } else if (data?.buyOrders && Array.isArray(data.buyOrders)) {
    bids = data.buyOrders
  }

  if (data?.asks && Array.isArray(data.asks)) {
    asks = data.asks
  } else if (data?.sellOrders && Array.isArray(data.sellOrders)) {
    asks = data.sellOrders
  }

  const normalize = (entries: any[]) =>
    entries
      .map((entry) => ({
        price: typeof entry.price === 'string' ? parseFloat(entry.price) : entry.price,
        size: typeof entry.size === 'string' ? parseFloat(entry.size) : entry.size,
      }))
      .filter((entry) => typeof entry.price === 'number' && typeof entry.size === 'number')

  const normalizedBids = normalize(bids)
  const normalizedAsks = normalize(asks)

  normalizedBids.sort((a, b) => b.price - a.price)
  normalizedAsks.sort((a, b) => a.price - b.price)

  let bidTotal = 0
  const bidsWithTotal = normalizedBids.map((bid) => {
    bidTotal += bid.size
    return { ...bid, total: bidTotal }
  })

  let askTotal = 0
  const asksWithTotal = normalizedAsks.map((ask) => {
    askTotal += ask.size
    return { ...ask, total: askTotal }
  })

  return {
    bids: bidsWithTotal,
    asks: asksWithTotal,
  }
}

const OrderbookBarChart = () => {
  const { selectedPair, selectedTimeframe, activeTokenId, marketOffset } = useTradingContext()
  const { isConnected, subscribeMarkets } = useWebSocket()
  const { market, loading: marketLoading } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    offset: marketOffset,
  })

  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null)
  const [maxTotal, setMaxTotal] = useState(0)

  useEffect(() => {
    // Don't require WebSocket connection - fetch orderbook via API regardless
    if (!market?.yesTokenId || !market?.noTokenId) return

    const tokenId = activeTokenId === 'down' ? market.noTokenId : market.yesTokenId
    if (!tokenId) return

    const handleOrderbookUpdate = (data: any) => {
      try {
        const normalized = normalizeOrderbookData(data)
        setOrderBook(normalized)
        
        // Calculate max total for scaling
        const bidMax = normalized.bids.length > 0 ? (normalized.bids[normalized.bids.length - 1]?.total || 0) : 0
        const askMax = normalized.asks.length > 0 ? (normalized.asks[normalized.asks.length - 1]?.total || 0) : 0
        setMaxTotal(Math.max(bidMax, askMax, 1))
      } catch (error) {
        console.error('[OrderbookBarChart] Error normalizing data:', error)
      }
    }

    // Subscribe to orderbook updates via WebSocket (if connected)
    if (isConnected) {
      subscribeMarkets([tokenId], handleOrderbookUpdate)
    }

    // Fetch initial data from API (works regardless of WebSocket connection)
    const fetchInitialOrderbook = async () => {
      try {
        const response = await fetch(`/api/polymarket/orderbook?tokenId=${tokenId}`)
        if (response.ok) {
          const data = await response.json()
          const normalized = normalizeOrderbookData(data)
          setOrderBook(normalized)
          
          const bidMax = normalized.bids.length > 0 ? (normalized.bids[normalized.bids.length - 1]?.total || 0) : 0
          const askMax = normalized.asks.length > 0 ? (normalized.asks[normalized.asks.length - 1]?.total || 0) : 0
          setMaxTotal(Math.max(bidMax, askMax, 1))
        } else {
          console.warn('[OrderbookBarChart] Orderbook API response not OK:', response.status, response.statusText)
        }
      } catch (error) {
        console.error('[OrderbookBarChart] Error fetching initial orderbook:', error)
      }
    }

    fetchInitialOrderbook()

    // Poll API every 2 seconds as fallback
    const interval = setInterval(fetchInitialOrderbook, 2000)
    return () => clearInterval(interval)
  }, [isConnected, market?.yesTokenId, market?.noTokenId, activeTokenId, subscribeMarkets])

  if (marketLoading || !orderBook) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
        <div>Loading liquidity depth...</div>
        {market?.polymarketUrl && (
          <a
            href={market.polymarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 underline transition-colors"
            title={`View market on Polymarket: ${market.slug || market.marketId || 'Market'}`}
          >
            View on Polymarket
          </a>
        )}
      </div>
    )
  }

  const spread = orderBook.asks.length > 0 && orderBook.bids.length > 0
    ? ((orderBook.asks[0].price - orderBook.bids[0].price) * 100).toFixed(1)
    : null

  // Combine bids and asks for display (bids descending, asks ascending)
  const displayBids = [...orderBook.bids].reverse().slice(0, 20)
  const displayAsks = orderBook.asks.slice(0, 20)

  return (
    <div className="w-full h-full flex flex-col bg-dark-bg">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 tracking-wider uppercase" style={{ fontFamily: 'monospace' }}>
            ORDERBOOK
          </span>
          {market?.polymarketUrl && (
            <a
              href={market.polymarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
              title={`View market on Polymarket: ${market.slug || market.marketId || 'Market'}`}
            >
              View on Polymarket
            </a>
          )}
        </div>
        {spread && (
          <span className="text-xs text-gray-500">
            Spread: <span className="text-gold-primary">{spread}¢</span>
          </span>
        )}
      </div>

      {/* Chart Area */}
      <div className="flex-1 relative overflow-hidden p-4">
        <div className="h-full flex flex-col-reverse">
          {/* Asks (Sell Orders) - Red */}
          <div className="flex-1 min-h-0 flex flex-col justify-end">
            {displayAsks.map((ask, idx) => {
              const widthPercent = maxTotal > 0 && ask.total !== undefined ? (ask.total / maxTotal) * 100 : 0
              return (
                <div key={`ask-${idx}`} className="relative mb-0.5 group">
                  <div
                    className="h-4 bg-red-500/20 border-l-2 border-red-500/60 flex items-center justify-end pr-2 transition-all hover:bg-red-500/30"
                    style={{ width: `${widthPercent}%`, marginLeft: 'auto' }}
                  >
                    <span className="text-[10px] text-red-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {(ask.price * 100).toFixed(1)}¢
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Spread Line */}
          {orderBook.bids.length > 0 && orderBook.asks.length > 0 && (
            <div className="py-2 border-y border-gray-700/30 my-1 flex items-center justify-center">
              <div className="text-xs text-gray-500 font-mono">
                {(orderBook.bids[0].price * 100).toFixed(1)}¢ / {(orderBook.asks[0].price * 100).toFixed(1)}¢
              </div>
            </div>
          )}

          {/* Bids (Buy Orders) - Green */}
          <div className="flex-1 min-h-0 flex flex-col">
            {displayBids.map((bid, idx) => {
              const widthPercent = maxTotal > 0 && bid.total !== undefined ? (bid.total / maxTotal) * 100 : 0
              return (
                <div key={`bid-${idx}`} className="relative mt-0.5 group">
                  <div
                    className="h-4 bg-green-500/20 border-l-2 border-green-500/60 flex items-center pr-2 transition-all hover:bg-green-500/30"
                    style={{ width: `${widthPercent}%` }}
                  >
                    <span className="text-[10px] text-green-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {(bid.price * 100).toFixed(1)}¢
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-700/50 flex items-center justify-between text-xs text-gray-500">
        <span>Bids: {orderBook.bids.length}</span>
        <span>Asks: {orderBook.asks.length}</span>
      </div>
    </div>
  )
}

export default OrderbookBarChart

