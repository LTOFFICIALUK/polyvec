'use client'

import { useCallback, useEffect, useState, useRef } from 'react'

interface UseCurrentMarketParams {
  pair: string
  timeframe: string
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
}

const defaultState: CurrentMarketData = { marketId: null }

const useCurrentMarket = ({ pair, timeframe }: UseCurrentMarketParams) => {
  const [market, setMarket] = useState<CurrentMarketData>(defaultState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousMarketIdRef = useRef<string | null>(null)

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
        `/api/current-markets?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`
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
      }

      // Check if market actually changed
      const marketChanged = previousMarketIdRef.current !== newMarket.marketId
      if (marketChanged && newMarket.marketId) {
        console.log(`[useCurrentMarket] Market changed: ${previousMarketIdRef.current} → ${newMarket.marketId}`)
      }

      previousMarketIdRef.current = newMarket.marketId
      setMarket(newMarket)
    } catch (err) {
      console.error('Error fetching current market:', err)
      setError(err instanceof Error ? err.message : 'Failed to load market')
      setMarket(defaultState)
    } finally {
      setLoading(false)
    }
  }, [pair, timeframe])

  // Initial fetch
  useEffect(() => {
    fetchCurrentMarket()
  }, [fetchCurrentMarket])

  // Set up automatic polling based on timeframe
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!pair || !timeframe) return

    // Determine polling interval based on timeframe
    // Poll more frequently than the market window to catch changes quickly
    // For 15m markets: poll every 2 minutes (catches new market within 2 min of change)
    // For 1h markets: poll every 5 minutes (catches new market within 5 min of change)
    const pollingInterval = timeframe.toLowerCase() === '15m' 
      ? 2 * 60 * 1000  // 2 minutes for 15m markets
      : 5 * 60 * 1000  // 5 minutes for 1h markets

    console.log(`[useCurrentMarket] Starting auto-refresh for ${pair} ${timeframe} (every ${pollingInterval / 1000}s)`)

    intervalRef.current = setInterval(() => {
      console.log(`[useCurrentMarket] Auto-refreshing market for ${pair} ${timeframe}`)
      fetchCurrentMarket()
    }, pollingInterval)

    // Cleanup on unmount or when pair/timeframe changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
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


