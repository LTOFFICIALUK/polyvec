'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'
import AnimatedPrice from './AnimatedPrice'

interface ChartPoint {
  time: number
  upPrice: number
  downPrice: number
}

const PolyLineChart = () => {
  const { selectedPair, selectedTimeframe, marketOffset } = useTradingContext()
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

  // Fetch historical price data from database
  const fetchHistoricalData = useCallback(async (): Promise<ChartPoint[]> => {
    if (!market?.marketId || !market?.startTime || !market?.endTime) {
      return []
    }

    try {
      const now = Date.now()
      const eventStartTime = market.startTime
      const eventEndTime = Math.min(market.endTime, now) // Don't fetch future data

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

      console.log(`[PolyLineChart] Fetched ${historicalData.length} historical data points`)
      
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
          console.log(`[PolyLineChart] UP bids: ${bids.length}, best=${bestBid.price}, last=${bids[bids.length-1]?.price}`)
          
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
          console.log(`[PolyLineChart] DOWN bids: ${bids.length}, best=${bestBid.price}, last=${bids[bids.length-1]?.price}`)
          
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

  // Keep fetchPrices ref updated for use in worker callback
  useEffect(() => {
    fetchPricesRef.current = fetchPrices
  }, [fetchPrices])

  // Update chart data every second using Web Worker (avoids background tab throttling)
  useEffect(() => {
    // Check if market changed
    const marketChanged = previousMarketIdRef.current !== null && previousMarketIdRef.current !== market?.marketId
    if (marketChanged && market?.marketId) {
      console.log(`[PolyLineChart] Market changed: ${previousMarketIdRef.current} → ${market.marketId}, resetting chart`)
      setSeries([])
      historyFetchedRef.current = null // Reset history fetch flag for new market
    }
    previousMarketIdRef.current = market?.marketId ?? null

    // Only start charting if we have event start/end times
    if (!market?.startTime || !market?.endTime) {
      setSeries([])
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' })
        workerRef.current.terminate()
        workerRef.current = null
      }
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
      const currentMarketKey = market?.marketId ? `${market.marketId}-${market.startTime}-past` : null
      if (currentMarketKey && historyFetchedRef.current !== currentMarketKey) {
        historyFetchedRef.current = currentMarketKey
        console.log('[PolyLineChart] Fetching historical data for PAST market...')
        
        // For past markets, fetch for the full event window
        const fetchPastMarketData = async () => {
          try {
            const params = new URLSearchParams({
              marketId: market.marketId!,
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

            console.log(`[PolyLineChart] Loaded ${historicalData.length} points for past market`)
            
            if (historicalData.length > 0) {
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
    const currentMarketKey = market?.marketId ? `${market.marketId}-${market.startTime}` : null
    const shouldFetchHistory = (currentMarketKey && historyFetchedRef.current !== currentMarketKey)

    if (shouldFetchHistory && currentMarketKey) {
      historyFetchedRef.current = currentMarketKey
      console.log('[PolyLineChart] Fetching historical data for LIVE market...')
      fetchHistoricalData().then((historicalData) => {
        if (historicalData.length > 0) {
          console.log(`[PolyLineChart] Pre-populating chart with ${historicalData.length} historical points`)
          setSeries(historicalData)
        } else {
          console.log('[PolyLineChart] No historical data available, starting fresh')
        }
      }).catch((error) => {
        console.error('[PolyLineChart] Error loading historical data:', error)
      })
    }

    // Update chart with current prices (LIVE market only)
    const updateChart = async () => {
      if (!fetchPricesRef.current) return
      
      const { upPrice, downPrice } = await fetchPricesRef.current()
      if (upPrice === null && downPrice === null) return

      const currentTime = Date.now()
      
      setSeries((prev) => {
        // Filter out points outside the event window or from different markets
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
        if (lastPoint && Math.abs(lastPoint.time - currentTime) < 500) {
          // Update existing point if it's within 500ms
          return filtered.slice(0, -1).concat([newPoint])
        }

        // Add new point, keeping only points within event window
        const updated = [...filtered, newPoint].filter(
          (point) => point.time >= eventStartTime && point.time <= eventEndTime
        )
        
        return updated
      })
    }

    // Initial fetch
    updateChart()

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
        console.log('[PolyLineChart] Started Web Worker for background-safe updates')
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
      <div className="w-full h-full bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-sm">Waiting for event data...</p>
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
      <div className="w-full h-full bg-black text-white flex items-center justify-center">
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
    <div className="w-full h-full bg-black text-white relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '100% 20%' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(90deg, #1a1a1a 1px, transparent 1px)', backgroundSize: '12.5% 100%' }} />
      </div>

      <div className="relative h-full flex flex-col p-4 gap-4">
        <div className="flex items-center justify-between text-xs sm:text-sm flex-shrink-0">
          <div>
            <p className="text-gray-400 uppercase tracking-widest">POLY ORDERBOOK</p>
            <p className="text-lg font-semibold">
              {selectedPair} • {isMarketEnded ? (
                <span className="text-gray-500">Historical</span>
              ) : (
                'Live Bid'
              )}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {displayUpPrice !== null && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-green-400 font-semibold">
                  UP{' '}
                  <>
                    <AnimatedPrice
                      value={displayUpPrice}
                      format={(val) => Math.round(val).toString()}
                    />
                    ¢
                  </>
                </span>
              </div>
            )}
            {displayDownPrice !== null && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-400 font-semibold">
                  DOWN{' '}
                  <>
                    <AnimatedPrice
                      value={displayDownPrice}
                      format={(val) => Math.round(val).toString()}
                    />
                    ¢
                  </>
                </span>
              </div>
            )}
            {hoveredPoint && (
              <span className="text-gray-500 text-xs ml-2">
                {formatTime(hoveredPoint.time)}
              </span>
            )}
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

