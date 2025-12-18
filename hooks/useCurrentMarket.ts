'use client'

import { useCallback, useEffect, useState, useRef } from 'react'

interface UseCurrentMarketParams {
  pair: string
  timeframe: string
  offset?: number // Market offset: 0 = current, -1 = previous, +1 = next
}

export interface CurrentMarketData {
  marketId: string | null
  question?: string | null
  startTime?: number | null
  endTime?: number | null
  slug?: string | null
  yesTokenId?: string | null
  noTokenId?: string | null
  tokenId?: string | null
  polymarketUrl?: string | null
  // Market status fields (for past/future markets)
  marketStatus?: 'ended' | 'upcoming' | 'live' | null
  isPast?: boolean
  isFuture?: boolean
  isLive?: boolean
  offset?: number
}

const defaultState: CurrentMarketData = { marketId: null }

const useCurrentMarket = ({ pair, timeframe, offset = 0 }: UseCurrentMarketParams) => {
  const [market, setMarket] = useState<CurrentMarketData>(defaultState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const previousMarketIdRef = useRef<string | null>(null)
  const fetchCurrentMarketRef = useRef<() => Promise<void>>()

  // Schedule refresh exactly when market window ends
  const scheduleRefreshAtMarketEnd = useCallback((endTime: number) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    const now = Date.now()
    const timeUntilEnd = endTime - now

    // Only schedule if end time is in the future and within reasonable range (0 to 1 hour)
    if (timeUntilEnd > 0 && timeUntilEnd <= 60 * 60 * 1000) {
      const endDate = new Date(endTime)
      
      timeoutRef.current = setTimeout(() => {
        if (fetchCurrentMarketRef.current) {
          fetchCurrentMarketRef.current()
        }
      }, timeUntilEnd)
    } else if (timeUntilEnd <= 0) {
      // Market already ended, refresh immediately
      if (fetchCurrentMarketRef.current) {
        fetchCurrentMarketRef.current()
      }
    }
  }, [])

  const fetchCurrentMarket = useCallback(async () => {
    if (!pair || !timeframe) {
      setMarket(defaultState)
      setLoading(false)
      setError('Missing pair or timeframe')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Use the Next.js API proxy which talks to the ws-service.
      // This keeps all environment/URL config on the server side.
      const response = await fetch(
        `/api/current-markets?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}&offset=${offset}`
      )

      if (!response.ok) {
        throw new Error('Failed to find current active market')
      }

      const currentMarket = await response.json()

      const newMarket = {
        marketId: currentMarket.marketId ?? null,
        question: currentMarket.question ?? null,
        startTime: currentMarket.startTime ?? null,
        endTime: currentMarket.endTime ?? null,
        slug: currentMarket.slug ?? null,
        yesTokenId: currentMarket.yesTokenId ?? currentMarket.tokenId ?? null,
        noTokenId: currentMarket.noTokenId ?? null,
        tokenId: currentMarket.tokenId ?? null,
        polymarketUrl: currentMarket.slug ? `https://polymarket.com/event/${currentMarket.slug}` : null,
        // Market status fields (for past/future markets)
        marketStatus: currentMarket.marketStatus ?? null,
        isPast: currentMarket.isPast ?? false,
        isFuture: currentMarket.isFuture ?? false,
        isLive: currentMarket.isLive ?? true, // Default to live if not specified
        offset: currentMarket.offset ?? 0,
      }

      // Check if market actually changed
      const marketChanged = previousMarketIdRef.current !== newMarket.marketId
      if (marketChanged && newMarket.marketId) {
      }

      previousMarketIdRef.current = newMarket.marketId
      setMarket(newMarket)
      
      // Schedule refresh at market end time if we have endTime
      if (newMarket.endTime && offset === 0) {
        scheduleRefreshAtMarketEnd(newMarket.endTime)
      }
    } catch (err) {
      console.error('Error fetching current market:', err)
      setError(err instanceof Error ? err.message : 'Failed to load market')
      setMarket(defaultState)
    } finally {
      setLoading(false)
    }
  }, [pair, timeframe, offset, scheduleRefreshAtMarketEnd])

  // Store fetch function in ref so scheduleRefreshAtMarketEnd can call it
  useEffect(() => {
    fetchCurrentMarketRef.current = fetchCurrentMarket
  }, [fetchCurrentMarket])

  // Initial fetch
  useEffect(() => {
    fetchCurrentMarket()
  }, [fetchCurrentMarket])

  // Set up automatic polling as fallback (shorter interval for safety)
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!pair || !timeframe) return

    // Use shorter polling interval as fallback (30 seconds for 15m, 1 minute for 1h)
    // This ensures we catch market changes even if the timeout doesn't fire
    const pollingInterval = timeframe.toLowerCase() === '15m' 
      ? 30 * 1000  // 30 seconds for 15m markets (fallback)
      : 60 * 1000  // 1 minute for 1h markets (fallback)


    intervalRef.current = setInterval(() => {
      // Fallback polling - always run as safety net
      // The timeout-based refresh is primary, but this ensures we catch changes
      // even if the timeout doesn't fire or endTime is missing
      fetchCurrentMarket()
    }, pollingInterval)

    // Cleanup on unmount or when pair/timeframe changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [pair, timeframe, fetchCurrentMarket])

  return {
    market,
    loading,
    error,
    refetch: fetchCurrentMarket,
  }
}

export default useCurrentMarket


