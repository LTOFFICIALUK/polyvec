'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useStrategy } from '@/hooks/useStrategies'
import { useWallet } from '@/contexts/WalletContext'

export default function StrategyDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const { walletAddress } = useWallet()
  const { strategy, analytics, trades, loading, error } = useStrategy(id)
  
  const [isOwner, setIsOwner] = useState(false)
  const [activeTab, setActiveTab] = useState<'basics' | 'tradingview' | 'polymarket' | 'risk' | 'schedule' | 'trades'>('basics')

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
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
  }

  const formatPnl = (pnl?: number) => {
    if (pnl === undefined || pnl === null) return '$0.00'
    const formatted = Math.abs(pnl).toFixed(2)
    return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`
  }

  const formatOrderSizeMode = (mode?: string) => {
    switch (mode) {
      case 'fixed_dollar': return 'Fixed Dollar Amount'
      case 'fixed_shares': return 'Fixed Shares'
      case 'percentage': return 'Percentage of Balance'
      default: return mode || '-'
    }
  }

  const formatLimitOrderPrice = (price?: string) => {
    switch (price) {
      case 'best_ask': return 'Best Ask'
      case 'best_bid': return 'Best Bid'
      case 'mid_price': return 'Mid Price'
      case 'custom': return 'Custom Price'
      default: return price || '-'
    }
  }

  const formatUnfilledBehavior = (behavior?: string) => {
    switch (behavior) {
      case 'keep_open': return 'Keep Open'
      case 'cancel_after_seconds': return 'Cancel After Time'
      case 'cancel_at_candle': return 'Cancel at Candle Close'
      case 'replace_market': return 'Replace with Market Order'
      default: return behavior || '-'
    }
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
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
            >
              ← Back to Strategies
            </button>
          </div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'basics', label: 'Basics' },
    { id: 'tradingview', label: 'TradingView' },
    { id: 'polymarket', label: 'Polymarket' },
    { id: 'risk', label: 'Risk & Sizing' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'trades', label: 'Trade History' },
  ] as const

  return (
    <div className="bg-black text-white min-h-screen">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="mt-1 text-gray-400 hover:text-white transition-colors"
              aria-label="Back to strategies"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold">{strategy.name}</h1>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  strategy.isActive 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {strategy.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  strategy.isLive 
                    ? 'bg-purple-500/20 text-purple-400' 
                    : 'bg-yellow-500/20 text-yellow-500'
                }`}>
                  {strategy.isLive ? 'Live' : 'Paper'}
                </span>
              </div>
              {strategy.description && (
                <p className="text-gray-400 text-sm">{strategy.description}</p>
              )}
            </div>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={handleEdit}
              className="w-full sm:w-auto rounded bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors duration-200 hover:bg-blue-700"
            >
              Edit Strategy
            </button>
          )}
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6 p-4 bg-gray-900/30 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total PnL</p>
            <p className={`text-xl font-semibold ${(analytics?.totalPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPnl(analytics?.totalPnl)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Win Rate</p>
            <p className="text-xl font-semibold text-white">{analytics?.winRate?.toFixed(1) || 0}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Trades</p>
            <p className="text-xl font-semibold text-white">{analytics?.totalTrades || 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Today PnL</p>
            <p className={`text-xl font-semibold ${(analytics?.pnlToday || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPnl(analytics?.pnlToday)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Profit Factor</p>
            <p className="text-xl font-semibold text-white">{analytics?.profitFactor?.toFixed(2) || '0.00'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Max Drawdown</p>
            <p className="text-xl font-semibold text-red-400">{analytics?.maxDrawdownPercent?.toFixed(1) || 0}%</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-800 mb-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-white border-purple-500'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'basics' && (
            <>
              {/* Core Settings */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Core Settings</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Asset</p>
                    <p className="text-white font-medium">{strategy.asset}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Direction</p>
                    <p className={`font-medium ${strategy.direction === 'UP' ? 'text-green-400' : 'text-red-400'}`}>
                      {strategy.direction}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Timeframe</p>
                    <p className="text-white font-medium">{strategy.timeframe}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Condition Logic</p>
                    <p className="text-white font-medium">{strategy.conditionLogic === 'all' ? 'All conditions' : 'Any condition'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Trade on Events</p>
                    <p className="text-white font-medium">{strategy.tradeOnEventsCount || 1}</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {strategy.actions && strategy.actions.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Actions</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-gray-500 border-b border-gray-800">
                        <tr>
                          <th className="text-left py-2 font-medium">Action</th>
                          <th className="text-left py-2 font-medium">Direction</th>
                          <th className="text-left py-2 font-medium">Market</th>
                          <th className="text-left py-2 font-medium">Order Type</th>
                          <th className="text-right py-2 font-medium">Sizing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategy.actions.map((action, index) => (
                          <tr key={action.id || index} className="border-b border-gray-800/50">
                            <td className="py-3 text-white">{action.action}</td>
                            <td className="py-3 text-gray-400">{action.direction}</td>
                            <td className="py-3 text-gray-400">{action.market || '-'}</td>
                            <td className="py-3 text-gray-400">{action.orderType}</td>
                            <td className="py-3 text-right text-gray-400">
                              {action.sizing}: {action.sizingValue || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </>
          )}

          {activeTab === 'tradingview' && (
            <>
              {/* Indicators */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Indicators</h2>
                {strategy.indicators && strategy.indicators.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-gray-500 border-b border-gray-800">
                        <tr>
                          <th className="text-left py-2 font-medium">Type</th>
                          <th className="text-left py-2 font-medium">Timeframe</th>
                          <th className="text-left py-2 font-medium">Parameters</th>
                          <th className="text-left py-2 font-medium">Use in Conditions</th>
                          <th className="text-left py-2 font-medium">Preset</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategy.indicators.map((indicator, index) => (
                          <tr key={indicator.id || index} className="border-b border-gray-800/50">
                            <td className="py-3 text-white font-medium">{indicator.type}</td>
                            <td className="py-3 text-gray-400">{indicator.timeframe || '-'}</td>
                            <td className="py-3 text-gray-400">
                              {Object.entries(indicator.parameters || {}).map(([key, value]) => `${key}: ${value}`).join(', ') || '-'}
                            </td>
                            <td className="py-3">
                              <span className={indicator.useInConditions ? 'text-green-400' : 'text-gray-500'}>
                                {indicator.useInConditions ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td className="py-3 text-gray-400">{indicator.preset || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No indicators configured</p>
                )}
              </div>

              {/* Conditions */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Conditions <span className="text-gray-600 normal-case">({strategy.conditionLogic === 'all' ? 'All must match' : 'Any can match'})</span>
                </h2>
                {strategy.conditions && strategy.conditions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-gray-500 border-b border-gray-800">
                        <tr>
                          <th className="text-left py-2 font-medium">Source A</th>
                          <th className="text-center py-2 font-medium">Operator</th>
                          <th className="text-left py-2 font-medium">Source B / Value</th>
                          <th className="text-left py-2 font-medium">Candle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategy.conditions.map((condition, index) => (
                          <tr key={condition.id || index} className="border-b border-gray-800/50">
                            <td className="py-3 text-white">{condition.sourceA}</td>
                            <td className="py-3 text-center text-purple-400 font-mono">{condition.operator}</td>
                            <td className="py-3 text-gray-400">{condition.sourceB || condition.value || '-'}</td>
                            <td className="py-3 text-gray-400">{condition.candle || 'current'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No conditions configured</p>
                )}
              </div>
            </>
          )}

          {activeTab === 'polymarket' && (
            <>
              {/* Market Settings */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Market Settings</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Market</p>
                    <p className="text-white font-medium">{strategy.market || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Side</p>
                    <p className={`font-medium ${strategy.side?.includes('YES') ? 'text-green-400' : 'text-red-400'}`}>
                      {strategy.side || 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Order Type</p>
                    <p className="text-white font-medium">{strategy.orderType || 'Limit'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Limit Order Price</p>
                    <p className="text-white font-medium">{formatLimitOrderPrice(strategy.limitOrderPrice)}</p>
                  </div>
                  {strategy.limitOrderPrice === 'custom' && strategy.customLimitPrice && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Custom Price</p>
                      <p className="text-white font-medium">¢{strategy.customLimitPrice}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Price Adjustments */}
              {(strategy.adjustPriceAboveBid || strategy.adjustPriceBelowAsk) && (
                <div>
                  <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Price Adjustments</h2>
                  <div className="flex gap-4">
                    {strategy.adjustPriceAboveBid && (
                      <span className="px-3 py-1.5 bg-green-500/10 text-green-400 rounded text-sm">
                        Adjust above bid
                      </span>
                    )}
                    {strategy.adjustPriceBelowAsk && (
                      <span className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded text-sm">
                        Adjust below ask
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Orderbook Rules */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Orderbook Rules</h2>
                {strategy.orderbookRules && strategy.orderbookRules.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-gray-500 border-b border-gray-800">
                        <tr>
                          <th className="text-left py-2 font-medium">Field</th>
                          <th className="text-center py-2 font-medium">Operator</th>
                          <th className="text-left py-2 font-medium">Value</th>
                          <th className="text-left py-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategy.orderbookRules.map((rule, index) => (
                          <tr key={rule.id || index} className="border-b border-gray-800/50">
                            <td className="py-3 text-white">{rule.field}</td>
                            <td className="py-3 text-center text-purple-400 font-mono">{rule.operator}</td>
                            <td className="py-3 text-gray-400">{rule.value}{rule.value2 ? ` - ${rule.value2}` : ''}</td>
                            <td className="py-3 text-gray-400">{rule.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No orderbook rules configured</p>
                )}
              </div>

              {/* Order Ladder */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
                  Order Ladder {!strategy.useOrderLadder && <span className="text-gray-600 normal-case">(Disabled)</span>}
                </h2>
                {strategy.useOrderLadder && strategy.orderLadder && strategy.orderLadder.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm max-w-md">
                      <thead className="text-gray-500 border-b border-gray-800">
                        <tr>
                          <th className="text-left py-2 font-medium">Price</th>
                          <th className="text-right py-2 font-medium">Shares</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategy.orderLadder.map((order, index) => (
                          <tr key={order.id || index} className="border-b border-gray-800/50">
                            <td className="py-3 text-white">¢{order.price}</td>
                            <td className="py-3 text-right text-gray-400">{order.shares}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">{strategy.useOrderLadder ? 'No ladder entries' : 'Order ladder is disabled'}</p>
                )}
              </div>
            </>
          )}

          {activeTab === 'risk' && (
            <>
              {/* Order Sizing */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Order Sizing</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Size Mode</p>
                    <p className="text-white font-medium">{formatOrderSizeMode(strategy.orderSizeMode)}</p>
                  </div>
                  {strategy.orderSizeMode === 'fixed_dollar' && strategy.fixedDollarAmount && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Fixed Amount</p>
                      <p className="text-white font-medium">${strategy.fixedDollarAmount}</p>
                    </div>
                  )}
                  {strategy.orderSizeMode === 'fixed_shares' && strategy.fixedSharesAmount && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Fixed Shares</p>
                      <p className="text-white font-medium">{strategy.fixedSharesAmount}</p>
                    </div>
                  )}
                  {strategy.orderSizeMode === 'percentage' && strategy.percentageOfBalance && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Percentage</p>
                      <p className="text-white font-medium">{strategy.percentageOfBalance}%</p>
                    </div>
                  )}
                  {strategy.dynamicBaseSize && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Dynamic Base Size</p>
                      <p className="text-white font-medium">${strategy.dynamicBaseSize}</p>
                    </div>
                  )}
                  {strategy.dynamicMaxSize && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Dynamic Max Size</p>
                      <p className="text-white font-medium">${strategy.dynamicMaxSize}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Position Limits */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Position Limits</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Max Position (Shares)</p>
                    <p className="text-white font-medium">{strategy.maxPositionShares || 'No limit'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Max Position ($)</p>
                    <p className="text-white font-medium">{strategy.maxPositionDollar ? `$${strategy.maxPositionDollar}` : 'No limit'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Max Open Orders</p>
                    <p className="text-white font-medium">{strategy.maxOpenOrders || 'No limit'}</p>
                  </div>
                </div>
              </div>

              {/* Trading Limits */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Trading Limits</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Max Trades Per Event</p>
                    <p className="text-white font-medium">{strategy.maxTradesPerEvent || 'No limit'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Daily Trade Cap</p>
                    <p className="text-white font-medium">{strategy.dailyTradeCap || 'No limit'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Max Orders Per Hour</p>
                    <p className="text-white font-medium">{strategy.maxOrdersPerHour || 'No limit'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Max Daily Loss</p>
                    <p className="text-white font-medium">{strategy.maxDailyLoss ? `$${strategy.maxDailyLoss}` : 'No limit'}</p>
                  </div>
                </div>
              </div>

              {/* Take Profit / Stop Loss */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Take Profit / Stop Loss</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Take Profit</p>
                    <p className={strategy.useTakeProfit ? 'text-green-400 font-medium' : 'text-gray-500'}>
                      {strategy.useTakeProfit ? `${strategy.takeProfitPercent}%` : 'Disabled'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Stop Loss</p>
                    <p className={strategy.useStopLoss ? 'text-red-400 font-medium' : 'text-gray-500'}>
                      {strategy.useStopLoss ? `${strategy.stopLossPercent}%` : 'Disabled'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Unfilled Order Behavior */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Unfilled Order Behavior</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Behavior</p>
                    <p className="text-white font-medium">{formatUnfilledBehavior(strategy.unfilledOrderBehavior)}</p>
                  </div>
                  {strategy.unfilledOrderBehavior === 'cancel_after_seconds' && strategy.cancelAfterSeconds && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Cancel After</p>
                      <p className="text-white font-medium">{strategy.cancelAfterSeconds} seconds</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'schedule' && (
            <>
              {/* Active Days */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Active Days</h2>
                {strategy.selectedDays && strategy.selectedDays.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <span
                        key={day}
                        className={`px-3 py-1.5 rounded text-sm ${
                          strategy.selectedDays?.includes(day)
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-gray-800 text-gray-500'
                        }`}
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">All days (no restrictions)</p>
                )}
              </div>

              {/* Time Range */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Time Range</h2>
                <div className="grid grid-cols-2 gap-6 max-w-md">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Start Time</p>
                    <p className="text-white font-medium">{strategy.timeRange?.start || '09:00'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">End Time</p>
                    <p className="text-white font-medium">{strategy.timeRange?.end || '22:00'}</p>
                  </div>
                </div>
              </div>

              {/* Behavior Options */}
              <div>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">Behavior</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${strategy.runOnNewCandle ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className={strategy.runOnNewCandle ? 'text-white' : 'text-gray-500'}>
                      Run on new candle
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${strategy.pauseOnSettlement ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className={strategy.pauseOnSettlement ? 'text-white' : 'text-gray-500'}>
                      Pause on market settlement
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'trades' && (
            <div>
              {trades && trades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 border-b border-gray-800">
                      <tr>
                        <th className="text-left py-2 font-medium">Date</th>
                        <th className="text-left py-2 font-medium">Side</th>
                        <th className="text-right py-2 font-medium">Shares</th>
                        <th className="text-right py-2 font-medium">Entry</th>
                        <th className="text-right py-2 font-medium">Exit</th>
                        <th className="text-right py-2 font-medium">Fees</th>
                        <th className="text-right py-2 font-medium">PnL</th>
                        <th className="text-right py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade, index) => (
                        <tr key={trade.id || index} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                          <td className="py-3 text-gray-400">{formatDate(trade.executedAt)}</td>
                          <td className="py-3">
                            <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                              {trade.side?.toUpperCase()} {trade.direction}
                            </span>
                          </td>
                          <td className="py-3 text-right text-white">{trade.shares}</td>
                          <td className="py-3 text-right text-gray-400">
                            {trade.entryPrice ? `¢${(trade.entryPrice * 100).toFixed(0)}` : '-'}
                          </td>
                          <td className="py-3 text-right text-gray-400">
                            {trade.exitPrice ? `¢${(trade.exitPrice * 100).toFixed(0)}` : '-'}
                          </td>
                          <td className="py-3 text-right text-gray-500">
                            {trade.fees ? `$${trade.fees.toFixed(2)}` : '-'}
                          </td>
                          <td className={`py-3 text-right ${(trade.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPnl(trade.pnl)}
                          </td>
                          <td className="py-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              trade.status === 'settled' ? 'bg-green-500/20 text-green-400' :
                              trade.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-gray-700 text-gray-400'
                            }`}>
                              {trade.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <p className="text-gray-500 text-sm">No trades recorded yet</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Footer - Pinned to bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 px-4 sm:px-6 py-3">
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-gray-500">
          <span>Created: {formatDate(strategy.createdAt)}</span>
          <span>Updated: {formatDate(strategy.updatedAt)}</span>
          <span>ID: {strategy.id}</span>
        </div>
      </div>

      {/* Spacer for fixed footer */}
      <div className="h-14" />
    </div>
  )
}
