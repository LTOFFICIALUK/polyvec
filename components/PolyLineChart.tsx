'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'
import { useWebSocket } from '@/contexts/WebSocketContext'
import AnimatedPrice from './AnimatedPrice'

interface ChartPoint {
  time: number
  upPrice: number
  downPrice: number
}

const PolyLineChart = () => {
  const { selectedPair, selectedTimeframe, marketOffset } = useTradingContext()
  const { subscribe, isConnected } = useWebSocket()
  const { market } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    offset: marketOffset,
  })
  
  const [series, setSeries] = useState<ChartPoint[]>([])
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const previousMarketIdRef = useRef<string | null>(null)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const historyFetchedRef = useRef<string | null>(null)
  const fetchPricesRef = useRef<typeof fetchPrices | null>(null)

  // Fetch orderbook data for UP and DOWN tokens to get best bid/ask
  const [orderbookPrices, setOrderbookPrices] = useState<{
    upBestBid: number | null
    upBestAsk: number | null
    downBestBid: number | null
    downBestAsk: number | null
  }>({
    upBestBid: null,
    upBestAsk: null,
    downBestBid: null,
    downBestAsk: null,
  })

  // Direct current market prices from Polymarket pricing API

  // BTC price data
  const [btcPrice, setBtcPrice] = useState<{
    current: number | null
    lastCandleClose: number | null
  }>({
    current: null,
    lastCandleClose: null,
  })

  // Recent trades for displaying bubbles on chart
  interface TradeMarker {
    id: string
    timestamp: number
    shares: number
    price: number
    dollarAmount: number
    side: string // 'you bought' or 'you sold'
    outcome: 'up' | 'down'
  }

  const [recentTrades, setRecentTrades] = useState<TradeMarker[]>([])
  const [hoveredTradeId, setHoveredTradeId] = useState<string | null>(null)

  // Listen for order placement events to show trade bubbles
  useEffect(() => {
    const handleOrderPlaced = (event: Event) => {
      const customEvent = event as CustomEvent
      const tradeData = customEvent.detail
      
      if (!tradeData) return

      const newTrade: TradeMarker = {
        id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: tradeData.timestamp || Date.now(),
        shares: tradeData.shares,
        price: tradeData.price,
        dollarAmount: tradeData.dollarAmount,
        side: tradeData.side,
        outcome: tradeData.outcome,
      }

      setRecentTrades((prev) => [...prev, newTrade])

      // Auto-remove trades older than 5 minutes
      setTimeout(() => {
        setRecentTrades((prev) => prev.filter((t) => t.id !== newTrade.id))
      }, 5 * 60 * 1000)
    }

    window.addEventListener('orderPlaced', handleOrderPlaced as EventListener)
    return () => window.removeEventListener('orderPlaced', handleOrderPlaced as EventListener)
  }, [])

  // Fetch historical price data from database
  const fetchHistoricalData = useCallback(async (): Promise<ChartPoint[]> => {
    if (!market?.marketId || !market?.startTime || !market?.endTime) {
      return []
    }

    try {
      const now = Date.now()
      const eventStartTime = market.startTime
      // Use Math.min to only request data up to the current time (future data doesn't exist yet)
      const eventEndTime = Math.min(market.endTime, now)

      // Build query parameters
      const params = new URLSearchParams({
        marketId: market.marketId,
        startTime: eventStartTime.toString(),
        endTime: eventEndTime.toString(),
      })

      // Add tokenIds if available (more accurate)
      if (market.yesTokenId && market.noTokenId) {
        params.append('yesTokenId', market.yesTokenId)
        params.append('noTokenId', market.noTokenId)
      }

      const response = await fetch(`/api/polymarket/price-history?${params.toString()}`)
      
      if (!response.ok) {
        console.warn('[PolyLineChart] Failed to fetch historical data:', response.status)
        return []
      }

      const result = await response.json()
      const historicalData = result.data || []

      
      // Convert decimal prices (0-1) to cents (0-100) for chart
      return historicalData.map((point: any) => {
        const up = point.upPrice || 0
        const down = point.downPrice || 0
        return {
          time: point.time,
          upPrice: up <= 1 ? up * 100 : up,
          downPrice: down <= 1 ? down * 100 : down,
        }
      })
    } catch (error) {
      console.error('[PolyLineChart] Error fetching historical data:', error)
      return []
    }
  }, [market?.marketId, market?.startTime, market?.endTime, market?.yesTokenId, market?.noTokenId])

  // Fetch current bid prices for both UP and DOWN tokens from orderbook
  const fetchPrices = useCallback(async (): Promise<{ upPrice: number | null; downPrice: number | null }> => {
    if (!market?.yesTokenId || !market?.noTokenId) {
      return { upPrice: null, downPrice: null }
    }

    try {
      // Fetch orderbooks for both UP and DOWN tokens in parallel
      const [upResponse, downResponse] = await Promise.all([
        fetch(`/api/polymarket/orderbook?tokenId=${market.yesTokenId}`),
        fetch(`/api/polymarket/orderbook?tokenId=${market.noTokenId}`),
      ])

      let upPrice: number | null = null
      let downPrice: number | null = null

      if (upResponse.ok) {
        const upData = await upResponse.json()
        const bids = upData?.bids || []
        
        if (bids.length > 0) {
          // Get best bid (highest price, first in sorted array)
          const bestBid = bids[0]
          const price = typeof bestBid.price === 'string' ? parseFloat(bestBid.price) : bestBid.price
          
          // Debug log to see what we're getting
          
          // Convert decimal (0-1) to cents (0-100) for chart
          upPrice = price <= 1 ? price * 100 : price
        }
      }

      if (downResponse.ok) {
        const downData = await downResponse.json()
        const bids = downData?.bids || []
        
        if (bids.length > 0) {
          // Get best bid (highest price, first in sorted array)
          const bestBid = bids[0]
          const price = typeof bestBid.price === 'string' ? parseFloat(bestBid.price) : bestBid.price
          
          // Debug log
          
          // Convert decimal (0-1) to cents (0-100) for chart
          downPrice = price <= 1 ? price * 100 : price
        }
      }

      return { upPrice, downPrice }
    } catch (err) {
      console.error('Error fetching prices:', err)
      return { upPrice: null, downPrice: null }
    }
  }, [market?.yesTokenId, market?.noTokenId])

  // Check if this is a past market (ended)
  const isMarketEnded = market?.isPast === true || market?.marketStatus === 'ended'

  // Real-time price updates via HTTP polling (250ms interval)
  // Prices come from ws-service which is connected to Polymarket RTDS
  // This provides near real-time updates without WebSocket complexity

  // Fetch initial price and price to beat (last candle close) from API
  useEffect(() => {
    if (!market?.startTime) {
      // Reset prices when no market
      setBtcPrice({ current: null, lastCandleClose: null })
      return
    }

    // Get symbol based on selected pair (BTC, ETH, SOL, XRP)
    const symbolMap: Record<string, string> = {
      'BTC': 'btcusdt',
      'ETH': 'ethusdt',
      'SOL': 'solusdt',
      'XRP': 'xrpusdt',
    }
    const symbol = symbolMap[selectedPair.toUpperCase()] || 'btcusdt'
    
    // Map timeframe to candle timeframe
    const timeframeMap: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
    }
    const candleTimeframe = timeframeMap[selectedTimeframe] || '15m'

    // Reset prices when market changes (to show loading state and prevent stale data)
    const currentMarketKey = market?.marketId ? `${market.marketId}-${market.startTime}` : null
    const previousMarketKey = historyFetchedRef.current
    if (currentMarketKey && previousMarketKey && previousMarketKey !== currentMarketKey) {
      setBtcPrice({ current: null, lastCandleClose: null })
    }

    // Fetch initial current price and set up polling as fallback
    const fetchCurrentPrice = async () => {
      try {
        const priceResponse = await fetch(`/api/crypto/prices`, { 
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })

            if (priceResponse.ok) {
              const priceData = await priceResponse.json()
              
              const currentPrice = priceData.prices?.[symbol]
          if (currentPrice !== undefined && currentPrice !== null) {
            const parsedPrice = parseFloat(currentPrice)
            setBtcPrice(prev => ({ ...prev, current: parsedPrice }))
          } else {
            console.warn('[PolyLineChart] ⚠️ No price found for symbol:', symbol, 'Available prices:', Object.keys(priceData.prices || {}))
          }
          
          if (!priceData.connected) {
            console.warn('[PolyLineChart] ⚠️ ws-service reports NOT connected to Polymarket RTDS')
          }
        } else {
          console.error('[PolyLineChart] Price response not OK:', priceResponse.status, priceResponse.statusText)
        }
      } catch (err) {
        console.error('[PolyLineChart] Error fetching current price:', err)
      }
    }

    // Fetch immediately
    fetchCurrentPrice()
    
    // Poll every 250ms (quarter second) for near real-time updates
    const pollInterval = setInterval(fetchCurrentPrice, 250)

    // Fetch candles to get price to beat (OPEN price of candle that STARTED at market start time)
    const fetchCandles = async () => {
      try {
        const candlesResponse = await fetch(`/api/crypto/candles?symbol=${symbol}&timeframe=${candleTimeframe}&count=100`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })

        if (candlesResponse.ok) {
          const candlesData = await candlesResponse.json()
          
          if (candlesData.candles && candlesData.candles.length > 0) {
            const marketStartTime = market.startTime
            if (!marketStartTime) return
            
            // Find the candle that was active at market start time
            // Price to beat = CLOSE price of the candle that ENDED just before market start
            // OR if market starts exactly at candle boundary, use OPEN of that candle
            // Polymarket typically uses the previous candle's close price as the "price to beat"
            let priceToBeat: number | null = null
            let foundCandle = null
            
            const candleDurationMs = candleTimeframe === '1m' ? 60 * 1000 :
                                     candleTimeframe === '5m' ? 5 * 60 * 1000 :
                                     candleTimeframe === '15m' ? 15 * 60 * 1000 :
                                     candleTimeframe === '1h' ? 60 * 60 * 1000 : 15 * 60 * 1000
            
            // Find the candle that was active when market started
            // First check if market starts exactly at a candle boundary
            let activeCandleIndex = -1
            for (let i = candlesData.candles.length - 1; i >= 0; i--) {
              const candle = candlesData.candles[i]
              const candleTimestamp = candle.timestamp || candle.time
              const candleEndTime = candleTimestamp + candleDurationMs
              
              // Check if market starts exactly at candle start
              if (candleTimestamp === marketStartTime && candle.open !== undefined) {
                    priceToBeat = parseFloat(candle.open)
                    foundCandle = candle
                    activeCandleIndex = i
                    break
              }
              
              // Check if market start is within this candle's period
              if (candleTimestamp <= marketStartTime && marketStartTime < candleEndTime) {
                activeCandleIndex = i
                // If market starts at the very beginning of the candle, use OPEN
                // Otherwise, use the previous candle's CLOSE (which is the price at market start)
                if (i > 0) {
                  const previousCandle = candlesData.candles[i - 1]
                  if (previousCandle.close !== undefined) {
                    priceToBeat = parseFloat(previousCandle.close)
                    foundCandle = previousCandle
                  } else if (candle.open !== undefined) {
                    // Fallback to active candle open if previous close not available
                    priceToBeat = parseFloat(candle.open)
                    foundCandle = candle
                  }
                } else if (candle.open !== undefined) {
                  // No previous candle, use this candle's open
                  priceToBeat = parseFloat(candle.open)
                  foundCandle = candle
                }
                break
              }
            }
            
            // If still no match, use the most recent candle's close price (price to beat)
            if (priceToBeat === null && candlesData.candles.length > 0) {
              const mostRecentCandle = candlesData.candles[candlesData.candles.length - 1]
              if (mostRecentCandle.close !== undefined) {
                priceToBeat = parseFloat(mostRecentCandle.close)
                foundCandle = mostRecentCandle
                const candleTimestamp = mostRecentCandle.timestamp || mostRecentCandle.time
                console.warn('[PolyLineChart] ⚠️ Using most recent candle CLOSE as price to beat (fallback):', {
                  candleTimestamp: candleTimestamp ? new Date(candleTimestamp).toISOString() : 'unknown',
                  marketStart: new Date(marketStartTime).toISOString(),
                  closePrice: mostRecentCandle.close,
                })
              }
            }
            
            if (priceToBeat !== null) {
              setBtcPrice(prev => ({ ...prev, lastCandleClose: priceToBeat }))
            } else {
              console.warn('[PolyLineChart] ⚠️ Could not determine price to beat from candles')
            }
          }
        }
      } catch (err) {
        console.error('[PolyLineChart] Error fetching candles:', err)
      }
    }

    fetchCandles()

    // Cleanup function
    return () => {
      clearInterval(pollInterval)
    }
  }, [selectedPair, selectedTimeframe, market?.startTime, market?.marketId])

  // Fetch orderbook and current market prices
  useEffect(() => {
    const fetchPriceData = async () => {
      if (!market?.yesTokenId || !market?.noTokenId || isMarketEnded) return

      try {
        // Fetch orderbooks for both UP and DOWN tokens
        const [upOrderbookResponse, downOrderbookResponse] = await Promise.all([
          fetch(`/api/polymarket/orderbook?tokenId=${market.yesTokenId}`),
          fetch(`/api/polymarket/orderbook?tokenId=${market.noTokenId}`),
        ])

        // Process orderbook data
        if (upOrderbookResponse.ok && downOrderbookResponse.ok) {
          const upData = await upOrderbookResponse.json()
          const downData = await downOrderbookResponse.json()

          const upBestBid = upData.bids?.[0]?.price ? parseFloat(upData.bids[0].price) * 100 : null
          const upBestAsk = upData.asks?.[0]?.price ? parseFloat(upData.asks[0].price) * 100 : null
          const downBestBid = downData.bids?.[0]?.price ? parseFloat(downData.bids[0].price) * 100 : null
          const downBestAsk = downData.asks?.[0]?.price ? parseFloat(downData.asks[0].price) * 100 : null

          setOrderbookPrices({
            upBestBid,
            upBestAsk,
            downBestBid,
            downBestAsk,
          })
        }
      } catch (err) {
        console.error('Error fetching price data:', err)
      }
    }

    fetchPriceData()
    // Poll every 2 seconds to keep prices fresh
    const interval = setInterval(fetchPriceData, 2000)
    return () => clearInterval(interval)
  }, [market?.yesTokenId, market?.noTokenId, isMarketEnded])

  // Keep fetchPrices ref updated for use in worker callback
  useEffect(() => {
    fetchPricesRef.current = fetchPrices
  }, [fetchPrices])

  // Update chart data every second using Web Worker (avoids background tab throttling)
  useEffect(() => {
    // Check if market changed
    const marketChanged = previousMarketIdRef.current !== null && previousMarketIdRef.current !== market?.marketId
    if (marketChanged && market?.marketId) {
      setSeries([])
      historyFetchedRef.current = null // Reset history fetch flag for new market
    }
    previousMarketIdRef.current = market?.marketId ?? null

    // Wait for market data to be ready before proceeding
    if (!market?.startTime || !market?.endTime || !market?.marketId) {
      setSeries([])
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' })
        workerRef.current.terminate()
        workerRef.current = null
      }
      // Return early - but the effect will run again when market data becomes available
      // due to dependencies on market?.startTime, market?.endTime, market?.marketId
      return
    }

    const eventStartTime = market.startTime
    const eventEndTime = market.endTime
    const now = Date.now()

    // For PAST markets: Load historical data and DON'T poll for new prices
    if (isMarketEnded || now > eventEndTime) {
      // Stop any existing worker
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' })
        workerRef.current.terminate()
        workerRef.current = null
      }

      // Fetch historical data for the past market
      const currentMarketKey = `${market.marketId}-${market.startTime}-past`
      if (historyFetchedRef.current !== currentMarketKey) {
        // Don't set the ref until AFTER the fetch completes successfully
        // For past markets, fetch for the full event window
        const fetchPastMarketData = async () => {
          try {
            const params = new URLSearchParams({
              marketId: market.marketId,
              startTime: eventStartTime.toString(),
              endTime: eventEndTime.toString(), // Use actual end time, not "now"
            })

            if (market.yesTokenId && market.noTokenId) {
              params.append('yesTokenId', market.yesTokenId)
              params.append('noTokenId', market.noTokenId)
            }

            const response = await fetch(`/api/polymarket/price-history?${params.toString()}`)
            
            if (!response.ok) {
              console.warn('[PolyLineChart] Failed to fetch past market data:', response.status)
              return
            }

            const result = await response.json()
            const historicalData = result.data || []

            
            if (historicalData.length > 0) {
              // Only set the ref after successful fetch to prevent race conditions
              historyFetchedRef.current = currentMarketKey
              // Convert decimal prices (0-1) to cents (0-100) for chart
              setSeries(historicalData.map((point: any) => {
                const up = point.upPrice || 0
                const down = point.downPrice || 0
                return {
                time: point.time,
                  upPrice: up <= 1 ? up * 100 : up,
                  downPrice: down <= 1 ? down * 100 : down,
                }
              }))
            }
          } catch (error) {
            console.error('[PolyLineChart] Error loading past market data:', error)
            // Don't set the ref on error, so it will retry on next render
          }
        }

        fetchPastMarketData()
      }
      return
    }

    // Don't chart if event hasn't started yet
    if (now < eventStartTime) {
      setSeries([])
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' })
        workerRef.current.terminate()
        workerRef.current = null
      }
      return
    }

    // LIVE market: Fetch historical data first (if market changed or first load)
    const currentMarketKey = `${market.marketId}-${market.startTime}`
    const shouldFetchHistory = historyFetchedRef.current !== currentMarketKey

    // Update chart with current prices (LIVE market only)
    // This appends new points to existing historical data
    const updateChart = async () => {
      if (!fetchPricesRef.current) return
      
      const { upPrice, downPrice } = await fetchPricesRef.current()
      if (upPrice === null && downPrice === null) return

      const currentTime = Date.now()
      
      setSeries((prev) => {
        // Filter out points outside the event window or from different markets
        // If prev is empty (historical data still loading), this will return empty array
        // and we'll still add the new point below
        const filtered = prev.filter((point) => point.time >= eventStartTime && point.time <= eventEndTime)
        
        // Use previous prices if new ones aren't available
        const lastPoint = filtered[filtered.length - 1]
        const finalUpPrice = upPrice !== null ? upPrice : (lastPoint?.upPrice ?? 0)
        const finalDownPrice = downPrice !== null ? downPrice : (lastPoint?.downPrice ?? 0)
        
        // Add new point
        const newPoint: ChartPoint = {
          time: currentTime,
          upPrice: finalUpPrice,
          downPrice: finalDownPrice,
        }

        // Check if we already have a point for this second (avoid duplicates)
        if (lastPoint && Math.abs(lastPoint.time - currentTime) < 1000) {
          // Update existing point if it's within 1 second (more lenient to avoid overwriting historical data)
          return filtered.slice(0, -1).concat([newPoint])
        }

        // Add new point to existing filtered data, preserving all historical points
        const updated = [...filtered, newPoint]
        // Sort by time to ensure correct order (historical data + new points)
        updated.sort((a, b) => a.time - b.time)
        
        return updated
      })
    }

    // Fetch historical data first, then start live updates
    if (shouldFetchHistory) {
      // Don't set the ref until AFTER the fetch completes successfully
      fetchHistoricalData().then((historicalData) => {
        // Only set the ref after successful fetch to prevent race conditions
        historyFetchedRef.current = currentMarketKey
        if (historicalData.length > 0) {
          // Set historical data first, using a functional update to ensure it's set
          setSeries(historicalData)
          console.log(`[PolyLineChart] Loaded ${historicalData.length} historical price points for market ${market.marketId}`)
          
          // Use setTimeout to ensure state update completes before starting live updates
          // This prevents updateChart from seeing empty prev state
          setTimeout(() => {
    updateChart()
          }, 100)
        } else {
          console.warn(`[PolyLineChart] No historical data returned for market ${market.marketId}`)
          // Start live updates anyway even without historical data
          updateChart()
        }
      }).catch((error) => {
        console.error('[PolyLineChart] Error loading historical data:', error)
        // Don't set the ref on error, so it will retry on next render
        // Start live updates anyway
        updateChart()
      })
    } else {
      // History already fetched, start live updates immediately
      updateChart()
    }

    // Create Web Worker for background-safe timing (avoids browser throttling)
    // Web Workers run independently of the main thread and aren't throttled in background tabs
    if (typeof Worker !== 'undefined') {
      try {
        const worker = new Worker('/workers/timer-worker.js')
        workerRef.current = worker

        worker.onmessage = (e) => {
          if (e.data.type === 'TICK') {
            updateChart()
          }
        }

        worker.onerror = (error) => {
          console.error('[PolyLineChart] Worker error:', error)
          // Fallback to setInterval if worker fails
          worker.terminate()
          workerRef.current = null
        }

        // Start the worker with 1 second interval
        worker.postMessage({ type: 'START', payload: { interval: 1000 } })
      } catch (error) {
        console.error('[PolyLineChart] Failed to create Web Worker:', error)
      }
    }

      return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' })
        workerRef.current.terminate()
        workerRef.current = null
        }
      }
  }, [market?.startTime, market?.endTime, market?.marketId, market?.yesTokenId, market?.noTokenId, market?.isPast, market?.marketStatus, isMarketEnded, fetchHistoricalData])

  const { upLinePath, downLinePath, minPrice, maxPrice, paddedMin, paddedMax, eventStartTime, eventEndTime } = useMemo(() => {
    if (!series.length || !market?.startTime || !market?.endTime) {
      return { 
        upLinePath: '', 
        downLinePath: '',
        minPrice: 1, 
        maxPrice: 99, 
        paddedMin: 1, 
        paddedMax: 99,
        eventStartTime: null,
        eventEndTime: null,
      }
    }

    const eventStart = market.startTime
    const eventEnd = market.endTime
    
    // Fixed Y-axis range: always 1c to 99c
    const minValue = 1
    const maxValue = 99
    const range = maxValue - minValue // 98

    // Padding to keep data within visible chart area (avoid overlapping with axis labels)
    // Top padding: 4% from top, Bottom padding: 4% from bottom
    // This maps the full 0-100% Y range to 4%-96% of the viewBox
    const TOP_PADDING = 4
    const BOTTOM_PADDING = 4
    const CHART_HEIGHT = 100 - TOP_PADDING - BOTTOM_PADDING // 92% usable height

    // Create path for UP line (green)
    const upPathParts: string[] = []
    series.forEach((point, idx) => {
      if (point.upPrice <= 0) return // Skip invalid points
      
      // Calculate X position based on time within event window
      const timeProgress = (point.time - eventStart) / (eventEnd - eventStart)
      const x = Math.max(0, Math.min(100, timeProgress * 100))
      
      // Calculate Y position based on price (1c = bottom, 99c = top)
      // Map price from 1-99 range to padded height (TOP_PADDING to 100-BOTTOM_PADDING)
      // Formula: y = TOP_PADDING + (1 - ((price - 1) / 98)) * CHART_HEIGHT
      // At price = 99c: y = TOP_PADDING (top with padding)
      // At price = 1c: y = TOP_PADDING + CHART_HEIGHT (bottom with padding)
      const pricePercent = (point.upPrice - minValue) / range
      const normalized = TOP_PADDING + (1 - pricePercent) * CHART_HEIGHT
      
      if (upPathParts.length === 0) {
        upPathParts.push(`M ${x.toFixed(2)} ${normalized.toFixed(2)}`)
      } else {
        upPathParts.push(`L ${x.toFixed(2)} ${normalized.toFixed(2)}`)
      }
    })

    // Create path for DOWN line (red)
    const downPathParts: string[] = []
    series.forEach((point, idx) => {
      if (point.downPrice <= 0) return // Skip invalid points
      
      // Calculate X position based on time within event window
      const timeProgress = (point.time - eventStart) / (eventEnd - eventStart)
      const x = Math.max(0, Math.min(100, timeProgress * 100))
      
      // Calculate Y position based on price (1c = bottom, 99c = top)
      // Map price from 1-99 range to padded height (TOP_PADDING to 100-BOTTOM_PADDING)
      const pricePercent = (point.downPrice - minValue) / range
      const normalized = TOP_PADDING + (1 - pricePercent) * CHART_HEIGHT
      
      if (downPathParts.length === 0) {
        downPathParts.push(`M ${x.toFixed(2)} ${normalized.toFixed(2)}`)
      } else {
        downPathParts.push(`L ${x.toFixed(2)} ${normalized.toFixed(2)}`)
      }
    })

    return {
      upLinePath: upPathParts.join(' '),
      downLinePath: downPathParts.join(' '),
      minPrice: minValue,
      maxPrice: maxValue,
      paddedMin: minValue,
      paddedMax: maxValue,
      eventStartTime: eventStart,
      eventEndTime: eventEnd,
    }
  }, [series, market?.startTime, market?.endTime])

  const latest = series[series.length - 1]
  const currentUpPrice = latest?.upPrice || null
  const currentDownPrice = latest?.downPrice || null

  // Get the hovered point data or fall back to latest
  const hoveredPoint = hoveredIndex !== null ? series[hoveredIndex] : null
  const displayUpPrice = hoveredPoint?.upPrice ?? currentUpPrice
  const displayDownPrice = hoveredPoint?.downPrice ?? currentDownPrice

  // Calculate hovered point positions for rendering dots and crosshair
  const hoveredPositions = useMemo(() => {
    if (hoveredIndex === null || !series[hoveredIndex] || !eventStartTime || !eventEndTime) {
      return null
    }

    const point = series[hoveredIndex]
    const minValue = 1
    const maxValue = 99
    const range = maxValue - minValue
    const TOP_PADDING = 4
    const BOTTOM_PADDING = 4
    const CHART_HEIGHT = 100 - TOP_PADDING - BOTTOM_PADDING

    // Calculate X position
    const timeProgress = (point.time - eventStartTime) / (eventEndTime - eventStartTime)
    const x = Math.max(0, Math.min(100, timeProgress * 100))

    // Calculate Y positions for both UP and DOWN
    const upPricePercent = (point.upPrice - minValue) / range
    const upY = TOP_PADDING + (1 - upPricePercent) * CHART_HEIGHT

    const downPricePercent = (point.downPrice - minValue) / range
    const downY = TOP_PADDING + (1 - downPricePercent) * CHART_HEIGHT

    return { x, upY, downY, time: point.time }
  }, [hoveredIndex, series, eventStartTime, eventEndTime])

  // Handle mouse move over chart area
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current || !eventStartTime || !eventEndTime || series.length === 0) {
      return
    }

    const rect = chartContainerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const chartWidth = rect.width

    // Convert mouse position to time
    const timeProgress = mouseX / chartWidth
    const hoveredTime = eventStartTime + (eventEndTime - eventStartTime) * timeProgress

    // Find the closest data point
    let closestIndex = 0
    let closestDistance = Infinity

    series.forEach((point, index) => {
      const distance = Math.abs(point.time - hoveredTime)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    setHoveredIndex(closestIndex)
  }, [eventStartTime, eventEndTime, series])

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null)
  }, [])

  // Calculate trade bubble positions
  const tradeBubblePositions = useMemo(() => {
    if (!eventStartTime || !eventEndTime || recentTrades.length === 0) {
      return []
    }

    const minValue = 1
    const maxValue = 99
    const range = maxValue - minValue
    const TOP_PADDING = 4
    const BOTTOM_PADDING = 4
    const CHART_HEIGHT = 100 - TOP_PADDING - BOTTOM_PADDING

    return recentTrades.map((trade) => {
      // Calculate X position based on trade timestamp
      const timeProgress = Math.max(0, Math.min(1, (trade.timestamp - eventStartTime) / (eventEndTime - eventStartTime)))
      const x = timeProgress * 100

      // Calculate Y position based on trade price (in cents, 0-100)
      const pricePercent = (trade.price - minValue) / range
      const y = TOP_PADDING + (1 - pricePercent) * CHART_HEIGHT

      return { ...trade, x, y }
    })
  }, [recentTrades, eventStartTime, eventEndTime])

  // Format time for display
  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // Format date for display
  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  if (!market?.startTime || !market?.endTime) {
    return (
      <div className="w-full h-full bg-dark-bg text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-sm mb-3">Waiting for event data...</p>
          {market?.polymarketUrl && (
            <a
              href={market.polymarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors inline-block"
              title={`View market on Polymarket: ${market.slug || market.marketId || 'Market'}`}
            >
              View on Polymarket
            </a>
          )}
          {market?.marketId && !market?.polymarketUrl && (
            <p className="text-gray-500 text-xs mt-2">
              Market ID: {market.marketId}
            </p>
          )}
        </div>
      </div>
    )
  }

  const now = Date.now()
  const eventStarted = now >= market.startTime
  const eventEnded = now > market.endTime

  // For future markets (not started yet), show message
  if (!eventStarted && !isMarketEnded) {
    return (
      <div className="w-full h-full bg-dark-bg text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-sm">Event starts at {formatTime(market.startTime)}</p>
          <p className="text-gray-500 text-xs mt-1">{formatDate(market.startTime)}</p>
        </div>
      </div>
    )
  }

  // For past markets: Show chart with historical data (don't show "ended" message)
  // We check isMarketEnded which is set from the API response for offset markets
  // This allows viewing historical data for past markets

  return (
    <div className="w-full h-full bg-dark-bg text-white relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '100% 20%' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(90deg, #1a1a1a 1px, transparent 1px)', backgroundSize: '12.5% 100%' }} />
      </div>

      <div className="relative h-full flex flex-col p-4 gap-4">
        <div className="flex items-center justify-between text-xs sm:text-sm flex-shrink-0">
          <div>
            <div className="flex items-center gap-3">
            <p className="text-gray-400 uppercase tracking-widest">POLY ORDERBOOK</p>
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
            <p className="text-lg font-semibold">
              {selectedPair} • {isMarketEnded ? (
                <span className="text-gray-500">Historical</span>
              ) : (
                'Live Bid'
              )}
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            {/* Price Display */}
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-0.5" style={{ fontFamily: 'monospace' }}>
                  PRICE TO BEAT
              </div>
                <div className="text-base font-bold text-gray-300">
                  {btcPrice.lastCandleClose !== null ? (
                    `$${btcPrice.lastCandleClose.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  ) : (
                    'Loading...'
                  )}
              </div>
              </div>
              <div className="w-px h-10 bg-gray-700/50"></div>
              <div>
                <div className="text-xs uppercase tracking-wider mb-0.5" style={{ fontFamily: 'monospace', color: '#22c55e' }}>
                  CURRENT PRICE
                </div>
                <div className="text-base font-bold text-green-400">
                  {btcPrice.current !== null ? (
                    `$${btcPrice.current.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  ) : (
                    'Loading...'
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 relative min-h-0 mb-6">
          {upLinePath || downLinePath ? (
            <>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full absolute left-14 right-0 top-0 bottom-0" style={{ width: 'calc(100% - 56px)' }}>
                {/* UP line (green) */}
                {upLinePath && (
                  <path
                    d={upLinePath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="0.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {/* DOWN line (red) */}
                {downLinePath && (
                  <path
                    d={downLinePath}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="0.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Trade bubbles */}
                {tradeBubblePositions.map((trade) => (
                  <g key={trade.id}>
                    {/* Bubble circle - teal with 'B' for buy, 'S' for sell */}
                    <circle
                      cx={trade.x}
                      cy={trade.y}
                      r="1.5"
                      fill={trade.side.includes('bought') ? '#14b8a6' : '#ef4444'}
                      stroke="#ffffff"
                      strokeWidth="0.2"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredTradeId(trade.id)}
                      onMouseLeave={() => setHoveredTradeId(null)}
                    />
                    {/* Letter indicator */}
                    <text
                      x={trade.x}
                      y={trade.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize="1"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {trade.side.includes('bought') ? 'B' : 'S'}
                    </text>
                  </g>
                ))}
                
                {/* Vertical dotted crosshair line */}
                {hoveredPositions && (
                  <line
                    x1={hoveredPositions.x}
                    y1="0"
                    x2={hoveredPositions.x}
                    y2="100"
                    stroke="#6b7280"
                    strokeWidth="0.15"
                    strokeDasharray="1 1"
                    opacity="0.7"
                  />
                )}
              </svg>

              {/* Trade bubble tooltips - rendered outside SVG for better positioning */}
              {hoveredTradeId && (() => {
                const trade = tradeBubblePositions.find(t => t.id === hoveredTradeId)
                if (!trade || !chartContainerRef.current) return null

                const rect = chartContainerRef.current.getBoundingClientRect()
                const svgLeftOffset = 56 // left-14 = 56px
                const svgWidth = rect.width - svgLeftOffset
                const svgHeight = rect.height
                
                // Convert viewBox coordinates to pixel coordinates
                const pixelX = (trade.x / 100) * svgWidth + svgLeftOffset
                const pixelY = (trade.y / 100) * svgHeight

                return (
                  <div
                    className="absolute z-50 pointer-events-none"
                    style={{
                      left: `${pixelX + 8}px`,
                      top: `${pixelY - 40}px`,
                      transform: 'translateX(0)',
                    }}
                  >
                    <div className="bg-gray-700/95 border border-gray-600 rounded-lg px-3 py-2 shadow-lg">
                      <div className="text-white text-sm whitespace-nowrap">
                        <div>{trade.side} {trade.shares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {trade.outcome.toUpperCase()} at {trade.price.toFixed(0)}¢</div>
                        <div className="text-xs text-gray-300 mt-0.5">${trade.dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total</div>
                      </div>
                    </div>
                  </div>
                )
              })()}
              
              {/* Hover dots - rendered as HTML for proper circular shape */}
              {hoveredPositions && (
                <div 
                  className="absolute left-14 top-0 bottom-0 pointer-events-none"
                  style={{ width: 'calc(100% - 56px)' }}
                >
                  {/* UP price dot (green) */}
                  <div
                    className="absolute w-3 h-3 rounded-full bg-emerald-500 border-2 border-black"
                    style={{
                      left: `${hoveredPositions.x}%`,
                      top: `${hoveredPositions.upY}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                  {/* DOWN price dot (red) */}
                  <div
                    className="absolute w-3 h-3 rounded-full bg-red-500 border-2 border-black"
                    style={{
                      left: `${hoveredPositions.x}%`,
                      top: `${hoveredPositions.downY}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                </div>
              )}
              
              {/* Invisible hover area for mouse events - overlays the chart area */}
              <div
                ref={chartContainerRef}
                className="absolute left-14 right-0 top-0 bottom-0 cursor-crosshair"
                style={{ width: 'calc(100% - 56px)' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                role="img"
                aria-label="Price chart with hover interaction"
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-gray-500 text-sm">Loading chart data...</p>
            </div>
          )}

          {/* Y-axis labels (price) - Fixed range 1c to 99c */}
          {/* Labels positioned to match the 4% top and 4% bottom padding in the chart */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pl-1 text-[10px] text-gray-500" style={{ paddingTop: '4%', paddingBottom: '4%' }}>
            {Array.from({ length: 5 }).map((_, idx) => {
              // Fixed values: 99c, 75c, 50c, 25c, 1c
              // Position: top (99c), 25%, 50%, 75%, bottom (1c)
              const values = [99, 75, 50, 25, 1]
              const value = values[idx]
              return (
                <div key={idx} className="flex items-center gap-2 -translate-y-1/2 first:translate-y-0 last:translate-y-0">
                  <span className="block w-12 text-right font-semibold">{value}¢</span>
                  <span className="h-px flex-1 bg-gray-800/60" />
                </div>
              )
            })}
          </div>

          {/* X-axis labels (time) */}
          {eventStartTime && eventEndTime && (
            <div className="absolute left-14 right-2 -bottom-5 flex justify-between text-[10px] text-gray-500">
              {Array.from({ length: 5 }).map((_, idx) => {
                const timeProgress = idx / 4
                const timestamp = eventStartTime + (eventEndTime - eventStartTime) * timeProgress
                const timeLabel = formatTime(timestamp)
                return (
                  <span key={idx} className="font-semibold">
                    {timeLabel}
                  </span>
                )
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default PolyLineChart

