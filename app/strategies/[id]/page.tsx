'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useStrategy, fetchStrategyAnalytics, StrategyAnalytics } from '@/hooks/useStrategies'
import { useWallet } from '@/contexts/WalletContext'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function StrategyDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { walletAddress } = useWallet()
  const { strategy, analytics, trades, loading, error, refetch } = useStrategy(id)
  
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    if (strategy && walletAddress) {
      setIsOwner(strategy.userAddress.toLowerCase() === walletAddress.toLowerCase())
    }
  }, [strategy, walletAddress])

  const handleEdit = () => {
    router.push(`/strategies/new?edit=${id}`)
  }

  const handleBack = () => {
    router.push('/strategies')
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleString()
  }

  const formatPnl = (pnl?: number) => {
    if (pnl === undefined || pnl === null) return '$0.00'
    const formatted = Math.abs(pnl).toFixed(2)
    return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`
  }

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-primary mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Loading strategy...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !strategy) {
    return (
      <div className="bg-black text-white min-h-screen">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <div className="py-16 text-center">
            <p className="text-red-400 text-sm mb-4">{error || 'Strategy not found'}</p>
            <button
              type="button"
              onClick={handleBack}
              className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Back to Strategies
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-black text-white min-h-screen">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="Back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">{strategy.name}</h1>
              <p className="text-gray-400 text-sm mt-1">
                {strategy.asset} • {strategy.direction} • {strategy.timeframe}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              strategy.isActive 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              {strategy.isActive ? 'Active' : 'Inactive'}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              strategy.isLive 
                ? 'bg-purple-500/20 text-purple-400' 
                : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {strategy.isLive ? 'Live' : 'Paper'}
            </span>
            {isOwner && (
              <button
                type="button"
                onClick={handleEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Strategy Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {strategy.description && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-3">Description</h2>
                <p className="text-gray-400">{strategy.description}</p>
              </div>
            )}

            {/* Indicators */}
            {strategy.indicators && strategy.indicators.length > 0 && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-3">Indicators</h2>
                <div className="space-y-2">
                  {strategy.indicators.map((indicator, index) => (
                    <div key={indicator.id || index} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <span className="text-white font-medium">{indicator.type}</span>
                      <span className="text-gray-400 text-sm">
                        {Object.entries(indicator.parameters || {}).map(([key, value]) => `${key}: ${value}`).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conditions */}
            {strategy.conditions && strategy.conditions.length > 0 && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-3">
                  Conditions ({strategy.conditionLogic === 'all' ? 'All must match' : 'Any can match'})
                </h2>
                <div className="space-y-2">
                  {strategy.conditions.map((condition, index) => (
                    <div key={condition.id || index} className="py-2 border-b border-gray-800 last:border-0">
                      <span className="text-gray-300">
                        {condition.sourceA} {condition.operator} {condition.sourceB || condition.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Order Ladder */}
            {strategy.orderLadder && strategy.orderLadder.length > 0 && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-3">Order Ladder</h2>
                <div className="space-y-2">
                  {strategy.orderLadder.map((order, index) => (
                    <div key={order.id || index} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <span className="text-white">¢{order.price}</span>
                      <span className="text-gray-400">{order.shares} shares</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Settings */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-3">Risk Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {strategy.maxDailyLoss && (
                  <div>
                    <p className="text-gray-400 text-sm">Daily Loss Limit</p>
                    <p className="text-white font-medium">${strategy.maxDailyLoss}</p>
                  </div>
                )}
                {strategy.dailyTradeCap && (
                  <div>
                    <p className="text-gray-400 text-sm">Daily Trade Cap</p>
                    <p className="text-white font-medium">{strategy.dailyTradeCap} trades</p>
                  </div>
                )}
                {strategy.maxPositionShares && (
                  <div>
                    <p className="text-gray-400 text-sm">Max Position (Shares)</p>
                    <p className="text-white font-medium">{strategy.maxPositionShares}</p>
                  </div>
                )}
                {strategy.maxPositionDollar && (
                  <div>
                    <p className="text-gray-400 text-sm">Max Position ($)</p>
                    <p className="text-white font-medium">${strategy.maxPositionDollar}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Schedule */}
            {strategy.selectedDays && strategy.selectedDays.length > 0 && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-3">Schedule</h2>
                <div className="space-y-2">
                  <div>
                    <p className="text-gray-400 text-sm">Active Days</p>
                    <p className="text-white">{strategy.selectedDays.join(', ')}</p>
                  </div>
                  {strategy.timeRange && (
                    <div>
                      <p className="text-gray-400 text-sm">Time Range</p>
                      <p className="text-white">{strategy.timeRange.start} - {strategy.timeRange.end}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Trades */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-3">Recent Trades</h2>
              {trades && trades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 border-b border-gray-800">
                      <tr>
                        <th className="text-left py-2">Date</th>
                        <th className="text-left py-2">Side</th>
                        <th className="text-right py-2">Shares</th>
                        <th className="text-right py-2">Entry</th>
                        <th className="text-right py-2">PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 10).map((trade, index) => (
                        <tr key={trade.id || index} className="border-b border-gray-800 last:border-0">
                          <td className="py-2 text-gray-400">{formatDate(trade.executedAt)}</td>
                          <td className="py-2">
                            <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                              {trade.side.toUpperCase()} {trade.direction}
                            </span>
                          </td>
                          <td className="py-2 text-right text-white">{trade.shares}</td>
                          <td className="py-2 text-right text-gray-400">
                            {trade.entryPrice ? `¢${(trade.entryPrice * 100).toFixed(0)}` : '-'}
                          </td>
                          <td className={`py-2 text-right ${(trade.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPnl(trade.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No trades recorded yet</p>
              )}
            </div>
          </div>

          {/* Right Column - Analytics */}
          <div className="lg:col-span-1 space-y-6">
            {/* Performance Summary */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 sticky top-6">
              <h2 className="text-lg font-semibold mb-4">Performance</h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black border border-gray-800 rounded p-3">
                    <p className="text-xs text-gray-400 mb-1">Total Trades</p>
                    <p className="text-xl font-bold text-white">{analytics?.totalTrades || 0}</p>
                  </div>
                  <div className="bg-black border border-gray-800 rounded p-3">
                    <p className="text-xs text-gray-400 mb-1">Win Rate</p>
                    <p className="text-xl font-bold text-green-400">{analytics?.winRate?.toFixed(1) || 0}%</p>
                  </div>
                </div>

                <div className="bg-black border border-gray-800 rounded p-3">
                  <p className="text-xs text-gray-400 mb-1">Total PnL</p>
                  <p className={`text-2xl font-bold ${(analytics?.totalPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPnl(analytics?.totalPnl)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black border border-gray-800 rounded p-3">
                    <p className="text-xs text-gray-400 mb-1">Best Trade</p>
                    <p className="text-lg font-bold text-green-400">{formatPnl(analytics?.bestTrade)}</p>
                  </div>
                  <div className="bg-black border border-gray-800 rounded p-3">
                    <p className="text-xs text-gray-400 mb-1">Worst Trade</p>
                    <p className="text-lg font-bold text-red-400">{formatPnl(analytics?.worstTrade)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black border border-gray-800 rounded p-3">
                    <p className="text-xs text-gray-400 mb-1">Profit Factor</p>
                    <p className="text-lg font-bold text-white">{analytics?.profitFactor?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="bg-black border border-gray-800 rounded p-3">
                    <p className="text-xs text-gray-400 mb-1">Max Drawdown</p>
                    <p className="text-lg font-bold text-red-400">{analytics?.maxDrawdownPercent?.toFixed(1) || 0}%</p>
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-4">
                  <p className="text-xs text-gray-400 mb-2">Today</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Trades</p>
                      <p className="text-white font-medium">{analytics?.tradesToday || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">PnL</p>
                      <p className={`font-medium ${(analytics?.pnlToday || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPnl(analytics?.pnlToday)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="border-t border-gray-800 mt-6 pt-4">
                <p className="text-xs text-gray-500">Created: {formatDate(strategy.createdAt)}</p>
                <p className="text-xs text-gray-500">Updated: {formatDate(strategy.updatedAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
