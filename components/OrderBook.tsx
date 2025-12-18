'use client'

import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'

export interface OrderBookHandle {
  centerToSpread: () => void
  toggleAutoCenter: () => void
  isAutoCentering: () => boolean
}

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

  // Handle orderbook_update message format (bids/asks are direct arrays)
  // Also handle nested formats from API responses
  if (data?.bids && Array.isArray(data.bids)) {
    bids = data.bids
  } else if (data?.buyOrders && Array.isArray(data.buyOrders)) {
    bids = data.buyOrders
  } else if (data?.asks && Array.isArray(data.asks)) {
    // Fallback: if only asks exist, might be reversed
    bids = []
  }

  if (data?.asks && Array.isArray(data.asks)) {
    asks = data.asks
  } else if (data?.sellOrders && Array.isArray(data.sellOrders)) {
    asks = data.sellOrders
  } else if (data?.bids && Array.isArray(data.bids)) {
    // Fallback: if only bids exist, might be reversed
    asks = []
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

const OrderBook = forwardRef<OrderBookHandle>((props, ref) => {
  const { selectedPair, selectedTimeframe, activeTokenId, marketOffset } = useTradingContext()
  const { isConnected, subscribeMarkets } = useWebSocket()
  const { market, loading: marketLoading, error: marketError } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    offset: marketOffset,
  })
  
  // Check if market is ended (past)
  const isMarketEnded = market.isPast === true || market.marketStatus === 'ended'
  
  // Store both UP and DOWN orderbooks separately
  const [upOrderBook, setUpOrderBook] = useState<OrderBookData | null>(null)
  const [downOrderBook, setDownOrderBook] = useState<OrderBookData | null>(null)
  const [orderbookLoading, setOrderbookLoading] = useState(true)
  const [orderbookError, setOrderbookError] = useState<string | null>(null)
  const [currentMarketId, setCurrentMarketId] = useState<string | null>(null)
  const [hasScrolledToSpread, setHasScrolledToSpread] = useState(false)
  const [isAutoCenteringEnabled, setIsAutoCenteringEnabled] = useState(true)
  const isAutoCenteringRef = useRef(true) // Ref to track state for async callbacks
  const previousMarketIdRef = useRef<string | null>(null)
  const orderbookScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const spreadCenterRef = useRef<HTMLDivElement | null>(null)
  const userScrolledRef = useRef(false)
  
  // Get the active orderbook based on activeTokenId
  const orderBook = activeTokenId === 'up' ? upOrderBook : downOrderBook

  // Fetch orderbook for a specific token ID
  const fetchOrderbookForToken = useCallback(async (tokenId: string, tokenType: 'up' | 'down') => {
    if (!tokenId) return
    
    // Only fetch if this tokenId matches the current market
    if (tokenType === 'up' && market?.yesTokenId && tokenId !== market.yesTokenId) {
      return
    }
    if (tokenType === 'down' && market?.noTokenId && tokenId !== market.noTokenId) {
      console.log(`[OrderBook] Skipping ${tokenType} fetch - tokenId mismatch:`, {
        requested: tokenId,
        expected: market.noTokenId,
        currentMarketId: market.marketId,
      })
      return
    }

    try {
      const params = new URLSearchParams()
      params.set('tokenId', tokenId)


      const orderbookResponse = await fetch(`/api/polymarket/orderbook?${params.toString()}`)

      if (!orderbookResponse.ok) {
        throw new Error(`Failed to fetch ${tokenType} orderbook: ${orderbookResponse.status}`)
      }

      const orderbookData = await orderbookResponse.json()
      const normalized = normalizeOrderbookData(orderbookData)
      
      // Verify we still have the same market before updating
      if (tokenType === 'up' && market?.yesTokenId && tokenId !== market.yesTokenId) {
        return
      }
      if (tokenType === 'down' && market?.noTokenId && tokenId !== market.noTokenId) {
        return
      }
      
      const bestBid = normalized?.bids?.[0]?.price
      const bestAsk = normalized?.asks?.[0]?.price
      

      if (tokenType === 'up') {
        setUpOrderBook(normalized)
      } else {
        setDownOrderBook(normalized)
      }
    } catch (err) {
      console.error(`[OrderBook] Error fetching ${tokenType} orderbook:`, err)
      if (tokenType === 'up') {
        setUpOrderBook(null)
      } else {
        setDownOrderBook(null)
      }
    }
  }, [market])

  // Fetch both orderbooks on initial load or market change
  const fetchBothOrderbooks = useCallback(async () => {
    if (!market?.yesTokenId || !market?.noTokenId) {
      if (!market?.slug) {
        setUpOrderBook(null)
        setDownOrderBook(null)
        setOrderbookLoading(false)
        setOrderbookError('No active market found')
        setCurrentMarketId(null)
        previousMarketIdRef.current = null
        return
      }
    }

    // Check if market changed
    const marketChanged = previousMarketIdRef.current !== null && previousMarketIdRef.current !== market.marketId
    if (marketChanged && market.marketId) {
      setUpOrderBook(null)
      setDownOrderBook(null)
      setOrderbookError(null)
      setHasScrolledToSpread(false)
    }
    previousMarketIdRef.current = market.marketId ?? null

    setOrderbookLoading(true)
    setOrderbookError(null)
    setCurrentMarketId(market.marketId ?? null)


    // Fetch both orderbooks in parallel
    if (market.yesTokenId && market.noTokenId) {
      await Promise.all([
        fetchOrderbookForToken(market.yesTokenId, 'up'),
        fetchOrderbookForToken(market.noTokenId, 'down'),
      ])
    } else if (market.slug) {
      // Fallback: if we only have slug, fetch the default token
      const params = new URLSearchParams()
      params.set('slug', market.slug)
      try {
        const response = await fetch(`/api/polymarket/orderbook?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          const normalized = normalizeOrderbookData(data)
          setUpOrderBook(normalized)
          setDownOrderBook(normalized) // Use same data for both if we can't distinguish
        }
      } catch (err) {
        console.error('[OrderBook] Error fetching orderbook by slug:', err)
      }
    }

    setOrderbookLoading(false)
  }, [market, fetchOrderbookForToken])

  // Initial fetch of both orderbooks
  useEffect(() => {
    if (marketLoading) {
      return
    }
    fetchBothOrderbooks()
  }, [fetchBothOrderbooks, marketLoading])

  // DISABLED: WebSocket orderbook updates - using HTTP polling instead to avoid flickering
  // The WebSocket was receiving updates for multiple markets simultaneously, causing flickering
  // between different markets. HTTP polling ensures we only get data for the current market.
  // 
  // useEffect(() => {
  //   if (!isConnected || !market?.yesTokenId || !market?.noTokenId) {
  //     return
  //   }

  //   console.log('[OrderBook] Subscribing to both token IDs via websocket:', {
  //     upTokenId: market.yesTokenId,
  //     downTokenId: market.noTokenId,
  //   })

  //   const unsubscribe = subscribeMarkets([market.yesTokenId, market.noTokenId], (data: any) => {
  //     // Skip market_snapshot messages - they don't contain full orderbook data
  //     if (data?.type === 'market_snapshot') {
  //       console.log('[OrderBook] Ignoring market_snapshot (no full orderbook data)')
  //       return
  //     }
      
  //     if (data?.type === 'orderbook_update') {
  //       const tokenId = data.marketId || data.tokenId
  //       
  //       // Only process updates for the current market's tokenIds
  //       if (tokenId !== market.yesTokenId && tokenId !== market.noTokenId) {
  //         console.log('[OrderBook] Ignoring orderbook_update for different tokenId:', tokenId)
  //         return
  //       }
  //       
  //       const orderbookData = normalizeOrderbookData(data)
  //       
  //       if (tokenId === market.yesTokenId) {
  //         console.log('[OrderBook] Received UP orderbook update via websocket')
  //         setUpOrderBook(orderbookData)
  //       } else if (tokenId === market.noTokenId) {
  //         console.log('[OrderBook] Received DOWN orderbook update via websocket')
  //         setDownOrderBook(orderbookData)
  //       }
  //     }
  //   })

  //   return unsubscribe
  // }, [isConnected, subscribeMarkets, market?.yesTokenId, market?.noTokenId])

  // Poll HTTP API every 2 seconds to keep orderbooks fresh
  // This is the PRIMARY source of orderbook data (WebSocket updates disabled to prevent flickering)
  useEffect(() => {
    if (marketLoading || !market?.yesTokenId || !market?.noTokenId) {
      return
    }


    const pollInterval = setInterval(() => {
      // Refresh both orderbooks via HTTP API
      if (market.yesTokenId) {
        fetchOrderbookForToken(market.yesTokenId, 'up')
      }
      if (market.noTokenId) {
        fetchOrderbookForToken(market.noTokenId, 'down')
      }
    }, 2000)
    
    return () => {
      clearInterval(pollInterval)
    }
  }, [marketLoading, market?.yesTokenId, market?.noTokenId, market?.marketId, fetchOrderbookForToken])

  // Function to center scroll to spread - ONLY works when forced or auto-centering is enabled
  const centerToSpread = useCallback((useSmooth = false, force = false) => {
    // CRITICAL: Check ref FIRST before doing anything
    // If auto-centering is disabled and not forced, exit immediately
    if (!force && !isAutoCenteringRef.current) {
      return
    }

    const scrollContainer = orderbookScrollContainerRef.current
    const spreadElement = spreadCenterRef.current

    if (!scrollContainer || !spreadElement) {
      return
    }

    // Capture the force flag for use in RAF
    const shouldForce = force

    // Use requestAnimationFrame for immediate positioning without delay
    requestAnimationFrame(() => {
      // CRITICAL: Re-check ref inside RAF - state might have changed
      if (!shouldForce && !isAutoCenteringRef.current) {
        return
      }

      const containerRect = scrollContainer.getBoundingClientRect()
      const spreadRect = spreadElement.getBoundingClientRect()
      
      // Calculate the current scroll position
      const currentScrollTop = scrollContainer.scrollTop
      
      // Calculate the position of the spread relative to the container's content
      const spreadTopInContent = spreadRect.top - containerRect.top + currentScrollTop
      
      // Calculate the center position: element top - half container height + half element height
      const containerHeight = scrollContainer.clientHeight
      const spreadHeight = spreadElement.offsetHeight
      const targetScrollTop = spreadTopInContent - (containerHeight / 2) + (spreadHeight / 2)

      // Only scroll if we're not already centered (within 1px tolerance for stability)
      const currentOffset = Math.abs(spreadRect.top + spreadRect.height / 2 - (containerRect.top + containerHeight / 2))
      if (currentOffset > 1) {
        scrollContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: useSmooth ? 'smooth' : 'auto',
        })
      }

      setHasScrolledToSpread(true)
    })
  }, []) // No dependencies - uses refs for current values

  // Toggle auto-centering on/off
  const toggleAutoCenter = useCallback(() => {
    setIsAutoCenteringEnabled((prev) => {
      const newValue = !prev
      // Update ref IMMEDIATELY so all async callbacks see the new value
      isAutoCenteringRef.current = newValue
      
      if (newValue) {
        // When re-enabling, center immediately and reset user scroll flag
        userScrolledRef.current = false
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            centerToSpread(false, true) // Force center when re-enabling
          })
        })
      }
      return newValue
    })
  }, [centerToSpread])

  // Keep ref in sync with state (for any code paths that update state directly)
  useEffect(() => {
    isAutoCenteringRef.current = isAutoCenteringEnabled
  }, [isAutoCenteringEnabled])

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    centerToSpread: () => centerToSpread(true, true), // Force center when called manually
    toggleAutoCenter,
    isAutoCentering: () => isAutoCenteringEnabled,
  }), [centerToSpread, toggleAutoCenter, isAutoCenteringEnabled])

  // Always keep the spread centered - re-center whenever orderbook updates (only if auto-centering is enabled)
  // Use multiple requestAnimationFrame calls to ensure DOM is fully updated
  useEffect(() => {
    // CRITICAL: Exit immediately if auto-centering is disabled
    if (!isAutoCenteringEnabled) {
      return
    }

    if (!orderBook || !orderBook.bids?.length || !orderBook.asks?.length) {
      return
    }

    // Track if this effect is still active (for cleanup)
    let isActive = true

    // Only auto-center if user hasn't manually scrolled
    if (!userScrolledRef.current) {
      // Use triple RAF to ensure DOM updates, layout, and paint are complete
      requestAnimationFrame(() => {
        if (!isActive || !isAutoCenteringRef.current) return
        requestAnimationFrame(() => {
          if (!isActive || !isAutoCenteringRef.current) return
          requestAnimationFrame(() => {
            if (!isActive || !isAutoCenteringRef.current) return
            centerToSpread(false)
          })
        })
      })
    }

    // Cleanup: mark as inactive when effect is re-run or unmounted
    return () => {
      isActive = false
    }
  }, [orderBook, centerToSpread, isAutoCenteringEnabled])

  // Initial centering when orderbook first becomes available (only if auto-centering is enabled)
  useEffect(() => {
    // CRITICAL: Exit immediately if auto-centering is disabled
    if (!isAutoCenteringEnabled) {
      return
    }

    if (!orderBook || !orderBook.bids?.length || !orderBook.asks?.length || hasScrolledToSpread) {
      return
    }

    // Track if this effect is still active (for cleanup)
    let isActive = true

    // Use triple RAF for initial centering to ensure everything is rendered
    requestAnimationFrame(() => {
      if (!isActive || !isAutoCenteringRef.current) return
      requestAnimationFrame(() => {
        if (!isActive || !isAutoCenteringRef.current) return
        requestAnimationFrame(() => {
          if (!isActive || !isAutoCenteringRef.current) return
          centerToSpread(false)
        })
      })
    })

    // Cleanup: mark as inactive when effect is re-run or unmounted
    return () => {
      isActive = false
    }
  }, [orderBook, hasScrolledToSpread, centerToSpread, isAutoCenteringEnabled])

  // Scroll lock effect disabled - orderbook is not scrollable
  // useEffect(() => {
  //   // Orderbook is now non-scrollable, so this effect is not needed
  // }, [orderBook, centerToSpread, isAutoCenteringEnabled])

  // For past markets, just show the ended message
  if (isMarketEnded) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
        Historical Data — Market Ended
      </div>
    )
  }

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
  } else if ((orderBook as any).buyOrders || (orderBook as any).sellOrders) {
    bids = (orderBook as any).buyOrders || []
    asks = (orderBook as any).sellOrders || []
  } else if ((orderBook as any).data) {
    // Nested data structure
    const data = (orderBook as any).data
    bids = data.bids || data.buyOrders || []
    asks = data.asks || data.sellOrders || []
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
    <div className="w-full h-full flex flex-col bg-dark-bg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-medium text-gray-400 tracking-wider uppercase" style={{ fontFamily: 'monospace' }}>
          ORDERBOOK
        </span>
      </div>
      
      {/* Column Headers */}
      <div className="flex border-b border-gray-700/50 flex-shrink-0">
        <div className="flex-1 px-4 py-2 text-xs text-gray-400 font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>
          Price
        </div>
        <div className="flex-1 px-4 py-2 text-xs text-gray-400 font-medium text-right uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>
          Size
        </div>
        <div className="flex-1 px-4 py-2 text-xs text-gray-400 font-medium text-right uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>
          Total
        </div>
      </div>

      <div 
        ref={orderbookScrollContainerRef} 
        className="flex-1 overflow-hidden min-h-0"
        onWheel={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        style={{ overscrollBehavior: 'none' }}
      >
        {/* Asks (Sell Orders) - Red */}
        <div className="flex flex-col">
          {asksWithTotal.length > 0 ? (
            // Reverse asks so the closest-to-market ask is at the BOTTOM of the red section,
            // matching Polymarket's visual layout (highest price at the top, best ask just above the spread).
            [...asksWithTotal]
              .slice()
              .reverse()
              .map((ask, idx) => (
              <div
                key={`ask-${idx}`}
                className="flex border-b border-gray-700/30 hover:bg-gray-900/20"
              >
                <div className="flex-1 px-4 py-1.5 text-sm text-red-400">
                  {ask.price > 1 ? Math.round(ask.price) : Math.round(ask.price * 100)}¢
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
          <div
            ref={spreadCenterRef}
            className="px-4 py-2 border-y border-gray-700/30 bg-gray-900/20"
          >
            <div className="text-center text-xs text-gray-400">
              Spread: {Math.round(
                (asks[0].price > 1 ? asks[0].price : asks[0].price * 100) -
                (bids[0].price > 1 ? bids[0].price : bids[0].price * 100)
              )}¢
            </div>
          </div>
        )}

        {/* Bids (Buy Orders) - Green */}
        <div className="flex flex-col">
          {bidsWithTotal.length > 0 ? (
            bidsWithTotal.map((bid, idx) => (
              <div
                key={`bid-${idx}`}
                className="flex border-b border-gray-700/30 hover:bg-gray-900/20"
              >
                <div className="flex-1 px-4 py-1.5 text-sm text-green-400">
                  {bid.price > 1 ? Math.round(bid.price) : Math.round(bid.price * 100)}¢
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
})

OrderBook.displayName = 'OrderBook'

export default OrderBook

