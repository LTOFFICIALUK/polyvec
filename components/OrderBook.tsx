'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  tokenId?: string
}

const normalizeOrderbookData = (payload: any): OrderBookData => {
  let bids: OrderBookEntry[] = []
  let asks: OrderBookEntry[] = []

  const raw = Array.isArray(payload) ? payload[0] : payload
  const data = raw?.data || raw

  bids =
    data?.bids ||
    data?.buyOrders ||
    data?.asks ||
    data?.sellOrders ||
    []
  asks =
    data?.asks ||
    data?.sellOrders ||
    data?.bids ||
    data?.buyOrders ||
    []

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

const OrderBook = () => {
  const { selectedPair, selectedTimeframe } = useTradingContext()
  const { isConnected, subscribeMarkets } = useWebSocket()
  const { market, loading: marketLoading, error: marketError } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
  })
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null)
  const [orderbookLoading, setOrderbookLoading] = useState(true)
  const [orderbookError, setOrderbookError] = useState<string | null>(null)
  const [currentMarketId, setCurrentMarketId] = useState<string | null>(null)
  const previousMarketIdRef = useRef<string | null>(null)

  const fetchOrderbook = useCallback(async () => {
    if (!market?.tokenId) {
      setOrderBook(null)
      setOrderbookLoading(false)
      setOrderbookError('No active market found')
      setCurrentMarketId(null)
      previousMarketIdRef.current = null
      return
    }

    // Check if market changed
    const marketChanged = previousMarketIdRef.current !== null && previousMarketIdRef.current !== market.marketId
    if (marketChanged && market.marketId) {
      console.log(`[OrderBook] Market changed: ${previousMarketIdRef.current} → ${market.marketId}, resetting orderbook`)
      // Reset orderbook when market changes
      setOrderBook(null)
      setOrderbookError(null)
    }
    previousMarketIdRef.current = market.marketId ?? null

    try {
      setOrderbookLoading(true)
      setOrderbookError(null)

        const orderbookResponse = await fetch(
        `/api/polymarket/orderbook?tokenId=${market.tokenId}`
        )

        if (!orderbookResponse.ok) {
          throw new Error('Failed to fetch orderbook')
        }

        const orderbookData = await orderbookResponse.json()
      setCurrentMarketId(market.marketId ?? null)
      setOrderBook(normalizeOrderbookData(orderbookData))
      } catch (err) {
        console.error('Error fetching orderbook:', err)
      setOrderbookError(err instanceof Error ? err.message : 'Failed to load orderbook')
      setOrderBook(null)
      setCurrentMarketId(null)
    } finally {
      setOrderbookLoading(false)
    }
  }, [market])

  useEffect(() => {
    if (marketLoading) {
      return
    }
    fetchOrderbook()
  }, [fetchOrderbook, marketLoading])

  const handleMarketUpdate = useCallback(
    (data: any) => {
      if (data?.type === 'orderbook_update' || data?.type === 'market_snapshot') {
        setOrderBook((prev) => {
          const normalized = normalizeOrderbookData(data)
          if (!normalized.bids.length && !normalized.asks.length) {
            return prev
          }
          return normalized
            })
          }
    },
    []
  )

  useEffect(() => {
    if (!currentMarketId || !isConnected) return

    const unsubscribe = subscribeMarkets(
      [currentMarketId],
      handleMarketUpdate
    )

    return () => {
        unsubscribe()
    }
  }, [currentMarketId, handleMarketUpdate, isConnected, subscribeMarkets])

  if (marketLoading || orderbookLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
        Loading orderbook...
      </div>
    )
  }

  if (marketError || orderbookError) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-400 text-sm">
        {marketError || orderbookError}
      </div>
    )
  }

  if (!orderBook) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
        No orderbook data available
      </div>
    )
  }

  // Extract bids and asks from orderbook data
  // Polymarket API returns data in various formats, handle multiple possibilities
  let bids: OrderBookEntry[] = []
  let asks: OrderBookEntry[] = []

  if (Array.isArray(orderBook)) {
    // If array, take first element
    const data = orderBook[0]
    bids = data?.bids || data?.buyOrders || []
    asks = data?.asks || data?.sellOrders || []
  } else if (orderBook.bids || orderBook.asks) {
    bids = orderBook.bids || []
    asks = orderBook.asks || []
  } else if (orderBook.buyOrders || orderBook.sellOrders) {
    bids = orderBook.buyOrders || []
    asks = orderBook.sellOrders || []
  } else if (orderBook.data) {
    // Nested data structure
    bids = orderBook.data.bids || orderBook.data.buyOrders || []
    asks = orderBook.data.asks || orderBook.data.sellOrders || []
  }

  // Normalize price format (Polymarket may return prices as cents or decimals)
  bids = bids.map((bid) => ({
    ...bid,
    price: typeof bid.price === 'string' ? parseFloat(bid.price) : bid.price,
    size: typeof bid.size === 'string' ? parseFloat(bid.size) : bid.size,
  }))

  asks = asks.map((ask) => ({
    ...ask,
    price: typeof ask.price === 'string' ? parseFloat(ask.price) : ask.price,
    size: typeof ask.size === 'string' ? parseFloat(ask.size) : ask.size,
  }))

  // Sort bids descending (highest first) and asks ascending (lowest first)
  bids.sort((a, b) => b.price - a.price)
  asks.sort((a, b) => a.price - b.price)

  // Calculate cumulative totals
  let bidTotal = 0
  const bidsWithTotal = bids.map((bid) => {
    bidTotal += bid.size
    return { ...bid, total: bidTotal }
  })

  let askTotal = 0
  const asksWithTotal = asks.map((ask) => {
    askTotal += ask.size
    return { ...ask, total: askTotal }
  })

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex border-b border-gray-800">
        <div className="flex-1 px-4 py-2 text-xs text-gray-400 font-medium">
          Price
        </div>
        <div className="flex-1 px-4 py-2 text-xs text-gray-400 font-medium text-right">
          Size
        </div>
        <div className="flex-1 px-4 py-2 text-xs text-gray-400 font-medium text-right">
          Total
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Asks (Sell Orders) - Red */}
        <div className="flex flex-col">
          {asksWithTotal.length > 0 ? (
            asksWithTotal.map((ask, idx) => (
              <div
                key={`ask-${idx}`}
                className="flex border-b border-gray-800/50 hover:bg-gray-900/30"
              >
                <div className="flex-1 px-4 py-1.5 text-sm text-red-400">
                  ${ask.price > 1 ? (ask.price / 100).toFixed(2) : ask.price.toFixed(2)}
                </div>
                <div className="flex-1 px-4 py-1.5 text-sm text-gray-300 text-right">
                  {ask.size.toLocaleString()}
                </div>
                <div className="flex-1 px-4 py-1.5 text-sm text-gray-400 text-right">
                  {ask.total?.toLocaleString() || ''}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No asks available
            </div>
          )}
        </div>

        {/* Spread indicator */}
        {bids.length > 0 && asks.length > 0 && (
          <div className="px-4 py-2 border-y border-gray-800 bg-gray-900/20">
            <div className="text-center text-xs text-gray-400">
              Spread: ${(
                (asks[0].price > 1 ? asks[0].price / 100 : asks[0].price) -
                (bids[0].price > 1 ? bids[0].price / 100 : bids[0].price)
              ).toFixed(2)}
            </div>
          </div>
        )}

        {/* Bids (Buy Orders) - Green */}
        <div className="flex flex-col">
          {bidsWithTotal.length > 0 ? (
            bidsWithTotal.map((bid, idx) => (
              <div
                key={`bid-${idx}`}
                className="flex border-b border-gray-800/50 hover:bg-gray-900/30"
              >
                <div className="flex-1 px-4 py-1.5 text-sm text-green-400">
                  ${bid.price > 1 ? (bid.price / 100).toFixed(2) : bid.price.toFixed(2)}
                </div>
                <div className="flex-1 px-4 py-1.5 text-sm text-gray-300 text-right">
                  {bid.size.toLocaleString()}
                </div>
                <div className="flex-1 px-4 py-1.5 text-sm text-gray-400 text-right">
                  {bid.total?.toLocaleString() || ''}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No bids available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OrderBook

