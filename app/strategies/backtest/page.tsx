'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useStrategies, Strategy, Indicator, Condition } from '@/hooks/useStrategies'
import { useWallet } from '@/contexts/WalletContext'

// ============================================
// Types
// ============================================

interface BacktestTrade {
  timestamp: number
  side: 'BUY' | 'SELL'
  price: number
  shares: number
  value: number
  pnl?: number
  balance: number
  triggerReason: string
}

interface BacktestResult {
  strategyId: string
  strategyName: string
  startTime: string
  endTime: string
  initialBalance: number
  finalBalance: number
  totalPnl: number
  totalPnlPercent: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  maxDrawdown: number
  maxDrawdownPercent: number
  sharpeRatio: number
  trades: BacktestTrade[]
  candlesProcessed: number
  conditionsTriggered: number
}

interface OrderLadderItem {
  id: string
  price: string  // cents (1-99)
  shares: string
}

interface QuickStrategy {
  asset: string
  direction: string
  timeframe: string
  indicator: string
  condition: string
  value: number
  // Order ladder - multiple limit orders
  orderLadder: OrderLadderItem[]
}

// ============================================
// Custom Dropdown Component
// ============================================

interface CustomDropdownProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  className?: string
  disabled?: boolean
}

const CustomDropdown = ({ value, onChange, options, placeholder, className = '', disabled = false }: CustomDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const selectedOption = options.find((opt) => opt.value === value)

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full pl-3 pr-8 py-2 bg-dark-bg border border-gray-800 rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : isOpen ? 'border-gold-primary/50' : 'hover:border-gray-700'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="block truncate">
          {selectedOption ? selectedOption.label : placeholder || 'Select...'}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-dark-bg border border-gray-800 rounded shadow-lg max-h-60 overflow-auto">
          <ul role="listbox" className="py-1">
            {options.map((option) => (
              <li
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  value === option.value
                    ? 'bg-gold-primary/20 text-gold-primary'
                    : 'text-white hover:bg-gray-900/50'
                }`}
                role="option"
                aria-selected={value === option.value}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {value === option.value && (
                    <svg className="w-4 h-4 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ============================================
// Indicator Presets (simplified for quick testing)
// ============================================

const INDICATOR_PRESETS = [
  { value: 'rsi_oversold', label: 'RSI Oversold (<30)', indicator: 'RSI', condition: 'crosses above', defaultValue: 30 },
  { value: 'rsi_overbought', label: 'RSI Overbought (>70)', indicator: 'RSI', condition: 'crosses below', defaultValue: 70 },
  { value: 'macd_bullish', label: 'MACD Bullish Cross', indicator: 'MACD', condition: 'crosses above', defaultValue: 0 },
  { value: 'macd_bearish', label: 'MACD Bearish Cross', indicator: 'MACD', condition: 'crosses below', defaultValue: 0 },
  { value: 'price_above_sma', label: 'Price > SMA(20)', indicator: 'SMA', condition: '>', defaultValue: 20 },
  { value: 'price_below_sma', label: 'Price < SMA(20)', indicator: 'SMA', condition: '<', defaultValue: 20 },
  { value: 'up_pct_high', label: 'Rolling Up % > 58%', indicator: 'Rolling Up %', condition: '>', defaultValue: 58 },
  { value: 'up_pct_low', label: 'Rolling Up % < 42%', indicator: 'Rolling Up %', condition: '<', defaultValue: 42 },
]

// ============================================
// Main Component
// ============================================

export default function BacktestPage() {
  const router = useRouter()
  const { walletAddress: address } = useWallet()
  const { strategies, loading: strategiesLoading } = useStrategies({ 
    userAddress: address || undefined,
    autoFetch: true 
  })

  // Mode: existing strategy or quick strategy
  const [mode, setMode] = useState<'existing' | 'quick'>('quick')

  // Existing strategy state
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('')

  // Quick strategy state
  const [quickStrategy, setQuickStrategy] = useState<QuickStrategy>({
    asset: 'BTC',
    direction: 'UP',
    timeframe: '15m',
    indicator: 'rsi_oversold',
    condition: 'crosses above',
    value: 30,
    orderLadder: [],
  })
  
  // New order input state
  const [newOrder, setNewOrder] = useState({ price: '', shares: '' })

  // Common state
  const [lookbackDays, setLookbackDays] = useState<number>(7)
  const [initialBalance, setInitialBalance] = useState<number>(1000)
  const [customDateRange, setCustomDateRange] = useState(false)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Results state
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get selected strategy details
  const selectedStrategy = strategies.find(s => s.id === selectedStrategyId)

  // Update quick strategy when preset changes
  const handlePresetChange = (presetValue: string) => {
    const preset = INDICATOR_PRESETS.find(p => p.value === presetValue)
    if (preset) {
      setQuickStrategy(prev => ({
        ...prev,
        indicator: presetValue,
        condition: preset.condition,
        value: preset.defaultValue,
      }))
    }
  }

  // Build strategy object from quick config
  const buildQuickStrategyObject = (): Partial<Strategy> => {
    const preset = INDICATOR_PRESETS.find(p => p.value === quickStrategy.indicator)
    if (!preset) return {}

    const indicatorId = `ind_${Date.now()}`
    
    // Build indicator config
    let indicatorConfig: Indicator = {
      id: indicatorId,
      type: preset.indicator,
      timeframe: quickStrategy.timeframe,
      parameters: {},
      useInConditions: true,
    }

    // Set default parameters based on indicator type
    switch (preset.indicator) {
      case 'RSI':
        indicatorConfig.parameters = { length: 14 }
        break
      case 'MACD':
        indicatorConfig.parameters = { fast: 12, slow: 26, signal: 9 }
        break
      case 'SMA':
      case 'EMA':
        indicatorConfig.parameters = { length: quickStrategy.value }
        break
      case 'Rolling Up %':
        indicatorConfig.parameters = { length: 50 }
        break
      default:
        indicatorConfig.parameters = { length: 14 }
    }

    // Build condition
    const condition: Condition = {
      id: `cond_${Date.now()}`,
      sourceA: `indicator_${indicatorId}`,
      operator: preset.condition,
      sourceB: '',
      value: quickStrategy.value,
      candle: 'current',
    }

    return {
      name: `Quick: ${preset.label}`,
      asset: quickStrategy.asset,
      direction: quickStrategy.direction,
      timeframe: quickStrategy.timeframe,
      isLive: false,
      isActive: false,
      indicators: [indicatorConfig],
      conditionLogic: 'all',
      conditions: [condition],
      actions: [],
      tradeOnEventsCount: 1,
      orderbookRules: [],
      // Order ladder for backtesting
      orderLadder: quickStrategy.orderLadder.map(o => ({
        id: o.id,
        price: o.price,
        shares: o.shares,
      })),
    }
  }

  // Run backtest
  const handleRunBacktest = useCallback(async () => {
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      let startTime: number
      let endTime: number

      if (customDateRange && startDate && endDate) {
        startTime = new Date(startDate).getTime()
        endTime = new Date(endDate).getTime()
      } else {
        endTime = Date.now()
        startTime = endTime - (lookbackDays * 24 * 60 * 60 * 1000)
      }

      let body: any = {
        startTime,
        endTime,
        initialBalance,
      }

      if (mode === 'existing') {
        if (!selectedStrategyId) {
          setError('Please select a strategy')
          setRunning(false)
          return
        }
        body.strategyId = selectedStrategyId
      } else {
        // Quick strategy mode - send full strategy object
        const strategyObj = buildQuickStrategyObject()
        if (!strategyObj.indicators?.length) {
          setError('Invalid strategy configuration')
          setRunning(false)
          return
        }
        body.strategy = strategyObj
      }

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Backtest failed')
      }

      setResult(data.result)
    } catch (err: any) {
      setError(err.message || 'Failed to run backtest')
    } finally {
      setRunning(false)
    }
  }, [mode, selectedStrategyId, quickStrategy, lookbackDays, initialBalance, customDateRange, startDate, endDate])

  // Format helpers
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
  }

  const formatDate = (timestamp: number | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const canRun = mode === 'existing' 
    ? !!selectedStrategyId 
    : !!quickStrategy.indicator && quickStrategy.orderLadder.length > 0

  return (
    <div className="bg-dark-bg text-white min-h-screen">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/strategies')}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded focus:outline-none focus:ring-2 focus:ring-gold-primary"
              aria-label="Back to strategies"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold">Backtest</h1>
          </div>
          <button
            onClick={handleRunBacktest}
            disabled={running || !canRun}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors duration-200 focus:outline-none flex items-center gap-2"
          >
            {running ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running...
              </>
            ) : (
              'Run Backtest'
            )}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-1 space-y-6">
            {/* Mode Toggle */}
            <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('quick')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    mode === 'quick'
                      ? 'bg-gold-primary text-white'
                      : 'bg-dark-bg border border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  Quick Test
                </button>
                <button
                  onClick={() => setMode('existing')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    mode === 'existing'
                      ? 'bg-gold-primary text-white'
                      : 'bg-dark-bg border border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  Saved Strategy
                </button>
              </div>
            </div>

            {/* Quick Strategy Builder */}
            {mode === 'quick' && (
              <div className="bg-dark-bg border border-gray-800 rounded-lg p-4 space-y-4">
                <h3 className="text-lg font-medium text-white">Strategy</h3>
                
                {/* Asset & Direction */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Asset</label>
                    <CustomDropdown
                      value={quickStrategy.asset}
                      onChange={(v) => setQuickStrategy(prev => ({ ...prev, asset: v }))}
                      options={[
                        { value: 'BTC', label: 'BTC' },
                        { value: 'ETH', label: 'ETH' },
                        { value: 'SOL', label: 'SOL' },
                        { value: 'XRP', label: 'XRP' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Direction</label>
                    <CustomDropdown
                      value={quickStrategy.direction}
                      onChange={(v) => setQuickStrategy(prev => ({ ...prev, direction: v }))}
                      options={[
                        { value: 'UP', label: 'UP' },
                        { value: 'DOWN', label: 'DOWN' },
                      ]}
                    />
                  </div>
                </div>

                {/* Timeframe */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Timeframe</label>
                  <CustomDropdown
                    value={quickStrategy.timeframe}
                    onChange={(v) => setQuickStrategy(prev => ({ ...prev, timeframe: v }))}
                    options={[
                      { value: '15m', label: '15 minutes' },
                      { value: '1h', label: '1 hour' },
                    ]}
                  />
                </div>

                {/* Signal Preset */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Entry Signal</label>
                  <CustomDropdown
                    value={quickStrategy.indicator}
                    onChange={handlePresetChange}
                    options={INDICATOR_PRESETS.map(p => ({ value: p.value, label: p.label }))}
                    placeholder="Select signal..."
                  />
                </div>

                {/* Order Ladder */}
                <div className="pt-3 border-t border-gray-800">
                  <h4 className="text-sm font-medium text-white mb-3">Order Ladder</h4>
                  
                  {/* Add Order Row */}
                  <div className="bg-dark-bg border border-gray-800 rounded p-3 space-y-3">
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-xs text-gray-400">Price:</span>
                      <div className="relative w-20">
                        <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs pointer-events-none">¢</span>
                        <input
                          type="text"
                          value={newOrder.price}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^0-9]/g, '')
                            if (numericValue === '' || (parseInt(numericValue) >= 1 && parseInt(numericValue) <= 99)) {
                              setNewOrder({ ...newOrder, price: numericValue })
                            }
                          }}
                          placeholder=""
                          className="w-full pl-6 pr-2 py-1.5 bg-dark-bg border border-gray-800 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-primary"
                          maxLength={2}
                        />
                      </div>
                      <span className="text-xs text-gray-400">Shares:</span>
                      <input
                        type="text"
                        value={newOrder.shares}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/[^0-9]/g, '')
                          setNewOrder({ ...newOrder, shares: numericValue })
                        }}
                        placeholder=""
                        className="w-20 px-2 py-1.5 bg-dark-bg border border-gray-800 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newOrder.price && newOrder.shares) {
                            setQuickStrategy(prev => ({
                              ...prev,
                              orderLadder: [
                                ...prev.orderLadder,
                                {
                                  id: Date.now().toString(),
                                  price: newOrder.price,
                                  shares: newOrder.shares,
                                },
                              ],
                            }))
                            setNewOrder({ price: '', shares: '' })
                          }
                        }}
                        disabled={!newOrder.price || !newOrder.shares}
                        className="px-2 py-1 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-xs rounded transition-colors focus:outline-none"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {/* Order List */}
                  {quickStrategy.orderLadder.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {quickStrategy.orderLadder.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between bg-dark-bg border border-gray-800 rounded p-2"
                        >
                          <span className="text-xs text-gray-300">
                            ¢{order.price} × {order.shares} shares = ${(parseInt(order.price) * parseInt(order.shares) / 100).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickStrategy(prev => ({
                                ...prev,
                                orderLadder: prev.orderLadder.filter(o => o.id !== order.id),
                              }))
                            }}
                            className="text-red-400 hover:text-red-300 text-xs focus:outline-none"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {/* Total */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                        <span className="text-xs text-gray-400">Total:</span>
                        <span className="text-xs text-white font-medium">
                          {quickStrategy.orderLadder.reduce((sum, o) => sum + parseInt(o.shares), 0)} shares / 
                          ${quickStrategy.orderLadder.reduce((sum, o) => sum + (parseInt(o.price) * parseInt(o.shares) / 100), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  {quickStrategy.orderLadder.length === 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Add limit orders to define your entry prices
                    </p>
                  )}
                </div>

                {/* Preview */}
                <div className="pt-3 border-t border-gray-800">
                  <p className="text-xs text-gray-500">
                    Buy {quickStrategy.direction} on {quickStrategy.asset} ({quickStrategy.timeframe}) when{' '}
                    <span className="text-gold-primary">
                      {INDICATOR_PRESETS.find(p => p.value === quickStrategy.indicator)?.label || 'condition met'}
                    </span>
                    {quickStrategy.orderLadder.length > 0 && (
                      <span className="text-gray-400">
                        {' '}with {quickStrategy.orderLadder.length} limit order{quickStrategy.orderLadder.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Existing Strategy Selector */}
            {mode === 'existing' && (
              <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-medium text-white mb-4">Strategy</h3>
                <CustomDropdown
                  value={selectedStrategyId}
                  onChange={(value) => setSelectedStrategyId(value)}
                  options={strategies.map((s) => ({ value: s.id || '', label: s.name }))}
                  placeholder={strategiesLoading ? 'Loading...' : 'Select a strategy'}
                  disabled={strategiesLoading}
                />

                {selectedStrategy && (
                  <div className="mt-4 space-y-2 text-sm border-t border-gray-800 pt-4">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Asset</span>
                      <span className="text-white">{selectedStrategy.asset}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Direction</span>
                      <span className="text-white">{selectedStrategy.direction}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Timeframe</span>
                      <span className="text-white">{selectedStrategy.timeframe}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Conditions</span>
                      <span className="text-white">{selectedStrategy.conditions?.length || 0}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Time Range */}
            <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-medium text-white mb-4">Time Range</h3>
              
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="customDate"
                  checked={customDateRange}
                  onChange={(e) => setCustomDateRange(e.target.checked)}
                  className="w-4 h-4 text-gold-primary bg-dark-bg border-gray-800 rounded focus:ring-gold-primary"
                />
                <label htmlFor="customDate" className="text-sm text-gray-300">
                  Custom dates
                </label>
              </div>

              {customDateRange ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Start</label>
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">End</label>
                    <input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 7, 14, 30].map((days) => (
                    <button
                      key={days}
                      onClick={() => setLookbackDays(days)}
                      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                        lookbackDays === days
                          ? 'bg-gold-primary text-white'
                          : 'bg-dark-bg border border-gray-800 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Balance */}
            <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Starting Balance</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(Number(e.target.value))}
                  min={100}
                  step={100}
                  className="w-full pl-8 pr-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                />
              </div>
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="lg:col-span-2">
            {!result && !running && (
              <div className="bg-dark-bg border border-gray-800 rounded-lg p-8 text-center h-full flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-16 h-16 bg-gray-900 border border-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-400 mb-2">Ready to Test</h3>
                <p className="text-gray-500 text-sm max-w-sm">
                  Configure your strategy and click &quot;Run Backtest&quot;
                </p>
              </div>
            )}

            {running && (
              <div className="bg-dark-bg border border-gray-800 rounded-lg p-8 text-center h-full flex flex-col items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold-primary mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Running Backtest...</h3>
                <p className="text-gray-400 text-sm">
                  Analyzing {lookbackDays} days of data
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total P&L</p>
                    <p className={`text-xl font-bold ${result.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(result.totalPnl)}
                    </p>
                    <p className={`text-xs ${result.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(result.totalPnlPercent)}
                    </p>
                  </div>

                  <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Win Rate</p>
                    <p className="text-xl font-bold text-white">{result.winRate.toFixed(1)}%</p>
                    <p className="text-xs text-gray-400">
                      {result.winningTrades}W / {result.losingTrades}L
                    </p>
                  </div>

                  <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Profit Factor</p>
                    <p className={`text-xl font-bold ${result.profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                      {result.profitFactor.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">Avg Win/Loss</p>
                  </div>

                  <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
                    <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Max Drawdown</p>
                    <p className="text-xl font-bold text-red-400">
                      {formatPercent(-result.maxDrawdownPercent)}
                    </p>
                    <p className="text-xs text-gray-400">{formatCurrency(result.maxDrawdown)}</p>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-white mb-4">Details</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Initial</p>
                      <p className="text-white font-medium">{formatCurrency(result.initialBalance)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Final</p>
                      <p className={`font-medium ${result.finalBalance >= result.initialBalance ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(result.finalBalance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Trades</p>
                      <p className="text-white font-medium">{result.totalTrades}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Sharpe</p>
                      <p className={`font-medium ${result.sharpeRatio >= 1 ? 'text-green-400' : result.sharpeRatio >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {result.sharpeRatio.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Avg Win</p>
                      <p className="text-green-400 font-medium">{formatCurrency(result.avgWin)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Avg Loss</p>
                      <p className="text-red-400 font-medium">{formatCurrency(result.avgLoss)}</p>
                    </div>
                  </div>
                </div>

                {/* Trade History */}
                <div className="bg-dark-bg border border-gray-800 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-gray-800">
                    <h3 className="text-lg font-medium text-white">Trades</h3>
                  </div>
                  
                  {result.trades.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-gray-500 text-sm">No trades during this period</p>
                    </div>
                  ) : (
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
                          {result.trades.slice(0, 50).map((trade, index) => (
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
                      {result.trades.length > 50 && (
                        <div className="p-3 text-center text-gray-500 text-sm border-t border-gray-800">
                          Showing 50 of {result.trades.length} trades
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
