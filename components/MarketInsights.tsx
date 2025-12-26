'use client'

import { useState, useEffect } from 'react'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'

interface OrderbookPrices {
  upBestBid: number | null
  upBestAsk: number | null
  downBestBid: number | null
  downBestAsk: number | null
}

interface MarketQuality {
  sampleSize: number
  outcomeDistribution: {
    upPercent: number
    downPercent: number
  }
  chopRate: number
  avgPeakMove: number
  volumeRatio: number
  verdict: 'Tradable' | 'Neutral' | 'Low Quality'
}

interface PersonalFit {
  winRateAsset: number | null
  winRateTimeframe: number | null
  avgPnLSimilar: number | null
  overtradeWarning: string | null
}

interface MarketInsightsData {
  marketQuality: MarketQuality
  personalFit: PersonalFit | null
}

const MarketInsights = () => {
  const { selectedPair, selectedTimeframe, activeTokenId, marketOffset } = useTradingContext()
  const { market } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    offset: marketOffset,
  })
  const [orderbookPrices, setOrderbookPrices] = useState<OrderbookPrices>({
    upBestBid: null,
    upBestAsk: null,
    downBestBid: null,
    downBestAsk: null,
  })
  const [openOdds, setOpenOdds] = useState<number | null>(null)
  const [insights, setInsights] = useState<MarketInsightsData | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [lastMarketId, setLastMarketId] = useState<string | null>(null)

  const isMarketEnded = market?.isPast === true || market?.marketStatus === 'ended'

  // Reset open odds when market changes
  useEffect(() => {
    if (market?.marketId && market.marketId !== lastMarketId) {
      setOpenOdds(null)
      setLastMarketId(market.marketId)
      setInsights(null) // Clear old insights when market changes
      setIsInitialLoad(true) // Show loading only on market change
    }
  }, [market?.marketId, lastMarketId])

  // Fetch market insights - preload immediately and auto-update seamlessly
  useEffect(() => {
    const fetchInsights = async (isUpdate = false) => {
      if (isMarketEnded || !market?.marketId || !selectedPair || !selectedTimeframe) {
        if (!isUpdate) {
          setInsights(null)
          setIsInitialLoad(false)
        }
        return
      }

      try {
        // Build params (timing context removed - only need market quality)
        const params = new URLSearchParams({
          marketId: market.marketId,
          asset: selectedPair.toUpperCase(),
          timeframe: selectedTimeframe,
        })

        const response = await fetch(`/api/market-insights?${params.toString()}`)
        
        if (response.ok) {
          const data = await response.json()
          setInsights(data)
          setIsInitialLoad(false) // Mark as loaded once we have data
        } else {
          console.error('Failed to fetch market insights')
          if (!isUpdate) {
            setInsights(null)
            setIsInitialLoad(false)
          }
        }
      } catch (err) {
        console.error('Error fetching market insights:', err)
        if (!isUpdate) {
          setInsights(null)
          setIsInitialLoad(false)
        }
      }
    }

    // Fetch immediately when market data is available (don't wait for orderbook)
    if (market?.marketId && selectedPair && selectedTimeframe) {
      fetchInsights(false) // Initial load
    }

    // Set up auto-refresh every 1 second for active markets (silent updates)
    // Only updates fast-changing fields (volume ratio, timing context) - base stats stay cached
    if (!isMarketEnded && market?.marketId) {
      const interval = setInterval(() => {
        fetchInsights(true) // Silent update - keeps showing old data, only updates timing/volume
      }, 1000) // Update every 1 second for real-time feel
      return () => clearInterval(interval)
    }
  }, [
    market?.marketId,
    market?.startTime,
    market?.endTime,
    selectedPair,
    selectedTimeframe,
    isMarketEnded,
  ])

  // Fetch orderbook prices immediately and auto-update (non-blocking)
  useEffect(() => {
    const fetchOrderbookPrices = async () => {
      if (!market?.yesTokenId || !market?.noTokenId) return

      try {
        const [upResponse, downResponse] = await Promise.all([
          fetch(`/api/polymarket/orderbook?tokenId=${market.yesTokenId}`),
          fetch(`/api/polymarket/orderbook?tokenId=${market.noTokenId}`),
        ])

        if (upResponse.ok && downResponse.ok) {
          const upData = await upResponse.json()
          const downData = await downResponse.json()

          const upBestBid = upData.bids?.[0]?.price ? parseFloat(upData.bids[0].price) * 100 : null
          const upBestAsk = upData.asks?.[0]?.price ? parseFloat(upData.asks[0].price) * 100 : null
          const downBestBid = downData.bids?.[0]?.price ? parseFloat(downData.bids[0].price) * 100 : null
          const downBestAsk = downData.asks?.[0]?.price ? parseFloat(downData.asks[0].price) * 100 : null

          // Store open odds on first fetch (only if not already set)
          if (openOdds === null && upBestBid !== null && upBestAsk !== null) {
            setOpenOdds((upBestBid + upBestAsk) / 2)
          }

          setOrderbookPrices({
            upBestBid,
            upBestAsk,
            downBestBid,
            downBestAsk,
          })
        }
      } catch (err) {
        console.error('Error fetching orderbook prices for insights:', err)
      }
    }

    // Fetch immediately when market tokens are available (non-blocking)
    if (market?.yesTokenId && market?.noTokenId) {
    fetchOrderbookPrices()
    }

    // For ended markets, only fetch once. For active markets, poll every 2 seconds
    if (!isMarketEnded && market?.yesTokenId && market?.noTokenId) {
      const interval = setInterval(fetchOrderbookPrices, 2000)
      return () => clearInterval(interval)
    }
  }, [market?.yesTokenId, market?.noTokenId, isMarketEnded, openOdds])

  // Get verdict color
  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'Tradable':
        return 'text-green-400'
      case 'Low Quality':
        return 'text-red-400'
      default:
        return 'text-yellow-400'
    }
  }

  const getVerdictEmoji = (verdict: string) => {
    switch (verdict) {
      case 'Tradable':
        return '🟢'
      case 'Low Quality':
        return '🔴'
      default:
        return '🟡'
    }
  }

  // Show Market Insights for active markets
  if (isMarketEnded) {
    return (
      <div className="p-4 space-y-3">
        <div className="bg-dark-bg/40 border border-gray-700/30 rounded p-2">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Market Ended</p>
          <p className="text-sm font-semibold text-white">This market has closed</p>
        </div>
      </div>
    )
  }

  // Only show loading on initial load when we have no data
  if (isInitialLoad && !insights) {
    return (
      <div className="p-4 space-y-3">
        <div className="bg-dark-bg/40 border border-gray-700/30 rounded p-2">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Loading Insights</p>
          <p className="text-sm font-semibold text-white">Analyzing market data...</p>
        </div>
      </div>
    )
  }

  // If no insights after initial load attempt, show empty state
  if (!insights && !isInitialLoad) {
  return (
    <div className="p-4 space-y-3">
        <div className="bg-dark-bg/40 border border-gray-700/30 rounded p-2">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider">No Insights Available</p>
          <p className="text-sm font-semibold text-white">Market data is being analyzed...</p>
        </div>
      </div>
    )
  }

  // If we have insights, always show them (even if updating in background)
  if (!insights) {
    return null
  }

  const { marketQuality, personalFit } = insights

  return (
    <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
      {/* A. Market Quality - Top, Always Visible */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Market Quality</h3>
        <div className="bg-dark-bg/40 border border-gray-700/30 rounded p-3 space-y-2">
          {/* Verdict */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Verdict</span>
            <span className={`text-sm font-semibold ${getVerdictColor(marketQuality.verdict)}`}>
              {getVerdictEmoji(marketQuality.verdict)} {marketQuality.verdict}
            </span>
          </div>

          {/* Sample Size */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Sample size</span>
            <span className="text-sm font-medium text-white">
              Last {marketQuality.sampleSize} similar markets
            </span>
      </div>

          {/* Outcome Distribution */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Outcome distribution</span>
            <span className="text-sm font-medium text-white">
              UP {marketQuality.outcomeDistribution.upPercent.toFixed(1)}% | DOWN {marketQuality.outcomeDistribution.downPercent.toFixed(1)}%
            </span>
        </div>


        </div>
      </div>

      {/* C. Personal Fit - Only show if there's actual data */}
      {personalFit && (
        personalFit.winRateAsset !== null || 
        personalFit.winRateTimeframe !== null || 
        personalFit.avgPnLSimilar !== null || 
        personalFit.overtradeWarning
      ) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Personal Fit</h3>
          <div className="bg-dark-bg/40 border border-gray-700/30 rounded p-3 space-y-2">
            {/* Win Rate Asset */}
            {personalFit.winRateAsset !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Win rate (this asset)</span>
                <span className="text-sm font-medium text-white">
                  {personalFit.winRateAsset.toFixed(1)}%
                </span>
              </div>
            )}

            {/* Win Rate Timeframe */}
            {personalFit.winRateTimeframe !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Win rate (this timeframe)</span>
                <span className="text-sm font-medium text-white">
                  {personalFit.winRateTimeframe.toFixed(1)}%
                </span>
              </div>
            )}

            {/* Avg PnL Similar */}
            {personalFit.avgPnLSimilar !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Avg PnL (similar markets)</span>
                <span className={`text-sm font-medium ${
                  personalFit.avgPnLSimilar > 0 ? 'text-green-400' : 
                  personalFit.avgPnLSimilar < 0 ? 'text-red-400' : 
                  'text-white'
                }`}>
                  ${personalFit.avgPnLSimilar.toFixed(2)}
                </span>
              </div>
            )}

            {/* Overtrade Warning */}
            {personalFit.overtradeWarning && (
              <div className="mt-2 p-2 bg-yellow-500/20 border border-yellow-500/30 rounded">
                <p className="text-xs text-yellow-400 font-medium">
                  ⚠️ {personalFit.overtradeWarning}
          </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* D. Footer Disclaimer */}
      <div className="pt-2 border-t border-gray-700/30">
        <p className="text-xs text-gray-500 text-center">
          Insights are historical context — not predictions.
        </p>
      </div>
    </div>
  )
}

export default MarketInsights

