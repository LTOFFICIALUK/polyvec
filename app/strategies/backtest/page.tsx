'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useStrategies, Strategy, Indicator, Condition } from '@/hooks/useStrategies'
import { useWallet } from '@/contexts/WalletContext'
import BacktestChart from '@/components/BacktestChart'

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
  indicatorPreset?: string  // Preset name if using preset (e.g., "MACD Bullish Crossover")
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

interface BacktestConfig {
  triggerType: 'indicators' | 'orderbook' | null
  // Basics
  asset: string
  direction: string
  timeframe: string
  // Indicators
  indicators: Indicator[]
  conditions: Condition[]
  conditionLogic: 'all' | 'any'
  // Orderbook
  orderbookRules: Array<{
    id: string
    field: string
    operator: string
    value: string
    value2?: string
  }>
  // Trades
  orderLadder: OrderLadderItem[]
  // Exit Strategy
  exitPrice: string  // cents (1-99) - price to sell shares
  // Settings
  numberOfMarkets: number
  initialBalance: number
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
// Indicator Types and Presets
// ============================================

const INDICATOR_TYPES = [
  'RSI',
  'MACD',
  'SMA',
  'EMA',
  'Bollinger Bands',
  'Stochastic',
  'ATR',
  'VWAP',
  'Rolling Up %',
]

const getPresetsForType = (type: string): Array<{
  value: string
  label: string
  indicator: string
  condition: string
  defaultValue: number
  isMultiIndicator?: boolean
}> => {
  switch (type) {
    case 'MACD':
      return [
        { value: 'macd_bullish', label: 'MACD Bullish Crossover', indicator: 'MACD', condition: 'crosses above', defaultValue: 0 },
        { value: 'macd_bearish', label: 'MACD Bearish Crossover', indicator: 'MACD', condition: 'crosses below', defaultValue: 0 },
      ]
    case 'RSI':
      return [
        { value: 'rsi_oversold', label: 'RSI Oversold Reversal', indicator: 'RSI', condition: 'crosses above', defaultValue: 30 },
        { value: 'rsi_overbought', label: 'RSI Overbought Reversal', indicator: 'RSI', condition: 'crosses below', defaultValue: 70 },
      ]
    case 'EMA':
      return [
        { value: 'ema_short', label: 'EMA Trend Flip (9/21)', indicator: 'EMA', condition: 'crosses above', defaultValue: 0, isMultiIndicator: true },
        { value: 'ema_long', label: 'EMA Trend Flip (20/50)', indicator: 'EMA', condition: 'crosses below', defaultValue: 0, isMultiIndicator: true },
      ]
    case 'Bollinger Bands':
      return [
        { value: 'bb_upper', label: 'BB Breakout (Upper)', indicator: 'Bollinger Bands', condition: '>', defaultValue: 0 },
        { value: 'bb_lower', label: 'BB Breakout (Lower)', indicator: 'Bollinger Bands', condition: '<', defaultValue: 0 },
      ]
    case 'Rolling Up %':
      return [
        { value: 'up_pct_bullish', label: 'Bullish (≥58%)', indicator: 'Rolling Up %', condition: '>', defaultValue: 58 },
        { value: 'up_pct_bearish', label: 'Bearish (≤42%)', indicator: 'Rolling Up %', condition: '<', defaultValue: 42 },
      ]
    default:
      return []
  }
}

// ============================================
// VPS Status Indicator Component
// ============================================

const VPSStatusIndicator = () => {
  const [vpsStatus, setVpsStatus] = useState<{ online: boolean; checking: boolean; error?: string }>({
    online: false,
    checking: true,
  })

  useEffect(() => {
    const checkStatus = async () => {
      setVpsStatus(prev => ({ ...prev, checking: true }))
      try {
        const res = await fetch('/api/vps/health')
        const data = await res.json()
        setVpsStatus({
          online: data.online === true,
          checking: false,
          error: data.error,
        })
      } catch (err: any) {
        setVpsStatus({
          online: false,
          checking: false,
          error: err.message || 'Health check failed',
        })
      }
    }

    // Check immediately and then every 30 seconds
    checkStatus()
    const interval = setInterval(checkStatus, 30000)

    return () => clearInterval(interval)
  }, [])

  if (vpsStatus.checking) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 mt-4">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
          <p className="text-xs text-gray-400">Checking VPS status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-lg p-3 mt-4 ${
      vpsStatus.online 
        ? 'bg-green-900/20 border-green-800/50' 
        : 'bg-red-900/20 border-red-800/50'
    }`}>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          vpsStatus.online ? 'bg-green-400 animate-pulse' : 'bg-red-400'
        }`}></div>
        <p className={`text-xs font-medium ${
          vpsStatus.online ? 'text-green-300' : 'text-red-300'
        }`}>
          VPS Status: {vpsStatus.online ? 'Online' : 'Offline'}
        </p>
      </div>
      {!vpsStatus.online && vpsStatus.error && (
        <p className="text-xs text-red-400/80 mt-1 ml-4">
          {vpsStatus.error}
        </p>
      )}
    </div>
  )
}

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

  const [currentStep, setCurrentStep] = useState(1)
  const [config, setConfig] = useState<BacktestConfig>({
    triggerType: null,
    asset: 'BTC',
    direction: 'UP',
    timeframe: '15m',
    indicators: [],
    conditions: [],
    conditionLogic: 'all',
    orderbookRules: [],
    orderLadder: [],
    exitPrice: '',
    numberOfMarkets: 10,
    initialBalance: 1000,
  })

  // Results state
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backtestConfig, setBacktestConfig] = useState<BacktestConfig | null>(null)

  // New order input state
  const [newOrder, setNewOrder] = useState({ price: '', shares: '' })

  // New orderbook rule state
  const [newOrderbookRule, setNewOrderbookRule] = useState({
    field: 'market price per share',
    operator: '',
    value: '',
  })

  // Selected indicator type and preset
  const [selectedIndicatorType, setSelectedIndicatorType] = useState<string>('')
  const [selectedPreset, setSelectedPreset] = useState<string>('')

  // Get indicator types as options
  const indicatorTypeOptions = INDICATOR_TYPES.map(type => ({
    value: type,
    label: type,
  }))

  // Get presets filtered by selected indicator type
  const filteredPresets = selectedIndicatorType
    ? getPresetsForType(selectedIndicatorType)
    : []

  // Update config helper
  const updateConfig = (updates: Partial<BacktestConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
  }

  // Handle indicator type change
  const handleIndicatorTypeChange = (indicatorType: string) => {
    setSelectedIndicatorType(indicatorType)
    setSelectedPreset('') // Reset preset when type changes
    updateConfig({ indicators: [], conditions: [] }) // Clear existing config
  }

  // Handle preset selection for indicators
  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue)
    const preset = filteredPresets.find(p => p.value === presetValue)
    if (!preset) return

    const indicators: Indicator[] = []
    const conditions: Condition[] = []

    // Handle multi-indicator presets (like EMA crossovers)
    if (preset.isMultiIndicator) {
      if (presetValue === 'ema_short') {
        const ema9Id = `ind_${Date.now()}`
        const ema21Id = `ind_${Date.now() + 1}`
        indicators.push(
          {
            id: ema9Id,
            type: 'EMA',
            timeframe: config.timeframe,
            parameters: { length: 9 },
            useInConditions: true,
            preset: 'ema_short',
          },
          {
            id: ema21Id,
            type: 'EMA',
            timeframe: config.timeframe,
            parameters: { length: 21 },
            useInConditions: true,
            preset: 'ema_short',
          }
        )
        conditions.push({
          id: `cond_${Date.now()}`,
          sourceA: `indicator_${ema9Id}`,
          operator: 'crosses above',
          sourceB: `indicator_${ema21Id}`,
          candle: 'current',
        })
      } else if (presetValue === 'ema_long') {
        const ema20Id = `ind_${Date.now()}`
        const ema50Id = `ind_${Date.now() + 1}`
        indicators.push(
          {
            id: ema20Id,
            type: 'EMA',
            timeframe: config.timeframe,
            parameters: { length: 20 },
            useInConditions: true,
            preset: 'ema_long',
          },
          {
            id: ema50Id,
            type: 'EMA',
            timeframe: config.timeframe,
            parameters: { length: 50 },
            useInConditions: true,
            preset: 'ema_long',
          }
        )
        conditions.push({
          id: `cond_${Date.now()}`,
          sourceA: `indicator_${ema20Id}`,
          operator: 'crosses below',
          sourceB: `indicator_${ema50Id}`,
          candle: 'current',
        })
      }
    } else {
      // Single indicator presets
      const indicatorId = `ind_${Date.now()}`
      
      // Build indicator config
      let indicatorConfig: Indicator = {
        id: indicatorId,
        type: preset.indicator,
        timeframe: config.timeframe,
        parameters: {},
        useInConditions: true,
        preset: presetValue,
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
          indicatorConfig.parameters = { length: preset.defaultValue || 20 }
          break
        case 'Bollinger Bands':
          indicatorConfig.parameters = { length: 20, stdDev: 2 }
          break
        case 'Stochastic':
          indicatorConfig.parameters = { k: 14, smoothK: 1, d: 3 }
          break
        case 'ATR':
          indicatorConfig.parameters = { length: 14 }
          break
        case 'Rolling Up %':
          indicatorConfig.parameters = { length: 50 }
          break
        default:
          indicatorConfig.parameters = { length: 14 }
      }

      indicators.push(indicatorConfig)

      // Build condition
      if (presetValue === 'bb_upper') {
        // Bollinger Bands Upper Breakout: Close price crosses above upper band
        conditions.push({
          id: `cond_${Date.now()}`,
          sourceA: 'price',
          operator: '>',
          sourceB: `indicator_${indicatorId}.upper`,
          candle: 'current',
        })
      } else if (presetValue === 'bb_lower') {
        // Bollinger Bands Lower Breakout: Close price crosses below lower band
        conditions.push({
          id: `cond_${Date.now()}`,
          sourceA: 'price',
          operator: '<',
          sourceB: `indicator_${indicatorId}.lower`,
          candle: 'current',
        })
      } else if (presetValue === 'macd_bullish') {
        // MACD Bullish Crossover: MACD line crosses above Signal line
        conditions.push({
          id: `cond_${Date.now()}`,
          sourceA: `indicator_${indicatorId}.macd`,
          operator: 'crosses above',
          sourceB: `indicator_${indicatorId}.signal`,
          candle: 'current',
        })
      } else if (presetValue === 'macd_bearish') {
        // MACD Bearish Crossover: MACD line crosses below Signal line
        conditions.push({
          id: `cond_${Date.now()}`,
          sourceA: `indicator_${indicatorId}.macd`,
          operator: 'crosses below',
          sourceB: `indicator_${indicatorId}.signal`,
          candle: 'current',
        })
      } else {
        conditions.push({
          id: `cond_${Date.now()}`,
          sourceA: `indicator_${indicatorId}`,
          operator: preset.condition,
          sourceB: '',
          value: preset.defaultValue,
          candle: 'current',
        })
      }
    }

    updateConfig({
      indicators,
      conditions,
    })
  }

  // Add orderbook rule
  const handleAddOrderbookRule = () => {
    if (newOrderbookRule.operator && newOrderbookRule.value) {
      updateConfig({
        orderbookRules: [
          ...config.orderbookRules,
          {
            id: Date.now().toString(),
            field: newOrderbookRule.field,
            operator: newOrderbookRule.operator,
            value: newOrderbookRule.value,
          },
        ],
      })
      setNewOrderbookRule({ field: 'market price per share', operator: '', value: '' })
    }
  }

  // Add order to ladder
  const handleAddOrder = () => {
    if (newOrder.price && newOrder.shares) {
      updateConfig({
        orderLadder: [
          ...config.orderLadder,
          {
            id: Date.now().toString(),
            price: newOrder.price,
            shares: newOrder.shares,
          },
        ],
      })
      setNewOrder({ price: '', shares: '' })
    }
  }

  // Build strategy object for backtest
  const buildStrategyObject = (): any => {
    return {
      name: `Backtest: ${config.asset} ${config.direction}`,
      asset: config.asset,
      direction: config.direction,
      timeframe: config.timeframe,
      isLive: false,
      isActive: false,
      indicators: config.indicators,
      conditionLogic: config.conditionLogic,
      conditions: config.conditions,
      actions: [],
      tradeOnEventsCount: 1,
      orderbookRules: config.orderbookRules.map(rule => ({
        ...rule,
        action: (rule as any).action || 'buy', // Default action if not provided
      })),
      orderLadder: config.orderLadder.map(o => ({
        id: o.id,
        price: typeof o.price === 'string' ? parseInt(o.price) : (typeof o.price === 'number' ? o.price : parseInt(String(o.price))),
        shares: typeof o.shares === 'string' ? parseInt(o.shares) : (typeof o.shares === 'number' ? o.shares : parseInt(String(o.shares))),
      })),
    }
  }

  // Check VPS health before running backtest
  const checkVPSHealth = async (): Promise<{ online: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/vps/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      return { online: data.online === true, error: data.error }
    } catch (err: any) {
      return { online: false, error: err.message || 'Health check failed' }
    }
  }

  // Run backtest
  const handleRunBacktest = useCallback(async () => {
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      // First, check if VPS is online
      const healthCheck = await checkVPSHealth()
      if (!healthCheck.online) {
        throw new Error(`VPS is not accessible: ${healthCheck.error || 'Service may be down. Please check VPS status.'}`)
      }

      const strategyObj = buildStrategyObject()
      if (!strategyObj.indicators?.length && !strategyObj.orderbookRules?.length) {
        throw new Error('Please configure your strategy')
      }
      if (!strategyObj.orderLadder?.length) {
        throw new Error('Please add at least one order to the ladder')
      }

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numberOfMarkets: config.numberOfMarkets,
          initialBalance: config.initialBalance,
          exitPrice: config.exitPrice ? parseInt(config.exitPrice) : undefined,
          strategy: strategyObj,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Backtest failed')
      }

      setResult(data.result)
      setBacktestConfig({ ...config }) // Store the config used for this backtest
      setCurrentStep(6) // Show results
    } catch (err: any) {
      setError(err.message || 'Failed to run backtest')
    } finally {
      setRunning(false)
    }
  }, [config])

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

  // Step validation
  const canProceedToStep2 = config.triggerType !== null
  const canProceedToStep3 = 
    (config.triggerType === 'indicators' && config.indicators.length > 0 && config.conditions.length > 0) ||
    (config.triggerType === 'orderbook' && config.orderbookRules.length > 0)
  const canProceedToStep4 = config.orderLadder.length > 0
  // For indicator-based: no exit price needed. For orderbook-based: exit price required
  const canProceedToStep5 = config.triggerType === 'indicators' || (config.exitPrice !== '' && parseInt(config.exitPrice) >= 1 && parseInt(config.exitPrice) <= 99)
  const canRunBacktest = canProceedToStep5 && config.asset && config.direction && config.timeframe

  // Step navigation
  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  // Step indicator component
  const StepIndicator = ({ step, label, isActive, isComplete }: { step: number; label: string; isActive: boolean; isComplete: boolean }) => (
    <div className="flex items-center">
      <div className="flex items-center">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
          isComplete 
            ? 'bg-gold-primary text-white' 
            : isActive 
              ? 'bg-gold-primary/20 text-gold-primary border-2 border-gold-primary' 
              : 'bg-gray-800 text-gray-400'
        }`}>
          {isComplete ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            step
          )}
        </div>
        <div className="ml-3 hidden sm:block">
          <p className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-400'}`}>
            {label}
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-dark-bg text-white flex-1">
      <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
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
            <h1 className="text-2xl sm:text-3xl font-bold">Backtest Strategy</h1>
          </div>
        </div>

        {/* Step Indicator */}
        {currentStep < 6 && (
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <StepIndicator step={1} label="Choose Trigger" isActive={currentStep === 1} isComplete={currentStep > 1} />
              <div className={`flex-1 h-0.5 mx-2 ${currentStep > 1 ? 'bg-gold-primary' : 'bg-gray-800'}`} />
              <StepIndicator step={2} label="Setup Strategy" isActive={currentStep === 2} isComplete={currentStep > 2} />
              <div className={`flex-1 h-0.5 mx-2 ${currentStep > 2 ? 'bg-gold-primary' : 'bg-gray-800'}`} />
              <StepIndicator step={3} label="Place Trades" isActive={currentStep === 3} isComplete={currentStep > 3} />
              <div className={`flex-1 h-0.5 mx-2 ${currentStep > 3 ? 'bg-gold-primary' : 'bg-gray-800'}`} />
              <StepIndicator step={4} label="Exit Price" isActive={currentStep === 4} isComplete={currentStep > 4} />
              <div className={`flex-1 h-0.5 mx-2 ${currentStep > 4 ? 'bg-gold-primary' : 'bg-gray-800'}`} />
              <StepIndicator step={5} label="Backtest Settings" isActive={currentStep === 5} isComplete={currentStep > 5} />
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-red-400 text-sm font-medium mb-1">Backtest Error</p>
                <p className="text-red-300/80 text-sm">{error}</p>
                <p className="text-red-400/60 text-xs mt-2">
                  💡 <strong>Tip:</strong> Check that the VPS service is running on port 8081. The backtest service must be active on the VPS to process requests.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-dark-bg border border-gray-800 rounded-lg p-6 sm:p-8">
          {/* Step 1: Choose Trigger Type */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Choose Your Order Trigger</h2>
                <p className="text-gray-400">Select how you want to trigger your trades</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {/* Indicators Option */}
                <button
                  type="button"
                  onClick={() => {
                    updateConfig({ triggerType: 'indicators' })
                    setSelectedIndicatorType('')
                    setSelectedPreset('')
                    setTimeout(() => handleNext(), 100)
                  }}
                  className={`p-6 border-2 rounded-lg transition-all text-left ${
                    config.triggerType === 'indicators'
                      ? 'border-gold-primary bg-gold-primary/5'
                      : 'border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      config.triggerType === 'indicators' ? 'bg-gold-primary/20' : 'bg-gray-800'
                    }`}>
                      <svg className="w-6 h-6 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">Asset Indicators</h3>
                      <p className="text-gray-400 text-sm">
                        Use technical indicators like RSI, MACD, or moving averages to trigger trades based on market conditions
                      </p>
                    </div>
                  </div>
                </button>

                {/* Orderbook Option */}
                <button
                  type="button"
                  onClick={() => {
                    updateConfig({ triggerType: 'orderbook' })
                    setTimeout(() => handleNext(), 100)
                  }}
                  className={`p-6 border-2 rounded-lg transition-all text-left ${
                    config.triggerType === 'orderbook'
                      ? 'border-gold-primary bg-gold-primary/5'
                      : 'border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      config.triggerType === 'orderbook' ? 'bg-gold-primary/20' : 'bg-gray-800'
                    }`}>
                      <svg className="w-6 h-6 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">Polymarket Orderbook</h3>
                      <p className="text-gray-400 text-sm">
                        Trigger trades based on Polymarket orderbook pricing conditions and market depth
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Setup Strategy */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Setup Your Strategy</h2>
                <p className="text-gray-400">Configure your trading strategy based on your chosen trigger type</p>
              </div>

              {/* Basics - Always shown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-800">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Asset</label>
                  <CustomDropdown
                    value={config.asset}
                    onChange={(v) => updateConfig({ asset: v })}
                    options={[
                      { value: 'BTC', label: 'BTC' },
                      { value: 'ETH', label: 'ETH' },
                      { value: 'SOL', label: 'SOL' },
                      { value: 'XRP', label: 'XRP' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Direction</label>
                  <CustomDropdown
                    value={config.direction}
                    onChange={(v) => updateConfig({ direction: v })}
                    options={[
                      { value: 'UP', label: 'UP' },
                      { value: 'DOWN', label: 'DOWN' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Timeframe</label>
                  <CustomDropdown
                    value={config.timeframe}
                    onChange={(v) => updateConfig({ timeframe: v })}
                    options={[
                      { value: '15m', label: '15 minutes' },
                      { value: '1h', label: '1 hour' },
                    ]}
                  />
                </div>
              </div>

              {/* Indicators Setup */}
              {config.triggerType === 'indicators' && (
                <div className="space-y-4 pt-4 border-t border-gray-800">
                  <h3 className="text-lg font-medium text-white">Indicator Signal</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Indicator Type</label>
                      <CustomDropdown
                        value={selectedIndicatorType}
                        onChange={handleIndicatorTypeChange}
                        options={indicatorTypeOptions}
                        placeholder="Select indicator type..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Indicator Preset</label>
                      <CustomDropdown
                        value={selectedPreset}
                        onChange={handlePresetChange}
                        options={filteredPresets.map(p => ({ value: p.value, label: p.label }))}
                        placeholder={selectedIndicatorType ? "Select a preset..." : "Select type first..."}
                        disabled={!selectedIndicatorType}
                      />
                    </div>
                  </div>

                  {config.indicators.length > 0 && config.conditions.length > 0 && (
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                      <p className="text-sm text-gray-300">
                        <span className="text-gold-primary font-medium">Active Signal:</span>{' '}
                        {filteredPresets.find(p => p.value === selectedPreset)?.label || 'Custom indicator'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Buy {config.direction} on {config.asset} ({config.timeframe}) when this condition is met
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Orderbook Setup */}
              {config.triggerType === 'orderbook' && (
                <div className="space-y-4 pt-4 border-t border-gray-800">
                  <div>
                    <h3 className="text-lg font-medium text-white">Orderbook Rules</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Set conditions based on Polymarket orderbook prices. Most markets trade between 40-60¢.
                    </p>
                  </div>
                  
                  <div className="bg-dark-bg border border-gray-800 rounded p-4 space-y-3">
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-sm text-gray-400">IF</span>
                      <CustomDropdown
                        value={newOrderbookRule.field}
                        onChange={(value) => setNewOrderbookRule({ ...newOrderbookRule, field: value })}
                        options={[
                          { value: 'market price per share', label: 'market price per share' },
                        ]}
                        className="w-48"
                      />
                      <CustomDropdown
                        value={newOrderbookRule.operator}
                        onChange={(value) => setNewOrderbookRule({ ...newOrderbookRule, operator: value })}
                        options={[
                          { value: 'more than', label: 'more than' },
                          { value: 'less than', label: 'less than' },
                          { value: 'equal to', label: 'equal to' },
                        ]}
                        placeholder="Operator"
                        className="w-32"
                      />
                      <div className="relative w-32">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">¢</span>
                        <input
                          type="text"
                          value={newOrderbookRule.value}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^0-9]/g, '')
                            if (numericValue === '' || (parseInt(numericValue) >= 1 && parseInt(numericValue) <= 99)) {
                              setNewOrderbookRule({ ...newOrderbookRule, value: numericValue })
                            }
                          }}
                          placeholder="Price"
                          className="w-full pl-6 pr-2 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                          maxLength={2}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddOrderbookRule}
                        disabled={!newOrderbookRule.operator || !newOrderbookRule.value}
                        className="px-4 py-2 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm rounded transition-colors focus:outline-none"
                      >
                        Add Rule
                      </button>
                    </div>
                  </div>

                  {config.orderbookRules.length > 0 && (
                    <div className="space-y-2">
                      {config.orderbookRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between bg-gray-900/50 border border-gray-800 rounded p-3"
                        >
                          <span className="text-sm text-gray-300">
                            Place orders IF {rule.field} is {rule.operator} ¢{rule.value}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              updateConfig({
                                orderbookRules: config.orderbookRules.filter(r => r.id !== rule.id),
                              })
                            }}
                            className="text-red-400 hover:text-red-300 text-sm focus:outline-none"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary rounded"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceedToStep3}
                  className="px-6 py-2 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors focus:outline-none"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Place Trades */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Place Your Trades</h2>
                <p className="text-gray-400">Configure your order ladder to define entry prices and position sizes</p>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-800">
                <div>
                  <h3 className="text-lg font-medium text-white">Order Ladder</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Set limit order prices in cents (1-99). Orders fill when market price touches or goes below your limit price.
                  </p>
                </div>
                
                <div className="bg-dark-bg border border-gray-800 rounded p-4 space-y-3">
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-sm text-gray-400">Price:</span>
                    <div className="relative w-24">
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
                        className="w-full pl-6 pr-2 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                        maxLength={2}
                      />
                    </div>
                    <span className="text-sm text-gray-400">Shares:</span>
                    <input
                      type="text"
                      value={newOrder.shares}
                      onChange={(e) => {
                        const numericValue = e.target.value.replace(/[^0-9]/g, '')
                        setNewOrder({ ...newOrder, shares: numericValue })
                      }}
                      placeholder=""
                      className="w-24 px-2 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddOrder}
                      disabled={!newOrder.price || !newOrder.shares}
                      className="px-4 py-2 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm rounded transition-colors focus:outline-none"
                    >
                      + Add Order
                    </button>
                  </div>
                </div>

                {config.orderLadder.length > 0 && (
                  <div className="space-y-2">
                    {config.orderLadder.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between bg-gray-900/50 border border-gray-800 rounded p-3"
                      >
                        <span className="text-sm text-gray-300">
                          ¢{order.price} × {order.shares} shares = ${(parseInt(order.price) * parseInt(order.shares) / 100).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            updateConfig({
                              orderLadder: config.orderLadder.filter(o => o.id !== order.id),
                            })
                          }}
                          className="text-red-400 hover:text-red-300 text-sm focus:outline-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                      <span className="text-sm text-gray-400">Total:</span>
                      <span className="text-sm text-white font-medium">
                        {config.orderLadder.reduce((sum, o) => sum + parseInt(o.shares), 0)} shares / 
                        ${config.orderLadder.reduce((sum, o) => sum + (parseInt(o.price) * parseInt(o.shares) / 100), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {config.orderLadder.length === 0 && (
                  <p className="text-sm text-gray-500">
                    Add limit orders to define your entry prices and position sizes
                  </p>
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary rounded"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceedToStep4}
                  className="px-6 py-2 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors focus:outline-none"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Exit Price */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Configure Exit Price</h2>
                <p className="text-gray-400">
                  {config.triggerType === 'indicators' 
                    ? 'Exit strategy for indicator-based trades'
                    : 'Set the price at which to sell your shares after buying'}
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-800">
                {config.triggerType === 'indicators' ? (
                  // Indicator-based: Show informational text
                  <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-primary/20 flex items-center justify-center mt-0.5">
                          <span className="text-gold-primary text-sm">ℹ</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-white font-medium mb-2">Market Resolution Exit</h3>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            Trades will be held until the market resolves. When the market closes:
                          </p>
                          <ul className="mt-3 space-y-2 text-sm text-gray-300">
                            <li className="flex items-start gap-2">
                              <span className="text-gold-primary mt-1">•</span>
                              <span><span className="text-white font-medium">If WIN:</span> You will receive <span className="text-gold-primary font-medium">$1 per share</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-gold-primary mt-1">•</span>
                              <span><span className="text-white font-medium">If LOSS:</span> You will receive <span className="text-gray-400">$0 per share</span></span>
                            </li>
                          </ul>
                          <p className="mt-4 text-xs text-gray-400 italic">
                            A WIN occurs when the market closes higher than your entry price (for UP trades) or lower than your entry price (for DOWN trades).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Orderbook-based: Show exit price input
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Exit Price (cents)</label>
                    <p className="text-xs text-gray-500 mb-4">
                      Enter the price in cents (1-99) where you want to sell your shares. This is your take profit price.
                    </p>
                    <div className="relative max-w-xs">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">¢</span>
                      <input
                        type="text"
                        value={config.exitPrice}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/[^0-9]/g, '')
                          if (numericValue === '' || (parseInt(numericValue) >= 1 && parseInt(numericValue) <= 99)) {
                            updateConfig({ exitPrice: numericValue })
                          }
                        }}
                        placeholder="Enter exit price (1-99)"
                        maxLength={2}
                        className="w-full pl-8 pr-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                      />
                    </div>
                    
                    {config.exitPrice && (
                      <div className="mt-4 bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                        <p className="text-sm text-gray-300">
                          <span className="text-gold-primary font-medium">Exit Strategy:</span>{' '}
                          Sell all shares at <span className="text-white font-medium">¢{config.exitPrice}</span> per share
                        </p>
                        {config.orderLadder.length > 0 && (
                          <p className="text-xs text-gray-400 mt-2">
                            Based on your order ladder, you'll sell {config.orderLadder.reduce((sum, o) => sum + parseInt(o.shares), 0)} shares at ¢{config.exitPrice} each
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary rounded"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceedToStep5}
                  className="px-6 py-2 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors focus:outline-none"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Backtest Settings */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Backtest Settings</h2>
                <p className="text-gray-400">Configure the number of markets/events and starting balance for your backtest</p>
              </div>

              <div className="space-y-6 pt-4 border-t border-gray-800">
                {/* Number of Markets/Events */}
                <div>
                  <h3 className="text-lg font-medium text-white mb-4">Number of Markets/Events</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Select how many markets or events to backtest
                  </p>
                  
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 20, 50, 100].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => updateConfig({ numberOfMarkets: count })}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                          config.numberOfMarkets === count
                            ? 'bg-gold-primary text-white'
                            : 'bg-dark-bg border border-gray-800 text-gray-400 hover:border-gray-700'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  
                  <div className="mt-4">
                    <label className="block text-sm text-gray-400 mb-2">Custom Number</label>
                    <input
                      type="number"
                      value={config.numberOfMarkets}
                      onChange={(e) => {
                        const value = parseInt(e.target.value)
                        if (value > 0) {
                          updateConfig({ numberOfMarkets: value })
                        }
                      }}
                      min={1}
                      max={1000}
                      className="w-full px-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                      placeholder="Enter number of markets"
                    />
                  </div>
                </div>

                {/* Starting Balance */}
                <div>
                  <h3 className="text-lg font-medium text-white mb-4">Starting Balance</h3>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={config.initialBalance}
                      onChange={(e) => updateConfig({ initialBalance: Number(e.target.value) })}
                      min={100}
                      step={100}
                      className="w-full pl-8 pr-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Backtest Info Message */}
              <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mt-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm text-blue-300 font-medium mb-1">Backtest Processing Time</p>
                    <p className="text-xs text-blue-400/80 leading-relaxed">
                      This backtest may take up to <span className="text-blue-300 font-medium">1 minute</span> to complete. 
                      The system needs to fetch historical market data, calculate indicators, and simulate trades across {config.numberOfMarkets} markets. 
                      <span className="text-blue-300 font-medium block mt-1">⚠️ Please do not navigate away from this page until the backtest completes.</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* VPS Status Check */}
              <VPSStatusIndicator />

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary rounded"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={handleRunBacktest}
                  disabled={running || !canRunBacktest}
                  className="px-6 py-2 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors focus:outline-none flex items-center gap-2"
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
            </div>
          )}

          {/* Step 6: Results */}
          {currentStep === 6 && result && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Backtest Results</h2>
                  <div className="flex items-center gap-3">
                    <p className="text-gray-400">Analysis of your strategy performance</p>
                    {result.indicatorPreset && (
                      <span className="px-3 py-1 bg-gold-primary/20 text-gold-primary rounded text-sm font-medium">
                        {result.indicatorPreset}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!backtestConfig) return
                      
                      // Store backtest config in sessionStorage for strategy creation page
                      const strategyConfig = {
                        asset: backtestConfig.asset,
                        direction: backtestConfig.direction,
                        timeframe: backtestConfig.timeframe,
                        indicators: backtestConfig.indicators || [],
                        conditions: backtestConfig.conditions || [],
                        conditionLogic: backtestConfig.conditionLogic || 'all',
                        orderbookRules: backtestConfig.orderbookRules || [],
                        orderLadder: backtestConfig.orderLadder || [],
                        useOrderLadder: (backtestConfig.orderLadder || []).length > 0,
                        triggerType: backtestConfig.triggerType,
                      }
                      
                      sessionStorage.setItem('backtestToStrategy', JSON.stringify(strategyConfig))
                      router.push('/strategies/new')
                    }}
                    className="px-4 py-2 bg-gold-primary hover:bg-gold-hover text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary"
                  >
                    Create Strategy
                  </button>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null)
                    setBacktestConfig(null)
                    setCurrentStep(1)
                    setError(null)
                    setConfig(prev => ({
                      ...prev,
                      triggerType: null,
                      indicators: [],
                      conditions: [],
                      orderbookRules: [],
                      orderLadder: [],
                      exitPrice: '',
                    }))
                    setSelectedIndicatorType('')
                    setSelectedPreset('')
                  }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded transition-colors focus:outline-none"
                >
                  Run New Backtest
                </button>
                </div>
              </div>

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

              {/* Chart Section */}
              {backtestConfig && backtestConfig.triggerType === 'indicators' && (
                <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
                  <BacktestChart
                    asset={backtestConfig.asset}
                    timeframe={backtestConfig.timeframe}
                    direction={backtestConfig.direction as 'UP' | 'DOWN'}
                    indicatorType={backtestConfig.indicators?.[0]?.type}
                    indicatorParameters={backtestConfig.indicators?.[0]?.parameters}
                  />
                </div>
              )}

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

              {/* Backtest Configuration */}
              {backtestConfig && (
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
                          <p className="text-white font-medium">{backtestConfig.asset || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 mb-1">Direction</p>
                          <p className="text-white font-medium">{backtestConfig.direction || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 mb-1">Timeframe</p>
                          <p className="text-white font-medium">{backtestConfig.timeframe || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 mb-1">Markets Tested</p>
                          <p className="text-white font-medium">{backtestConfig.numberOfMarkets || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 mb-1">Exit Price</p>
                          <p className="text-white font-medium">
                            {backtestConfig.exitPrice ? `¢${backtestConfig.exitPrice}` : 'Market End'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 mb-1">Initial Balance</p>
                          <p className="text-white font-medium">{formatCurrency(backtestConfig.initialBalance)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Trigger Type */}
                    {backtestConfig.triggerType && (
                      <div>
                        <h4 className="text-sm font-medium text-white mb-3">Entry Trigger</h4>
                        <div className="bg-gray-900/50 rounded p-3">
                          <p className="text-white font-medium capitalize mb-2">
                            {backtestConfig.triggerType === 'indicators' ? 'Asset Indicators' : 'Polymarket Orderbook'}
                          </p>
                          
                          {/* Indicator Conditions */}
                          {backtestConfig.triggerType === 'indicators' && backtestConfig.indicators.length > 0 && (
                            <div className="space-y-2 mt-2">
                              <p className="text-xs text-gray-400 uppercase tracking-wide">Indicators</p>
                              {backtestConfig.indicators.map((ind, idx) => (
                                <div key={idx} className="text-sm text-gray-300">
                                  <span className="text-white font-medium">{ind.type}</span>
                                  {ind.parameters && Object.keys(ind.parameters).length > 0 && (
                                    <span className="text-gray-400 ml-2">
                                      ({Object.entries(ind.parameters).map(([k, v]) => `${k}: ${v}`).join(', ')})
                                    </span>
                                  )}
                                </div>
                              ))}
                              {backtestConfig.conditions.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs text-gray-400 uppercase tracking-wide">Conditions</p>
                                  <p className="text-sm text-gray-300">
                                    {backtestConfig.conditionLogic === 'all' ? 'All' : 'Any'} of:
                                  </p>
                                  {backtestConfig.conditions.map((cond, idx) => (
                                    <div key={idx} className="text-sm text-gray-300 ml-2 mt-1">
                                      {cond.sourceA} {cond.operator} {cond.sourceB === 'value' ? cond.value : cond.sourceB}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Orderbook Rules */}
                          {backtestConfig.triggerType === 'orderbook' && backtestConfig.orderbookRules.length > 0 && (
                            <div className="space-y-2 mt-2">
                              <p className="text-xs text-gray-400 uppercase tracking-wide">Orderbook Rules</p>
                              {backtestConfig.orderbookRules.map((rule, idx) => (
                                <div key={idx} className="text-sm text-gray-300">
                                  IF {rule.field} {rule.operator} {rule.value}
                                  {rule.value2 && ` and ${rule.value2}`}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Order Ladder */}
                    {backtestConfig.orderLadder.length > 0 && (
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
                              {backtestConfig.orderLadder.map((order, idx) => (
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
                                  {backtestConfig.orderLadder.reduce((sum, o) => sum + parseInt(o.shares), 0)}
                                </td>
                                <td className="py-2 px-3 text-right text-white font-medium">
                                  {formatCurrency(
                                    backtestConfig.orderLadder.reduce(
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
