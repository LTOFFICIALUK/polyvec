'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@/contexts/WalletContext'
import Link from 'next/link'

interface PolymarketTrade {
  id: string
  taker_order_id?: string
  market: string
  asset_id: string
  side: 'BUY' | 'SELL'
  size: string
  fee_rate_bps?: string
  price: string
  status: string
  match_time: string
  last_update?: string
  outcome: string
  title: string
  slug?: string
  icon?: string
  owner: string
  maker_address?: string
  transaction_hash?: string
  bucket_index?: number
  type?: string
}

interface ClosedPosition {
  proxyWallet: string
  asset: string
  conditionId: string
  avgPrice: number
  totalBought: number
  realizedPnl: number
  curPrice: number
  timestamp: number
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
  outcomeIndex: number
  oppositeOutcome: string
  oppositeAsset: string
  endDate: string
}

interface DisplayTrade {
  id: string
  timestamp: string
  market: string
  title: string
  side: string
  sideColor: string
  shares: number
  price: number
  priceDisplay: string
  totalCost: string
  pnl: string
  pnlValue: number
  pnlColor: string
  status: 'Open' | 'Closed'
  outcome: string
  transactionHash?: string
}

export default function HistoryPage() {
  const { walletAddress, isConnected } = useWallet()
  const [trades, setTrades] = useState<DisplayTrade[]>([])
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'trades' | 'positions'>('trades')
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const formatTimestamp = (timestamp: string | number | null | undefined): string => {
    // Handle null, undefined, or empty values
    if (timestamp === null || timestamp === undefined) {
      return 'N/A'
    }
    
    // Handle string values - trim whitespace
    let processedTimestamp = timestamp
    if (typeof timestamp === 'string') {
      processedTimestamp = timestamp.trim()
      if (processedTimestamp === '' || processedTimestamp === 'null' || processedTimestamp === 'undefined') {
        return 'N/A'
      }
    }
    
    let date: Date
    
    if (typeof processedTimestamp === 'number') {
      // If it's a number, check if it's in seconds or milliseconds
      date = processedTimestamp > 1000000000000 ? new Date(processedTimestamp) : new Date(processedTimestamp * 1000)
    } else if (typeof processedTimestamp === 'string') {
      // Try parsing as ISO string first (most common format)
      date = new Date(processedTimestamp)
      
      // If that fails, try parsing as a number (timestamp string)
      if (isNaN(date.getTime())) {
        const numTimestamp = parseFloat(processedTimestamp)
        if (!isNaN(numTimestamp) && isFinite(numTimestamp)) {
          date = numTimestamp > 1000000000000 ? new Date(numTimestamp) : new Date(numTimestamp * 1000)
        }
      }
    } else {
      return 'N/A'
    }
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      // Only log in development to avoid console spam
      if (process.env.NODE_ENV === 'development') {
        console.warn('[formatTimestamp] Invalid date:', timestamp, 'processed:', processedTimestamp)
      }
      return 'N/A'
    }
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatPrice = (price: string | number): string => {
    const priceNum = typeof price === 'string' ? parseFloat(price) : price
    const cents = Math.round(priceNum * 100)
    return `${cents}¢`
  }

  const transformTrade = (trade: PolymarketTrade): DisplayTrade => {
    const price = parseFloat(trade.price)
    const size = parseFloat(trade.size)
    const totalCost = price * size

    const isBuy = trade.side === 'BUY'
    const isYes = trade.outcome?.toLowerCase() === 'yes'
    
    let sideDisplay: string
    let sideColor: string

    // For "Up or Down" markets: Yes = UP, No = DOWN
    if (isBuy && isYes) {
      sideDisplay = 'Buy UP'
      sideColor = 'text-green-400'
    } else if (isBuy && !isYes) {
      sideDisplay = 'Buy DOWN'
      sideColor = 'text-red-400'
    } else if (!isBuy && isYes) {
      sideDisplay = 'Sell UP'
      sideColor = 'text-red-400'
    } else {
      sideDisplay = 'Sell DOWN'
      sideColor = 'text-green-400'
    }

    // Use match_time, fallback to last_update if match_time is missing
    const timestampValue = trade.match_time || (trade as any).last_update || (trade as any).timestamp

    return {
      id: trade.id,
      timestamp: formatTimestamp(timestampValue),
      market: trade.market,
      title: trade.title || 'Unknown Market',
      side: sideDisplay,
      sideColor,
      shares: size,
      price: price,
      priceDisplay: formatPrice(price),
      totalCost: `$${totalCost.toFixed(2)}`,
      pnl: '-',
      pnlValue: 0,
      pnlColor: 'text-gray-400',
      status: 'Open',
      outcome: trade.outcome,
      transactionHash: trade.transaction_hash,
    }
  }

  const fetchTrades = useCallback(async (newOffset: number = 0) => {
    if (!walletAddress) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/user/trades?address=${walletAddress}&limit=${limit}&offset=${newOffset}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch trades')
      }

      const data = await response.json()
      const transformedTrades = (data.trades || []).map(transformTrade)

      if (newOffset === 0) {
        setTrades(transformedTrades)
      } else {
        setTrades((prev) => [...prev, ...transformedTrades])
      }

      setHasMore(data.trades?.length === limit)
      setOffset(newOffset)
    } catch (err) {
      console.error('Error fetching trades:', err)
      setError('Failed to load trade history. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [walletAddress, limit])

  const fetchClosedPositions = useCallback(async () => {
    if (!walletAddress) return

    try {
      const response = await fetch(
        `/api/user/closed-positions?address=${walletAddress}&limit=50`
      )

      if (response.ok) {
        const data = await response.json()
        setClosedPositions(data.positions || [])
      }
    } catch (err) {
      console.error('Error fetching closed positions:', err)
    }
  }, [walletAddress])

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchTrades(0)
      fetchClosedPositions()
    } else {
      setTrades([])
      setClosedPositions([])
      setLoading(false)
    }
  }, [isConnected, walletAddress, fetchTrades, fetchClosedPositions])

  const handleLoadMore = () => {
    fetchTrades(offset + limit)
  }

  // Not connected state
  if (!isConnected) {
    return (
      <div className="bg-dark-bg text-white flex-1">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Trading History</h1>
          <div className="py-16 text-center">
            <h2 className="text-base font-medium text-gray-400 mb-1">Wallet Not Connected</h2>
            <p className="text-sm text-gray-500">
              Connect your wallet to view your trading history.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-bg text-white flex-1">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Trading History</h1>
            <p className="text-sm text-gray-400 mt-1">
              Your complete trading activity on Polymarket
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/profile/${walletAddress}`}
              className="px-4 py-2 bg-gold-primary hover:bg-gold-hover text-white rounded text-sm font-medium transition-colors"
            >
              View Profile
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 mb-6">
          <button
            onClick={() => setActiveTab('trades')}
            className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'trades' ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            All Trades ({trades.length})
            {activeTab === 'trades' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('positions')}
            className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'positions' ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Closed Positions ({closedPositions.length})
            {activeTab === 'positions' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
            )}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => fetchTrades(0)}
              className="text-red-400 hover:text-red-300 text-sm underline mt-2"
            >
              Try again
            </button>
          </div>
        )}

        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <>
            {loading && trades.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <svg className="w-12 h-12 animate-spin text-gold-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-gray-400">Loading your trades...</p>
                </div>
              </div>
            ) : trades.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500">
                  You haven&apos;t made any trades on Polymarket yet.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 border-b border-gray-800">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium">Time</th>
                        <th className="text-left py-3 px-4 font-medium">Market</th>
                        <th className="text-left py-3 px-4 font-medium">Side</th>
                        <th className="text-right py-3 px-4 font-medium">Shares</th>
                        <th className="text-right py-3 px-4 font-medium">Price</th>
                        <th className="text-right py-3 px-4 font-medium">Total</th>
                        <th className="text-right py-3 px-4 font-medium">Tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade) => (
                        <tr
                          key={trade.id}
                          className="border-b border-gray-800 hover:bg-gray-900/30 transition-colors"
                        >
                          <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{trade.timestamp}</td>
                          <td className="py-3 px-4">
                            <div className="max-w-xs">
                              <div className="text-white font-medium truncate" title={trade.title}>
                                {trade.title}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`font-medium ${trade.sideColor}`}>{trade.side}</span>
                          </td>
                          <td className="py-3 px-4 text-right text-white font-mono">
                            {trade.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-white font-mono">
                            {trade.priceDisplay}
                          </td>
                          <td className="py-3 px-4 text-right text-white font-mono">
                            {trade.totalCost}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {trade.transactionHash ? (
                              <a
                                href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gold-primary hover:text-gold-hover transition-colors"
                                title="View on PolygonScan"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={handleLoadMore}
                      disabled={loading}
                      className="px-6 py-2 bg-gray-900 border border-gray-800 rounded text-sm text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Closed Positions Tab */}
        {activeTab === 'positions' && (
          <>
            {closedPositions.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500">
                  You don&apos;t have any closed positions yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium">Closed</th>
                      <th className="text-left py-3 px-4 font-medium">Market</th>
                      <th className="text-left py-3 px-4 font-medium">Outcome</th>
                      <th className="text-right py-3 px-4 font-medium">Avg Price</th>
                      <th className="text-right py-3 px-4 font-medium">Total Bought</th>
                      <th className="text-right py-3 px-4 font-medium">Realized PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((position, index) => {
                      const pnl = position.realizedPnl
                      const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      const pnlDisplay = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`

                      return (
                        <tr
                          key={`${position.conditionId}-${index}`}
                          className="border-b border-gray-800 hover:bg-gray-900/30 transition-colors"
                        >
                          <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                            {formatTimestamp(position.timestamp)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="max-w-xs">
                              <div className="text-white font-medium truncate" title={position.title}>
                                {position.title}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={position.outcome === 'Yes' ? 'text-green-400' : 'text-red-400'}>
                              {position.outcome === 'Yes' ? 'UP' : 'DOWN'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-white font-mono">
                            {formatPrice(position.avgPrice)}
                          </td>
                          <td className="py-3 px-4 text-right text-white font-mono">
                            ${position.totalBought.toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-semibold ${pnlColor}`}>
                            {pnlDisplay}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Summary Stats */}
        {(trades.length > 0 || closedPositions.length > 0) && (
          <div className="mt-8 pt-6 border-t border-gray-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-dark-bg/60 rounded-lg p-4 border border-gray-800">
                <div className="text-xs text-gray-400 mb-1">Total Trades</div>
                <div className="text-white font-bold text-2xl">{trades.length}</div>
              </div>
              <div className="bg-dark-bg/60 rounded-lg p-4 border border-gray-800">
                <div className="text-xs text-gray-400 mb-1">Closed Positions</div>
                <div className="text-white font-bold text-2xl">{closedPositions.length}</div>
              </div>
              <div className="bg-dark-bg/60 rounded-lg p-4 border border-gray-800">
                <div className="text-xs text-gray-400 mb-1">Total Realized PnL</div>
                <div className={`font-bold text-2xl ${
                  closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0) >= 0
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}>
                  {closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0) >= 0 ? '+' : ''}
                  ${closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-dark-bg/60 rounded-lg p-4 border border-gray-800">
                <div className="text-xs text-gray-400 mb-1">Avg Position Size</div>
                <div className="text-white font-bold text-2xl">
                  ${closedPositions.length > 0
                    ? (closedPositions.reduce((sum, p) => sum + p.totalBought, 0) / closedPositions.length).toFixed(2)
                    : '0.00'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
