'use client'

/**
 * BacktestDemo - Shows the actual backtest results interface in preview mode
 */
const BacktestDemo = () => {
  // Mock backtest result data for preview
  const mockResult = {
    strategyId: 'demo-strategy',
    strategyName: 'MACD Bullish Crossover',
    startTime: '2024-01-01T00:00:00Z',
    endTime: '2024-12-20T23:59:59Z',
    initialBalance: 1000,
    finalBalance: 1234.56,
    totalPnl: 234.56,
    totalPnlPercent: 23.46,
    totalTrades: 45,
    winningTrades: 31,
    losingTrades: 14,
    winRate: 68.89,
    avgWin: 12.45,
    avgLoss: -8.23,
    profitFactor: 1.51,
    maxDrawdown: -45.20,
    maxDrawdownPercent: -4.52,
    sharpeRatio: 1.85,
    trades: [
      { timestamp: '2024-01-15T10:30:00Z', side: 'BUY', price: 58.5, shares: 100, value: 58.50, pnl: undefined, balance: 1058.50 },
      { timestamp: '2024-01-15T14:20:00Z', side: 'SELL', price: 62.3, shares: 100, value: 62.30, pnl: 3.80, balance: 1120.80 },
      { timestamp: '2024-01-16T09:15:00Z', side: 'BUY', price: 55.2, shares: 150, value: 82.80, pnl: undefined, balance: 1038.00 },
      { timestamp: '2024-01-16T16:45:00Z', side: 'SELL', price: 59.8, shares: 150, value: 89.70, pnl: 6.90, balance: 1127.70 },
    ],
    candlesProcessed: 35040,
    conditionsTriggered: 127,
  }

  const mockConfig = {
    asset: 'BTC',
    direction: 'UP',
    timeframe: '1h',
    numberOfMarkets: 8,
    exitPrice: '',
    initialBalance: 1000,
    triggerType: 'indicators',
    indicators: [
      { type: 'MACD', parameters: { fast: 12, slow: 26, signal: 9 } }
    ],
    conditions: [
      { sourceA: 'MACD', operator: '>', sourceB: 'signal', value: null }
    ],
    conditionLogic: 'all',
    orderbookRules: [],
    orderLadder: [
      { price: '50', shares: '100' },
      { price: '55', shares: '150' },
      { price: '60', shares: '200' },
    ],
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-dark-bg text-white h-[600px] overflow-hidden relative">
      <div className="h-full overflow-y-auto">
        <div className="px-4 sm:px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Backtest Results</h2>
            <div className="flex items-center gap-3">
              <p className="text-gray-400">Analysis of your strategy performance</p>
              <span className="px-3 py-1 bg-gold-primary/20 text-gold-primary rounded text-sm font-medium">
                {mockResult.strategyName}
              </span>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total P&L</p>
              <p className="text-xl font-bold text-green-400">
                {formatCurrency(mockResult.totalPnl)}
              </p>
              <p className="text-xs text-green-400">
                {formatPercent(mockResult.totalPnlPercent)}
              </p>
            </div>

            <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Win Rate</p>
              <p className="text-xl font-bold text-white">{mockResult.winRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-400">
                {mockResult.winningTrades}W / {mockResult.losingTrades}L
              </p>
            </div>

            <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Profit Factor</p>
              <p className="text-xl font-bold text-green-400">
                {mockResult.profitFactor.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">Avg Win/Loss</p>
            </div>

            <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Max Drawdown</p>
              <p className="text-xl font-bold text-red-400">
                {formatPercent(-mockResult.maxDrawdownPercent)}
              </p>
              <p className="text-xs text-gray-400">{formatCurrency(mockResult.maxDrawdown)}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="bg-dark-bg border border-gray-800 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium text-white mb-4">Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Initial</p>
                <p className="text-white font-medium">{formatCurrency(mockResult.initialBalance)}</p>
              </div>
              <div>
                <p className="text-gray-400">Final</p>
                <p className="text-green-400 font-medium">
                  {formatCurrency(mockResult.finalBalance)}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Trades</p>
                <p className="text-white font-medium">{mockResult.totalTrades}</p>
              </div>
              <div>
                <p className="text-gray-400">Sharpe</p>
                <p className="text-green-400 font-medium">{mockResult.sharpeRatio.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-400">Avg Win</p>
                <p className="text-green-400 font-medium">{formatCurrency(mockResult.avgWin)}</p>
              </div>
              <div>
                <p className="text-gray-400">Avg Loss</p>
                <p className="text-red-400 font-medium">{formatCurrency(mockResult.avgLoss)}</p>
              </div>
            </div>
          </div>

          {/* Trade History */}
          <div className="bg-dark-bg border border-gray-800 rounded-lg overflow-hidden mb-6">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-medium text-white">Trades</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Time</th>
                    <th className="text-left py-3 px-4 font-medium">Side</th>
                    <th className="text-right py-3 px-4 font-medium">Price</th>
                    <th className="text-right py-3 px-4 font-medium">Shares</th>
                    <th className="text-right py-3 px-4 font-medium">Value</th>
                    <th className="text-right py-3 px-4 font-medium">P&L</th>
                    <th className="text-right py-3 px-4 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {mockResult.trades.map((trade, index) => (
                    <tr key={index} className="border-b border-gray-800 hover:bg-gray-900/30">
                      <td className="py-3 px-4 text-gray-400">{formatDate(trade.timestamp)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          trade.side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {trade.side}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-white">{trade.price.toFixed(2)}¢</td>
                      <td className="py-3 px-4 text-right text-white">{trade.shares.toFixed(0)}</td>
                      <td className="py-3 px-4 text-right text-white">{formatCurrency(trade.value)}</td>
                      <td className={`py-3 px-4 text-right font-medium ${
                        trade.pnl !== undefined && trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {trade.pnl !== undefined ? formatCurrency(trade.pnl) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-white">{formatCurrency(trade.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Backtest Configuration */}
          <div className="bg-dark-bg border border-gray-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-medium text-white">Backtest Configuration</h3>
              <p className="text-sm text-gray-400 mt-1">Parameters used for this backtest</p>
            </div>
            <div className="p-4 space-y-4">
              {/* Basic Settings */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3">Basic Settings</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 mb-1">Asset</p>
                    <p className="text-white font-medium">{mockConfig.asset}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Direction</p>
                    <p className="text-white font-medium">{mockConfig.direction}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Timeframe</p>
                    <p className="text-white font-medium">{mockConfig.timeframe}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Markets Tested</p>
                    <p className="text-white font-medium">{mockConfig.numberOfMarkets}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Exit Price</p>
                    <p className="text-white font-medium">Market End</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-1">Initial Balance</p>
                    <p className="text-white font-medium">{formatCurrency(mockConfig.initialBalance)}</p>
                  </div>
                </div>
              </div>

              {/* Trigger Type */}
              <div>
                <h4 className="text-sm font-medium text-white mb-3">Entry Trigger</h4>
                <div className="bg-gray-900/50 rounded p-3">
                  <p className="text-white font-medium capitalize mb-2">Asset Indicators</p>
                  
                  <div className="space-y-2 mt-2">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Indicators</p>
                    {mockConfig.indicators.map((ind, idx) => (
                      <div key={idx} className="text-sm text-gray-300">
                        <span className="text-white font-medium">{ind.type}</span>
                        {ind.parameters && Object.keys(ind.parameters).length > 0 && (
                          <span className="text-gray-400 ml-2">
                            ({Object.entries(ind.parameters).map(([k, v]) => `${k}: ${v}`).join(', ')})
                          </span>
                        )}
                      </div>
                    ))}
                    {mockConfig.conditions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Conditions</p>
                        <p className="text-sm text-gray-300">
                          {mockConfig.conditionLogic === 'all' ? 'All' : 'Any'} of:
                        </p>
                        {mockConfig.conditions.map((cond, idx) => (
                          <div key={idx} className="text-sm text-gray-300 ml-2 mt-1">
                            {cond.sourceA} {cond.operator} {cond.sourceB}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Ladder */}
              {mockConfig.orderLadder.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">Order Ladder</h4>
                  <div className="bg-gray-900/50 rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium">Price</th>
                          <th className="text-right py-2 px-3 font-medium">Shares</th>
                          <th className="text-right py-2 px-3 font-medium">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mockConfig.orderLadder.map((order, idx) => (
                          <tr key={idx} className="border-b border-gray-800 last:border-0">
                            <td className="py-2 px-3 text-white">¢{order.price}</td>
                            <td className="py-2 px-3 text-right text-white">{order.shares}</td>
                            <td className="py-2 px-3 text-right text-white">
                              {formatCurrency((parseInt(order.price) * parseInt(order.shares)) / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-gray-800">
                        <tr>
                          <td className="py-2 px-3 text-white font-medium">Total</td>
                          <td className="py-2 px-3 text-right text-white font-medium">
                            {mockConfig.orderLadder.reduce((sum, o) => sum + parseInt(o.shares), 0)}
                          </td>
                          <td className="py-2 px-3 text-right text-white font-medium">
                            {formatCurrency(
                              mockConfig.orderLadder.reduce(
                                (sum, o) => sum + (parseInt(o.price) * parseInt(o.shares) / 100),
                                0
                              )
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BacktestDemo

