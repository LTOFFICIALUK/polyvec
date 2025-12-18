'use client'

import { useState, KeyboardEvent, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createStrategyAPI, updateStrategyAPI, fetchStrategy, Strategy } from '@/hooks/useStrategies'
import { useWallet } from '@/contexts/WalletContext'

type TabType = 'basics' | 'tradingview' | 'polymarket' | 'risk' | 'schedule'

interface StrategyConfig {
  name: string
  description: string
  asset: string
  direction: string
  timeframe: string
  isLive: boolean
  indicators: Array<{
    id: string
    type: string
    timeframe: string
    parameters: Record<string, number>
    useInConditions: boolean
    preset?: string
  }>
  conditionLogic: 'all' | 'any'
  conditions: Array<{
    id: string
    sourceA: string
    operator: string
    sourceB: string
    value?: number
    value2?: number
    candle: 'current' | 'previous'
  }>
  tradeOnEventsCount: number
  actions: Array<{
    id: string
    conditionId: string
    action: string
    direction: string
    market: string
    orderType: string
    orderPrice?: number
    sizing: string
    sizingValue?: number
  }>
  market: string
  side: string
  orderType: string
  positionSize: string
  maxOpenPositions: string
  maxDailyLoss: string
  maxOrdersPerHour: string
  useTakeProfit: boolean
  takeProfitPercent: string
  useStopLoss: boolean
  stopLossPercent: string
  // New Risk & Sizing fields
  orderSizeMode: 'fixed_dollar' | 'fixed_shares' | 'percentage'
  fixedDollarAmount: string
  fixedSharesAmount: string
  percentageOfBalance: string
  dynamicBaseSize: string
  dynamicMaxSize: string
  limitOrderPrice: 'best_ask' | 'best_bid' | 'mid_price' | 'custom'
  customLimitPrice: string
  adjustPriceAboveBid: boolean
  adjustPriceBelowAsk: boolean
  maxTradesPerEvent: string
  maxOpenOrders: string
  dailyTradeCap: string
  maxPositionShares: string
  maxPositionDollar: string
  unfilledOrderBehavior: 'keep_open' | 'cancel_after_seconds' | 'cancel_at_candle' | 'replace_market'
  cancelAfterSeconds: string
  useOrderLadder: boolean
  orderLadder: Array<{
    id: string
    price: string
    shares: string
  }>
  selectedDays: string[]
  timeRange: { start: string; end: string }
  runOnNewCandle: boolean
  pauseOnSettlement: boolean
  orderbookRules: Array<{
    id: string
    field: string
    operator: string
    value: string
    value2?: string
    action: string
  }>
}

function StrategyEditorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const { walletAddress: address } = useWallet()
  const [activeTab, setActiveTab] = useState<TabType>('basics')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!!editId)
  const [config, setConfig] = useState<StrategyConfig>({
    name: '',
    description: '',
    asset: 'BTC',
    direction: 'UP',
    timeframe: '15m',
    isLive: false,
    indicators: [],
    conditionLogic: 'all',
    conditions: [],
    actions: [],
    market: '',
    side: 'Buy YES',
    orderType: 'Limit',
    positionSize: '',
    maxOpenPositions: '',
    maxDailyLoss: '',
    maxOrdersPerHour: '',
    useTakeProfit: false,
    takeProfitPercent: '',
    useStopLoss: false,
    stopLossPercent: '',
    selectedDays: [],
    timeRange: { start: '09:00', end: '22:00' },
    runOnNewCandle: false,
    pauseOnSettlement: false,
    orderbookRules: [],
    tradeOnEventsCount: 1,
    orderSizeMode: 'fixed_dollar',
    fixedDollarAmount: '',
    fixedSharesAmount: '',
    percentageOfBalance: '',
    dynamicBaseSize: '',
    dynamicMaxSize: '',
    limitOrderPrice: 'best_ask',
    customLimitPrice: '',
    adjustPriceAboveBid: false,
    adjustPriceBelowAsk: false,
    maxTradesPerEvent: '',
    maxOpenOrders: '',
    dailyTradeCap: '',
    maxPositionShares: '',
    maxPositionDollar: '',
    unfilledOrderBehavior: 'keep_open',
    cancelAfterSeconds: '',
    useOrderLadder: false,
    orderLadder: [],
  })

  // Load existing strategy if editing
  useEffect(() => {
    if (!editId) {
      setIsLoading(false)
      return
    }

    const loadStrategy = async () => {
      try {
        const result = await fetchStrategy(editId)
        if (result.success && result.data) {
          const s = result.data
          setConfig({
            name: s.name || '',
            description: s.description || '',
            asset: s.asset || 'BTC',
            direction: s.direction || 'UP',
            timeframe: s.timeframe || '15m',
            isLive: s.isLive || false,
            indicators: s.indicators || [],
            conditionLogic: s.conditionLogic || 'all',
            conditions: s.conditions || [],
            actions: s.actions || [],
            market: s.market || '',
            side: s.side || 'Buy YES',
            orderType: s.orderType || 'Limit',
            positionSize: '',
            maxOpenPositions: '',
            maxDailyLoss: s.maxDailyLoss?.toString() || '',
            maxOrdersPerHour: s.maxOrdersPerHour?.toString() || '',
            useTakeProfit: s.useTakeProfit || false,
            takeProfitPercent: s.takeProfitPercent?.toString() || '',
            useStopLoss: s.useStopLoss || false,
            stopLossPercent: s.stopLossPercent?.toString() || '',
            selectedDays: s.selectedDays || [],
            timeRange: s.timeRange || { start: '09:00', end: '22:00' },
            runOnNewCandle: s.runOnNewCandle || false,
            pauseOnSettlement: s.pauseOnSettlement || false,
            orderbookRules: s.orderbookRules || [],
            tradeOnEventsCount: s.tradeOnEventsCount || 1,
            orderSizeMode: s.orderSizeMode || 'fixed_dollar',
            fixedDollarAmount: s.fixedDollarAmount?.toString() || '',
            fixedSharesAmount: s.fixedSharesAmount?.toString() || '',
            percentageOfBalance: s.percentageOfBalance?.toString() || '',
            dynamicBaseSize: s.dynamicBaseSize?.toString() || '',
            dynamicMaxSize: s.dynamicMaxSize?.toString() || '',
            limitOrderPrice: s.limitOrderPrice || 'best_ask',
            customLimitPrice: s.customLimitPrice?.toString() || '',
            adjustPriceAboveBid: s.adjustPriceAboveBid || false,
            adjustPriceBelowAsk: s.adjustPriceBelowAsk || false,
            maxTradesPerEvent: s.maxTradesPerEvent?.toString() || '',
            maxOpenOrders: s.maxOpenOrders?.toString() || '',
            dailyTradeCap: s.dailyTradeCap?.toString() || '',
            maxPositionShares: s.maxPositionShares?.toString() || '',
            maxPositionDollar: s.maxPositionDollar?.toString() || '',
            unfilledOrderBehavior: s.unfilledOrderBehavior || 'keep_open',
            cancelAfterSeconds: s.cancelAfterSeconds?.toString() || '',
            useOrderLadder: s.useOrderLadder || false,
            orderLadder: s.orderLadder || [],
          })
        } else {
          setSaveError('Failed to load strategy')
        }
      } catch (error) {
        console.error('Error loading strategy:', error)
        setSaveError('Error loading strategy')
      } finally {
        setIsLoading(false)
      }
    }

    loadStrategy()
  }, [editId])

  const handleSave = async () => {
    if (!address) {
      setSaveError('Please connect your wallet to save strategies')
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      // Convert config to API format
      const strategyData: Partial<Strategy> = {
        userAddress: address,
        name: config.name,
        description: config.description || undefined,
        asset: config.asset,
        direction: config.direction,
        timeframe: config.timeframe,
        isLive: config.isLive,
        indicators: config.indicators,
        conditionLogic: config.conditionLogic,
        conditions: config.conditions,
        actions: config.actions,
        tradeOnEventsCount: config.tradeOnEventsCount,
        market: config.market || undefined,
        side: config.side || undefined,
        orderType: config.orderType || undefined,
        orderbookRules: config.orderbookRules,
        orderSizeMode: config.orderSizeMode,
        fixedDollarAmount: config.fixedDollarAmount ? parseFloat(config.fixedDollarAmount) : undefined,
        fixedSharesAmount: config.fixedSharesAmount ? parseInt(config.fixedSharesAmount) : undefined,
        percentageOfBalance: config.percentageOfBalance ? parseFloat(config.percentageOfBalance) : undefined,
        dynamicBaseSize: config.dynamicBaseSize ? parseFloat(config.dynamicBaseSize) : undefined,
        dynamicMaxSize: config.dynamicMaxSize ? parseFloat(config.dynamicMaxSize) : undefined,
        limitOrderPrice: config.limitOrderPrice,
        customLimitPrice: config.customLimitPrice ? parseFloat(config.customLimitPrice) : undefined,
        adjustPriceAboveBid: config.adjustPriceAboveBid,
        adjustPriceBelowAsk: config.adjustPriceBelowAsk,
        maxTradesPerEvent: config.maxTradesPerEvent ? parseInt(config.maxTradesPerEvent) : undefined,
        maxOpenOrders: config.maxOpenOrders ? parseInt(config.maxOpenOrders) : undefined,
        dailyTradeCap: config.dailyTradeCap ? parseInt(config.dailyTradeCap) : undefined,
        maxDailyLoss: config.maxDailyLoss ? parseFloat(config.maxDailyLoss) : undefined,
        maxOrdersPerHour: config.maxOrdersPerHour ? parseInt(config.maxOrdersPerHour) : undefined,
        maxPositionShares: config.maxPositionShares ? parseInt(config.maxPositionShares) : undefined,
        maxPositionDollar: config.maxPositionDollar ? parseFloat(config.maxPositionDollar) : undefined,
        useTakeProfit: config.useTakeProfit,
        takeProfitPercent: config.takeProfitPercent ? parseFloat(config.takeProfitPercent) : undefined,
        useStopLoss: config.useStopLoss,
        stopLossPercent: config.stopLossPercent ? parseFloat(config.stopLossPercent) : undefined,
        unfilledOrderBehavior: config.unfilledOrderBehavior,
        cancelAfterSeconds: config.cancelAfterSeconds ? parseInt(config.cancelAfterSeconds) : undefined,
        useOrderLadder: config.useOrderLadder,
        orderLadder: config.orderLadder,
        selectedDays: config.selectedDays,
        timeRange: config.timeRange,
        runOnNewCandle: config.runOnNewCandle,
        pauseOnSettlement: config.pauseOnSettlement,
      }

      let result
      if (editId) {
        // Update existing strategy
        result = await updateStrategyAPI(editId, strategyData)
      } else {
        // Create new strategy
        result = await createStrategyAPI({ ...strategyData, isActive: false } as Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>)
      }

      if (result.success && result.data) {
        // Navigate back to the strategy detail page or list
        router.push(editId ? `/strategies/${editId}` : '/strategies')
      } else {
        setSaveError(result.error || 'Failed to save strategy')
      }
    } catch (error) {
      console.error('Error saving strategy:', error)
      setSaveError('An error occurred while saving')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    router.push(editId ? `/strategies/${editId}` : '/strategies')
  }

  const updateConfig = (updates: Partial<StrategyConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }))
  }


  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'basics', label: 'Basics' },
    { id: 'tradingview', label: 'TradingView Signals' },
    { id: 'polymarket', label: 'Polymarket Logic' },
    { id: 'risk', label: 'Risk & Sizing' },
    { id: 'schedule', label: 'Schedule' },
  ]

  const isValidConfig = config.name.length > 0 && config.asset && config.timeframe

  // Show loading state while fetching strategy for edit
  if (isLoading) {
    return (
      <div className="bg-dark-bg text-white min-h-screen">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-primary mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Loading strategy...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-bg text-white min-h-screen">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">{editId ? 'Edit Strategy' : 'New Strategy'}</h1>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-black rounded"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isValidConfig || saving || !address}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors duration-200 focus:outline-none"
            >
              {saving ? 'Saving...' : !address ? 'Connect Wallet' : editId ? 'Update Strategy' : 'Save Strategy'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {saveError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{saveError}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Form */}
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div className="border-b border-gray-800 mb-6">
              <nav className="flex space-x-6" aria-label="Tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-gold-primary text-gold-primary'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
              {activeTab === 'basics' && (
                <BasicsTab config={config} updateConfig={updateConfig} />
              )}
              {activeTab === 'tradingview' && (
                <TradingViewTab config={config} updateConfig={updateConfig} />
              )}
              {activeTab === 'polymarket' && (
                <PolymarketTab config={config} updateConfig={updateConfig} />
              )}
              {activeTab === 'risk' && (
                <RiskTab config={config} updateConfig={updateConfig} />
              )}
              {activeTab === 'schedule' && (
                <ScheduleTab config={config} updateConfig={updateConfig} />
              )}
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="lg:col-span-1">
            <PreviewPanel config={config} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Preset Selector Component with Eye Icons
interface PresetSelectorProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  className?: string
  onPreviewClick?: (presetValue: string) => void
}

const PresetSelector = ({ value, onChange, options, placeholder, className = '', onPreviewClick }: PresetSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const selectedOption = options.find((opt) => opt.value === value)

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  const handleEyeClick = (e: React.MouseEvent, presetValue: string) => {
    e.stopPropagation()
    setIsOpen(false) // Close dropdown when opening preview
    if (onPreviewClick && presetValue !== 'custom') {
      onPreviewClick(presetValue)
    }
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full pl-3 pr-8 py-2 bg-dark-bg border border-gray-800 rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent transition-colors ${
          isOpen ? 'border-gold-primary/50' : 'hover:border-gray-700'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="block truncate">
          {selectedOption ? selectedOption.label : placeholder || 'Select...'}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-30 w-full mt-1 bg-dark-bg border border-gray-800 rounded shadow-lg max-h-60 overflow-auto">
          <ul role="listbox" className="py-1">
            {options.map((option) => (
              <li
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`px-3 py-2 cursor-pointer transition-colors flex items-center justify-between ${
                  value === option.value
                    ? 'bg-gold-primary/20 text-gold-primary'
                    : 'text-white hover:bg-gray-900/50'
                }`}
                role="option"
                aria-selected={value === option.value}
              >
                <span>{option.label}</span>
                {option.value !== 'custom' && onPreviewClick && (
                  <button
                    type="button"
                    onClick={(e) => handleEyeClick(e, option.value)}
                    className="p-1.5 hover:bg-gray-800 rounded transition-colors ml-2 flex-shrink-0"
                    aria-label={`Preview ${option.label}`}
                    title="Preview preset"
                  >
                    <svg
                      className="w-4 h-4 text-gray-500 hover:text-gold-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Custom Dropdown Component
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
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const selectedOption = options.find((opt) => opt.value === value)

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(!isOpen)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
      } else {
        const currentIndex = options.findIndex((opt) => opt.value === value)
        const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0
        onChange(options[nextIndex].value)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (isOpen) {
        const currentIndex = options.findIndex((opt) => opt.value === value)
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1
        onChange(options[prevIndex].value)
      }
    }
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={disabled ? undefined : handleKeyDown}
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
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
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
          <ul
            role="listbox"
            className="py-1"
          >
            {options.map((option) => (
              <li
                key={option.value}
                onClick={() => handleSelect(option.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSelect(option.value)
                  }
                }}
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
                    <svg
                      className="w-4 h-4 text-gold-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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

// Basics Tab Component
function BasicsTab({
  config,
  updateConfig,
}: {
  config: StrategyConfig
  updateConfig: (updates: Partial<StrategyConfig>) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Strategy Name
        </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            className="w-full px-4 py-2 bg-dark-bg border border-gray-800 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
            placeholder="Enter strategy name"
          />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Description
        </label>
          <textarea
            value={config.description}
            onChange={(e) => updateConfig({ description: e.target.value })}
            rows={4}
            className="w-full px-4 py-2 bg-dark-bg border border-gray-800 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
            placeholder="Describe your strategy"
          />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Asset
          </label>
          <CustomDropdown
            value={config.asset}
            onChange={(value) => updateConfig({ asset: value })}
            options={[
              { value: 'BTC', label: 'BTC' },
              { value: 'SOL', label: 'SOL' },
              { value: 'ETH', label: 'ETH' },
              { value: 'XRP', label: 'XRP' },
            ]}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Direction
          </label>
          <CustomDropdown
            value={config.direction}
            onChange={(value) => updateConfig({ direction: value })}
            options={[
              { value: 'UP', label: 'UP' },
              { value: 'DOWN', label: 'DOWN' },
            ]}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Timeframe
          </label>
          <CustomDropdown
            value={config.timeframe}
            onChange={(value) => updateConfig({ timeframe: value })}
            options={[
              { value: '15m', label: '15m' },
              { value: '1h', label: '1h' },
            ]}
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={config.isLive}
            onChange={(e) => updateConfig({ isLive: e.target.checked })}
            className="w-4 h-4 text-gold-primary bg-dark-bg border-gray-800 rounded focus:ring-gold-primary"
          />
          <span className="text-sm font-medium text-gray-300">Live Trading</span>
          <span className="text-xs text-gray-500">(Unchecked = Paper Trading)</span>
        </label>
      </div>
    </div>
  )
}

// TradingView Tab Component
function TradingViewTab({
  config,
  updateConfig,
}: {
  config: StrategyConfig
  updateConfig: (updates: Partial<StrategyConfig>) => void
}) {
  const [expandedIndicators, setExpandedIndicators] = useState<Set<string>>(new Set())
  const [editingIndicators, setEditingIndicators] = useState<Set<string>>(new Set())
  const [showAddIndicatorForm, setShowAddIndicatorForm] = useState(false)
  const [newIndicator, setNewIndicator] = useState({
    preset: '',
    type: '',
    timeframe: 'Use strategy timeframe',
    parameters: {} as Record<string, number>,
  })
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  useEffect(() => {
    if (previewImage) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [previewImage])
  const [newCondition, setNewCondition] = useState({
    sourceA: '',
    operator: '',
    sourceB: '',
    value: '',
    value2: '',
    candle: 'current' as 'current' | 'previous',
  })
  const [newAction, setNewAction] = useState({
    conditionId: '',
    action: '',
    direction: '',
    market: '',
    orderType: '',
    orderPrice: '',
    sizing: '',
    sizingValue: '',
  })

  const indicatorTypes = [
    'RSI',
    'MACD',
    'SMA',
    'EMA',
    'Bollinger Bands',
    'Stochastic',
    'VWAP',
    'ATR',
    'Rolling Up %',
  ]

  const getPresetImage = (presetValue: string): string => {
    // In production, these would be actual image paths
    const imageMap: Record<string, string> = {
      macd_bullish: '/images/presets/macd-bullish.png',
      macd_bearish: '/images/presets/macd-bearish.png',
      rsi_oversold: '/images/presets/rsi-oversold.png',
      rsi_overbought: '/images/presets/rsi-overbought.png',
      ema_short: '/images/presets/ema-short.png',
      ema_long: '/images/presets/ema-long.png',
      bb_upper: '/images/presets/bb-upper.png',
      bb_lower: '/images/presets/bb-lower.png',
    }
    return imageMap[presetValue] || ''
  }

  const getPresetsForType = (type: string) => {
    switch (type) {
      case 'MACD':
        return [
          { value: 'custom', label: 'Custom' },
          { value: 'macd_bullish', label: 'MACD Bullish Crossover' },
          { value: 'macd_bearish', label: 'MACD Bearish Crossover' },
        ]
      case 'RSI':
        return [
          { value: 'custom', label: 'Custom' },
          { value: 'rsi_oversold', label: 'RSI Oversold Reversal' },
          { value: 'rsi_overbought', label: 'RSI Overbought Reversal' },
        ]
      case 'EMA':
        return [
          { value: 'custom', label: 'Custom' },
          { value: 'ema_short', label: 'EMA Trend Flip (9/21)' },
          { value: 'ema_long', label: 'EMA Trend Flip (20/50)' },
        ]
      case 'Bollinger Bands':
        return [
          { value: 'custom', label: 'Custom' },
          { value: 'bb_upper', label: 'BB Breakout (Upper)' },
          { value: 'bb_lower', label: 'BB Breakout (Lower)' },
        ]
      case 'Rolling Up %':
        return [
          { value: 'custom', label: 'Custom' },
          { value: 'up_pct_bullish', label: 'Bullish (≥58%)' },
          { value: 'up_pct_bearish', label: 'Bearish (≤42%)' },
        ]
      default:
        return [{ value: 'custom', label: 'Custom' }]
    }
  }

  const applyPreset = (presetValue: string) => {
    if (presetValue === 'custom') {
      setNewIndicator({ preset: 'custom', type: '', timeframe: 'Use strategy timeframe', parameters: {} })
      return
    }

    const newIndicators: typeof config.indicators = []
    const newConditions: typeof config.conditions = []
    const newActions: typeof config.actions = []

    switch (presetValue) {
      case 'macd_bullish': {
        const macdId = Date.now().toString()
        newIndicators.push({
          id: macdId,
          type: 'MACD',
          timeframe: 'Use strategy timeframe',
          parameters: { fast: 12, slow: 26, signal: 9 },
          useInConditions: true, // Always true, checkbox removed
          preset: 'macd_bullish',
        })
        const conditionId = (Date.now() + 1).toString()
        newConditions.push({
          id: conditionId,
          sourceA: `indicator_${macdId}`,
          operator: 'crosses above',
          sourceB: '',
          value: 0,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Long (Buy YES)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
      case 'macd_bearish': {
        const macdId = Date.now().toString()
        newIndicators.push({
          id: macdId,
          type: 'MACD',
          timeframe: 'Use strategy timeframe',
          parameters: { fast: 12, slow: 26, signal: 9 },
          useInConditions: true, // Always true, checkbox removed
          preset: 'macd_bearish',
        })
        const conditionId = (Date.now() + 1).toString()
        newConditions.push({
          id: conditionId,
          sourceA: `indicator_${macdId}`,
          operator: 'crosses below',
          sourceB: '',
          value: 0,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Short (Buy NO)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
      case 'rsi_oversold': {
        const rsiId = Date.now().toString()
        newIndicators.push({
          id: rsiId,
          type: 'RSI',
          timeframe: 'Use strategy timeframe',
          parameters: { length: 14 },
          useInConditions: true, // Always true, checkbox removed
          preset: 'rsi_oversold',
        })
        const conditionId = (Date.now() + 1).toString()
        newConditions.push({
          id: conditionId,
          sourceA: `indicator_${rsiId}`,
          operator: 'crosses above',
          sourceB: '',
          value: 30,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Long (Buy YES)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
      case 'rsi_overbought': {
        const rsiId = Date.now().toString()
        newIndicators.push({
          id: rsiId,
          type: 'RSI',
          timeframe: 'Use strategy timeframe',
          parameters: { length: 14 },
          useInConditions: true, // Always true, checkbox removed
          preset: 'rsi_overbought',
        })
        const conditionId = (Date.now() + 1).toString()
        newConditions.push({
          id: conditionId,
          sourceA: `indicator_${rsiId}`,
          operator: 'crosses below',
          sourceB: '',
          value: 70,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Short (Buy NO)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
      case 'ema_short': {
        const ema9Id = Date.now().toString()
        const ema21Id = (Date.now() + 1).toString()
        newIndicators.push(
          {
            id: ema9Id,
            type: 'EMA',
            timeframe: 'Use strategy timeframe',
            parameters: { length: 9 },
            useInConditions: true, // Always true, checkbox removed
            preset: 'ema_short',
          },
          {
            id: ema21Id,
            type: 'EMA',
            timeframe: 'Use strategy timeframe',
            parameters: { length: 21 },
            useInConditions: true, // Always true, checkbox removed
            preset: 'ema_short',
          }
        )
        const conditionId = (Date.now() + 2).toString()
        newConditions.push({
          id: conditionId,
          sourceA: `indicator_${ema9Id}`,
          operator: 'crosses above',
          sourceB: `indicator_${ema21Id}`,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Long (Buy YES)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
      case 'ema_long': {
        const ema20Id = Date.now().toString()
        const ema50Id = (Date.now() + 1).toString()
        newIndicators.push(
          {
            id: ema20Id,
            type: 'EMA',
            timeframe: 'Use strategy timeframe',
            parameters: { length: 20 },
            useInConditions: true, // Always true, checkbox removed
            preset: 'ema_long',
          },
          {
            id: ema50Id,
            type: 'EMA',
            timeframe: 'Use strategy timeframe',
            parameters: { length: 50 },
            useInConditions: true, // Always true, checkbox removed
            preset: 'ema_long',
          }
        )
        const conditionId = (Date.now() + 2).toString()
        newConditions.push({
          id: conditionId,
          sourceA: `indicator_${ema20Id}`,
          operator: 'crosses below',
          sourceB: `indicator_${ema50Id}`,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Short (Buy NO)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
      case 'bb_upper': {
        const bbId = Date.now().toString()
        newIndicators.push({
          id: bbId,
          type: 'Bollinger Bands',
          timeframe: 'Use strategy timeframe',
          parameters: { length: 20, stdDev: 2 },
          useInConditions: true, // Always true, checkbox removed
          preset: 'bb_upper',
        })
        const conditionId = (Date.now() + 1).toString()
        newConditions.push({
          id: conditionId,
          sourceA: 'Close',
          operator: '>',
          sourceB: `indicator_${bbId}`,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Long (Buy YES)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
      case 'bb_lower': {
        const bbId = Date.now().toString()
        newIndicators.push({
          id: bbId,
          type: 'Bollinger Bands',
          timeframe: 'Use strategy timeframe',
          parameters: { length: 20, stdDev: 2 },
          useInConditions: true, // Always true, checkbox removed
          preset: 'bb_lower',
        })
        const conditionId = (Date.now() + 1).toString()
        newConditions.push({
          id: conditionId,
          sourceA: 'Close',
          operator: '<',
          sourceB: `indicator_${bbId}`,
          candle: 'current',
        })
        newActions.push({
          id: Date.now().toString(),
          conditionId,
          action: 'Open position',
          direction: 'Short (Buy NO)',
          market: `${config.asset} ${config.timeframe} ${config.direction}`,
          orderType: 'Market',
          sizing: 'Strategy default size',
        })
        break
      }
    }

    if (newIndicators.length > 0) {
      updateConfig({
        indicators: [...config.indicators, ...newIndicators],
        conditions: [...config.conditions, ...newConditions],
        actions: [...config.actions, ...newActions],
      })

      // Expand all new indicators
      newIndicators.forEach((ind) => {
        setExpandedIndicators((prev) => new Set([...Array.from(prev), ind.id]))
      })
    }
  }

  const handlePresetChange = (presetValue: string) => {
    if (presetValue === 'custom') {
      setNewIndicator({ ...newIndicator, preset: 'custom' })
      return
    }

    // Auto-fill parameters based on preset
    let newParams = { ...newIndicator.parameters }
    switch (presetValue) {
      case 'macd_bullish':
      case 'macd_bearish':
        newParams = { fast: 12, slow: 26, signal: 9 }
        break
      case 'rsi_oversold':
      case 'rsi_overbought':
        newParams = { length: 14 }
        break
      case 'ema_short':
        newParams = { length: 9 }
        break
      case 'ema_long':
        newParams = { length: 20 }
        break
      case 'bb_upper':
      case 'bb_lower':
        newParams = { length: 20, stdDev: 2 }
        break
    }

    setNewIndicator({ ...newIndicator, preset: presetValue, parameters: newParams })
  }

  const getIndicatorParameters = (type: string) => {
    switch (type) {
      case 'RSI':
        return [{ name: 'Length', key: 'length', default: 14 }]
      case 'MACD':
        return [
          { name: 'Fast', key: 'fast', default: 12 },
          { name: 'Slow', key: 'slow', default: 26 },
          { name: 'Signal', key: 'signal', default: 9 },
        ]
      case 'SMA':
      case 'EMA':
        return [{ name: 'Length', key: 'length', default: 20 }]
      case 'Bollinger Bands':
        return [
          { name: 'Length', key: 'length', default: 20 },
          { name: 'StdDev', key: 'stdDev', default: 2 },
        ]
      case 'Stochastic':
        return [
          { name: 'K', key: 'k', default: 14 },
          { name: 'D', key: 'd', default: 3 },
          { name: 'Smoothing', key: 'smoothing', default: 3 },
        ]
      case 'ATR':
        return [{ name: 'Length', key: 'length', default: 14 }]
      case 'Rolling Up %':
        return [{ name: 'Lookback', key: 'length', default: 50 }]
      default:
        return []
    }
  }

  const getIndicatorLabel = (indicator: typeof config.indicators[0]) => {
    const params = Object.entries(indicator.parameters)
      .map(([key, value]) => `${value}`)
      .join(', ')
    return `${indicator.type}(${params})`
  }

  const getSourceOptions = () => {
    const sources: Array<{ value: string; label: string }> = [
      { value: 'Close', label: 'Close' },
      { value: 'Open', label: 'Open' },
      { value: 'High', label: 'High' },
      { value: 'Low', label: 'Low' },
    ]

    config.indicators.forEach((ind) => {
      sources.push({
        value: `indicator_${ind.id}`,
        label: getIndicatorLabel(ind),
      })
    })

    return sources
  }

  const handleAddIndicator = () => {
    if (!newIndicator.type) return

    // If preset is selected and not custom, apply full preset
    if (newIndicator.preset && newIndicator.preset !== 'custom') {
      applyPreset(newIndicator.preset)
      // Close the form and reset state after applying preset
      setNewIndicator({ preset: '', type: '', timeframe: 'Use strategy timeframe', parameters: {} })
      setShowAddIndicatorForm(false)
      return
    }

    // Otherwise add custom indicator
    const newId = Date.now().toString()
    const params = newIndicator.parameters && Object.keys(newIndicator.parameters).length > 0
      ? newIndicator.parameters
      : getIndicatorParameters(newIndicator.type).reduce(
          (acc, param) => {
            acc[param.key] = param.default
            return acc
          },
          {} as Record<string, number>
        )

    updateConfig({
      indicators: [
        ...config.indicators,
        {
          id: newId,
          type: newIndicator.type,
          timeframe: newIndicator.timeframe,
          parameters: params,
          useInConditions: true, // Always true, checkbox removed
          preset: newIndicator.preset && newIndicator.preset !== 'custom' ? newIndicator.preset : undefined,
        },
      ],
    })
    setExpandedIndicators(new Set([...Array.from(expandedIndicators), newId]))
    setNewIndicator({ preset: '', type: '', timeframe: 'Use strategy timeframe', parameters: {} })
    setShowAddIndicatorForm(false)
  }

  // Show form by default if no indicators exist
  useEffect(() => {
    if (config.indicators.length === 0) {
      setShowAddIndicatorForm(true)
    }
  }, [config.indicators.length])


  // Auto-update market when asset or timeframe changes
  useEffect(() => {
    if (config.asset && config.timeframe) {
      const marketValue = `${config.asset} ${config.timeframe}`
      if (config.market !== marketValue) {
        updateConfig({ market: marketValue })
      }
    }
  }, [config.asset, config.timeframe])

  // Auto-update side when direction changes
  useEffect(() => {
    if (config.direction) {
      const sideValue = config.direction
      if (config.side !== sideValue) {
        updateConfig({ side: sideValue })
      }
    }
  }, [config.direction])

  const handleDeleteIndicator = (id: string) => {
    updateConfig({
      indicators: config.indicators.filter((ind) => ind.id !== id),
      conditions: config.conditions.filter((c) => !c.sourceA.includes(id) && !c.sourceB.includes(id)),
    })
  }

  const handleToggleIndicator = (id: string) => {
    const newExpanded = new Set(expandedIndicators)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIndicators(newExpanded)
  }

  const handleUpdateIndicator = (id: string, updates: Partial<typeof config.indicators[0]>) => {
    updateConfig({
      indicators: config.indicators.map((ind) =>
        ind.id === id ? { ...ind, ...updates } : ind
      ),
    })
  }

  const handleAddCondition = () => {
    if (newCondition.sourceA && newCondition.operator && (newCondition.sourceB || newCondition.value)) {
      updateConfig({
        conditions: [
          ...config.conditions,
          {
            id: Date.now().toString(),
            sourceA: newCondition.sourceA,
            operator: newCondition.operator,
            sourceB: newCondition.sourceB || '',
            value: newCondition.value ? parseFloat(newCondition.value) : undefined,
            value2: newCondition.value2 ? parseFloat(newCondition.value2) : undefined,
            candle: newCondition.candle,
          },
        ],
      })
      setNewCondition({
        sourceA: '',
        operator: '',
        sourceB: '',
        value: '',
        value2: '',
        candle: 'current',
      })
    }
  }

  const handleDeleteCondition = (id: string) => {
    updateConfig({
      conditions: config.conditions.filter((c) => c.id !== id),
    })
  }

  const handleAddAction = () => {
    if (newAction.conditionId && newAction.action && newAction.direction && newAction.market && newAction.sizing) {
      updateConfig({
        actions: [
          ...config.actions,
          {
            id: Date.now().toString(),
            conditionId: newAction.conditionId,
            action: newAction.action,
            direction: newAction.direction,
            market: newAction.market,
            orderType: newAction.orderType,
            orderPrice: newAction.orderPrice ? parseFloat(newAction.orderPrice) : undefined,
            sizing: newAction.sizing,
            sizingValue: newAction.sizingValue ? parseFloat(newAction.sizingValue) : undefined,
          },
        ],
      })
      setNewAction({
        conditionId: '',
        action: '',
        direction: '',
        market: '',
        orderType: '',
        orderPrice: '',
        sizing: '',
        sizingValue: '',
      })
    }
  }

  const handleDeleteAction = (id: string) => {
    updateConfig({
      actions: config.actions.filter((a) => a.id !== id),
    })
  }

  const markets = [
    `${config.asset} ${config.timeframe} ${config.direction}`,
    `${config.asset} ${config.timeframe} ${config.direction === 'UP' ? 'DOWN' : 'UP'}`,
  ]

  return (
    <div className="space-y-8">
      {/* Preview Image Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-bg/80 backdrop-blur-sm p-4"
          onClick={() => setPreviewImage(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div
            className="relative bg-dark-bg border border-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ margin: 'auto' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
              <h3 className="text-lg font-medium text-white">Preset Preview</h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-gray-400 hover:text-white transition-colors p-1"
                aria-label="Close preview"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <img
                src={previewImage}
                alt="Preset preview"
                className="w-full h-auto rounded mx-auto"
                onError={(e) => {
                  // Fallback if image doesn't exist
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  const parent = target.parentElement
                  if (parent) {
                    parent.innerHTML = `
                      <div class="text-center py-12 text-gray-400">
                        <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p>Preview image coming soon</p>
                      </div>
                    `
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
      {/* 1. Indicators Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Indicators used in this strategy</h3>
          {!showAddIndicatorForm && (
            <button
              type="button"
              onClick={() => setShowAddIndicatorForm(true)}
              className="px-4 py-2 bg-gold-primary hover:bg-gold-hover text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary"
            >
              + Add Indicator
            </button>
          )}
        </div>

        {/* Add Indicator Form */}
        {showAddIndicatorForm && (
          <div className="bg-dark-bg border border-gray-800 rounded p-4 mb-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-2">Indicator Type</label>
              <CustomDropdown
                value={newIndicator.type}
                onChange={(value) => {
                  const params = getIndicatorParameters(value).reduce(
                    (acc, param) => {
                      acc[param.key] = param.default
                      return acc
                    },
                    {} as Record<string, number>
                  )
                  setNewIndicator({ 
                    preset: '', 
                    type: value, 
                    timeframe: 'Use strategy timeframe', 
                    parameters: params 
                  })
                }}
                options={indicatorTypes.map((type) => ({ value: type, label: type }))}
                placeholder="Select indicator type"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">Preset</label>
              <PresetSelector
                value={newIndicator.preset}
                onChange={handlePresetChange}
                options={getPresetsForType(newIndicator.type)}
                placeholder="Select preset"
                className={!newIndicator.type ? 'opacity-50' : ''}
                onPreviewClick={(presetValue) => {
                  const imagePath = getPresetImage(presetValue)
                  if (imagePath) {
                    setPreviewImage(imagePath)
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">Timeframe</label>
              <CustomDropdown
                value={newIndicator.timeframe}
                onChange={(value) => setNewIndicator({ ...newIndicator, timeframe: value })}
                options={[
                  { value: 'Use strategy timeframe', label: 'Use strategy timeframe' },
                  { value: '15m', label: '15m' },
                  { value: '1h', label: '1h' },
                  { value: '4h', label: '4h' },
                  { value: '1d', label: '1d' },
                ]}
              />
            </div>
          </div>

          {/* Show parameters if indicator type is selected */}
          {newIndicator.type && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Indicator Parameters</label>
              <div className="grid grid-cols-3 gap-3">
                {getIndicatorParameters(newIndicator.type).map((param) => (
                  <div key={param.key}>
                    <label className="block text-xs text-gray-500 mb-1">{param.name}</label>
                    <input
                      type="number"
                      value={newIndicator.parameters[param.key] || param.default}
                      onChange={(e) => {
                        const newParams = {
                          ...newIndicator.parameters,
                          [param.key]: parseFloat(e.target.value) || param.default,
                        }
                        setNewIndicator({ ...newIndicator, parameters: newParams })
                      }}
                      disabled={!!(newIndicator.preset && newIndicator.preset !== 'custom')}
                      className={`w-full px-3 py-1.5 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent ${
                        newIndicator.preset && newIndicator.preset !== 'custom'
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    />
                  </div>
                ))}
              </div>
              {newIndicator.preset && newIndicator.preset !== 'custom' && (
                <p className="mt-2 text-xs text-gray-500">
                  Parameters are locked for this preset. Select "Custom" to modify.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddIndicatorForm(false)
                setNewIndicator({ preset: '', type: '', timeframe: 'Use strategy timeframe', parameters: {} })
              }}
              className="px-4 py-2 bg-dark-bg hover:bg-gray-900 border border-gray-800 text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddIndicator}
              disabled={!newIndicator.type}
              className="px-4 py-2 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary"
            >
              {newIndicator.preset && newIndicator.preset !== 'custom' ? 'Apply Preset' : '+ Add Indicator'}
            </button>
          </div>
        </div>
        )}

        <div className="space-y-2">
          {config.indicators.map((indicator) => {
            const isExpanded = expandedIndicators.has(indicator.id)
            const isEditing = editingIndicators.has(indicator.id)
            const hasPreset = Boolean(indicator.preset && indicator.preset !== 'custom')
            const params = getIndicatorParameters(indicator.type)
            const isLocked = hasPreset && !isEditing

            return (
              <div key={indicator.id} className="bg-dark-bg border border-gray-800 rounded">
                <div className="flex items-center justify-between p-3">
                  <button
                    type="button"
                    onClick={() => handleToggleIndicator(indicator.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className={`text-sm font-medium ${isLocked ? 'text-gray-500' : 'text-white'}`}>
                      {getIndicatorLabel(indicator)}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {isLocked && (
                      <button
                        type="button"
                        onClick={() => {
                          const newEditing = new Set(editingIndicators)
                          newEditing.add(indicator.id)
                          setEditingIndicators(newEditing)
                        }}
                        className="px-3 py-1.5 text-xs bg-gold-primary hover:bg-gold-hover text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteIndicator(indicator.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className={`px-3 pb-3 space-y-3 border-t border-gray-800 pt-3 ${isLocked ? 'opacity-50' : ''}`}>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={`block text-xs mb-1 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>Indicator Type</label>
                        <div className={isLocked ? 'pointer-events-none' : ''}>
                          <CustomDropdown
                            value={indicator.type}
                            onChange={(value) => {
                              const newParams = getIndicatorParameters(value).reduce(
                                (acc, param) => {
                                  acc[param.key] = param.default
                                  return acc
                                },
                                {} as Record<string, number>
                              )
                              handleUpdateIndicator(indicator.id, { type: value, parameters: newParams, preset: undefined })
                            }}
                            options={indicatorTypes.map((type) => ({ value: type, label: type }))}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={`block text-xs mb-1 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>Preset</label>
                        <div className={isLocked ? 'pointer-events-none' : ''}>
                          <PresetSelector
                            value={indicator.preset || 'custom'}
                            onChange={(presetValue) => {
                              if (presetValue === 'custom') {
                                handleUpdateIndicator(indicator.id, { preset: undefined })
                                const newEditing = new Set(editingIndicators)
                                newEditing.delete(indicator.id)
                                setEditingIndicators(newEditing)
                                return
                              }
                              
                              // Auto-fill parameters based on preset
                              let newParams = { ...indicator.parameters }
                              switch (presetValue) {
                                case 'macd_bullish':
                                case 'macd_bearish':
                                  newParams = { fast: 12, slow: 26, signal: 9 }
                                  break
                                case 'rsi_oversold':
                                case 'rsi_overbought':
                                  newParams = { length: 14 }
                                  break
                                case 'ema_short':
                                  newParams = { length: 9 }
                                  break
                                case 'ema_long':
                                  newParams = { length: 20 }
                                  break
                                case 'bb_upper':
                                case 'bb_lower':
                                  newParams = { length: 20, stdDev: 2 }
                                  break
                              }
                              handleUpdateIndicator(indicator.id, { preset: presetValue, parameters: newParams })
                              const newEditing = new Set(editingIndicators)
                              newEditing.delete(indicator.id)
                              setEditingIndicators(newEditing)
                            }}
                            options={getPresetsForType(indicator.type)}
                            placeholder="Select preset"
                            onPreviewClick={(presetValue) => {
                              const imagePath = getPresetImage(presetValue)
                              if (imagePath) {
                                setPreviewImage(imagePath)
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={`block text-xs mb-1 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>Timeframe</label>
                        <div className={isLocked ? 'pointer-events-none' : ''}>
                          <CustomDropdown
                            value={indicator.timeframe}
                            onChange={(value) => handleUpdateIndicator(indicator.id, { timeframe: value })}
                            options={[
                              { value: 'Use strategy timeframe', label: 'Use strategy timeframe' },
                              { value: '15m', label: '15m' },
                              { value: '1h', label: '1h' },
                              { value: '4h', label: '4h' },
                              { value: '1d', label: '1d' },
                            ]}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs mb-2 ${isLocked ? 'text-gray-600' : 'text-gray-400'}`}>Indicator Parameters</label>
                      <div className="grid grid-cols-3 gap-3">
                        {params.map((param) => (
                          <div key={param.key}>
                            <label className={`block text-xs mb-1 ${isLocked ? 'text-gray-600' : 'text-gray-500'}`}>{param.name}</label>
                            <input
                              type="number"
                              value={indicator.parameters[param.key] || param.default}
                              onChange={(e) => {
                                const newParams = {
                                  ...indicator.parameters,
                                  [param.key]: parseFloat(e.target.value) || param.default,
                                }
                                handleUpdateIndicator(indicator.id, { parameters: newParams })
                              }}
                              disabled={isLocked}
                              className={`w-full px-3 py-1.5 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent ${
                                isLocked
                                  ? 'opacity-50 cursor-not-allowed'
                                  : ''
                              }`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. When should this strategy trade? */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">When should this strategy trade?</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">How many events to trade on?</label>
            <CustomDropdown
              value={config.tradeOnEventsCount.toString()}
              onChange={(value) => updateConfig({ tradeOnEventsCount: parseInt(value, 10) })}
              options={[
                { value: '1', label: 'Only this event' },
                { value: '2', label: 'This event and the next one' },
                { value: '3', label: 'This event and the next 2 events' },
                { value: '4', label: 'This event and the next 3 events' },
                { value: '5', label: 'This event and the next 4 events' },
                { value: '6', label: 'This event and the next 5 events' },
                { value: '7', label: 'This event and the next 6 events' },
                { value: '8', label: 'This event and the next 7 events' },
              ]}
              placeholder="Select number of events"
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-500">
              {config.tradeOnEventsCount === 1
                ? 'Trade on only this event'
                : config.tradeOnEventsCount === 2
                ? 'Trade on this event and the next one'
                : `Trade on this event and the next ${config.tradeOnEventsCount - 1} events`}
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

// Polymarket Tab Component
function PolymarketTab({
  config,
  updateConfig,
}: {
  config: StrategyConfig
  updateConfig: (updates: Partial<StrategyConfig>) => void
}) {
  const [newRule, setNewRule] = useState({
    field: '',
    operator: '',
    value: '',
    value2: '',
    action: '',
  })

  const handleAddRule = () => {
    if (newRule.field && newRule.operator && newRule.value) {
      updateConfig({
        orderbookRules: [
          ...config.orderbookRules,
          {
            id: Date.now().toString(),
            ...newRule,
            action: '', // Action removed from UI but kept in structure
          },
        ],
      })
      setNewRule({ field: '', operator: '', value: '', value2: '', action: '' })
    }
  }

  const handleDeleteRule = (id: string) => {
    updateConfig({
      orderbookRules: config.orderbookRules.filter((r) => r.id !== id),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Order Setup</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Market</label>
            <CustomDropdown
              value={config.market || (config.asset && config.timeframe ? `${config.asset} ${config.timeframe}` : '')}
              onChange={() => {}} // Disabled, no-op
              options={[
                { value: config.market || (config.asset && config.timeframe ? `${config.asset} ${config.timeframe}` : ''), label: config.market || (config.asset && config.timeframe ? `${config.asset} ${config.timeframe}` : 'Auto-generated from Basics') },
              ]}
              placeholder="Auto-generated from Basics"
              disabled={true}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Side</label>
            <CustomDropdown
              value={config.side || config.direction || ''}
              onChange={() => {}} // Disabled, no-op
              options={[
                { value: config.side || config.direction || '', label: config.side || config.direction || 'Auto-generated from Basics' },
              ]}
              placeholder="Auto-generated from Basics"
              disabled={true}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-300">Orderbook Rule Builder</h4>
            <div className="bg-dark-bg border border-gray-800 rounded p-4 space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm text-gray-400">IF</span>
            <CustomDropdown
              value={newRule.field}
              onChange={(value) => setNewRule({ ...newRule, field: value })}
              options={[
                { value: 'market price per share', label: 'market price per share' },
              ]}
              placeholder="Field"
              className="w-40"
            />
            <CustomDropdown
              value={newRule.operator}
              onChange={(value) => setNewRule({ ...newRule, operator: value })}
              options={[
                { value: 'more than', label: 'more than' },
                { value: 'less than', label: 'less than' },
                { value: 'equal to', label: 'equal to' },
              ]}
              placeholder="Operator"
              className="w-32"
            />
            <div className="relative w-32">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10">¢:</span>
              <input
                type="text"
                value={newRule.value}
                onChange={(e) => {
                  const inputValue = e.target.value
                  // Only allow digits, no decimals
                  const numericValue = inputValue.replace(/[^0-9]/g, '')
                  // Ensure value is between 1 and 99
                  if (numericValue === '' || (parseInt(numericValue) >= 1 && parseInt(numericValue) <= 99)) {
                    setNewRule({ ...newRule, value: numericValue })
                  }
                }}
                placeholder=""
                maxLength={2}
                className="w-full pl-8 pr-3 py-2 h-[42px] bg-dark-bg border border-gray-800 rounded text-white text-sm leading-normal focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent transition-colors hover:border-gray-700"
              />
            </div>
            <button
              type="button"
              onClick={handleAddRule}
              className="px-3 py-1.5 bg-gold-primary hover:bg-gold-hover text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary"
            >
              + Add Rule
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {config.orderbookRules.map((rule) => (
            <div
              key={rule.id}
                  className="flex items-center justify-between bg-dark-bg border border-gray-800 rounded p-3"
            >
               <span className="text-sm text-gray-300">
                 Place orders IF {rule.field} is {rule.operator} ¢{rule.value}
               </span>
              <button
                type="button"
                onClick={() => handleDeleteRule(rule.id)}
                className="text-red-400 hover:text-red-300 text-sm focus:outline-none"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// Risk & Sizing Tab Component
function RiskTab({
  config,
  updateConfig,
}: {
  config: StrategyConfig
  updateConfig: (updates: Partial<StrategyConfig>) => void
}) {
  const [newLadderOrder, setNewLadderOrder] = useState({ price: '', shares: '' })

  const handleAddLadderOrder = () => {
    if (newLadderOrder.price && newLadderOrder.shares) {
      updateConfig({
        orderLadder: [
          ...config.orderLadder,
          {
            id: Date.now().toString(),
            price: newLadderOrder.price,
            shares: newLadderOrder.shares,
          },
        ],
      })
      setNewLadderOrder({ price: '', shares: '' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Order Ladder - Multiple Limit Orders */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Order Ladder</h3>
        <div className="space-y-3">
          <div className="bg-dark-bg border border-gray-800 rounded p-4 space-y-3">
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-gray-400">Price:</span>
              <div className="relative w-32">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10">¢</span>
                <input
                  type="text"
                  value={newLadderOrder.price}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '')
                    if (numericValue === '' || (parseInt(numericValue) >= 1 && parseInt(numericValue) <= 99)) {
                      setNewLadderOrder({ ...newLadderOrder, price: numericValue })
                    }
                  }}
                  placeholder=""
                  className="w-full pl-8 pr-3 py-2 h-[42px] bg-dark-bg border border-gray-800 rounded text-white text-sm leading-normal focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
                  maxLength={2}
                />
              </div>
              <span className="text-sm text-gray-400">Shares:</span>
              <input
                type="text"
                value={newLadderOrder.shares}
                onChange={(e) => {
                  const numericValue = e.target.value.replace(/[^0-9]/g, '')
                  setNewLadderOrder({ ...newLadderOrder, shares: numericValue })
                }}
                placeholder=""
                className="w-32 px-3 py-2 h-[42px] bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleAddLadderOrder}
                disabled={!newLadderOrder.price || !newLadderOrder.shares}
                className="px-3 py-1.5 bg-gold-primary hover:bg-gold-hover disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary"
              >
                + Add Order
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {config.orderLadder.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between bg-dark-bg border border-gray-800 rounded p-3"
              >
                <span className="text-sm text-gray-300">
                  ¢{order.price} - {order.shares} shares
                </span>
                <button
                  type="button"
                  onClick={() => {
                    updateConfig({
                      orderLadder: config.orderLadder.filter((o) => o.id !== order.id),
                    })
                  }}
                  className="text-red-400 hover:text-red-300 text-sm focus:outline-none"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Risk Controls */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Risk Management</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Daily loss limit (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
              <input
                type="text"
                value={config.maxDailyLoss}
                onChange={(e) => updateConfig({ maxDailyLoss: e.target.value })}
                placeholder=""
                className="w-full pl-8 pr-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Stop trading for the day after losing: $___</p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Daily trade cap (optional)</label>
            <input
              type="text"
              value={config.dailyTradeCap}
              onChange={(e) => updateConfig({ dailyTradeCap: e.target.value })}
              placeholder=""
              className="w-full px-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">Max trades per day: [___]</p>
          </div>
        </div>
      </div>

      {/* 4. Position Limits */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Position Limits</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Max position size</label>
            <p className="text-xs text-gray-500 mb-2">Do not exceed:</p>
            <div className="space-y-3">
              <div>
                <input
                  type="text"
                  value={config.maxPositionShares}
                  onChange={(e) => updateConfig({ maxPositionShares: e.target.value })}
                  placeholder=""
                  className="w-full px-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">shares OR</p>
              </div>
              <div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                  <input
                    type="text"
                    value={config.maxPositionDollar}
                    onChange={(e) => updateConfig({ maxPositionDollar: e.target.value })}
                    placeholder=""
                    className="w-full pl-8 pr-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">total exposure</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Order Behavior */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Order Behavior</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">If a limit order is not filled:</label>
            <CustomDropdown
              value={config.unfilledOrderBehavior}
              onChange={(value) => updateConfig({ unfilledOrderBehavior: value as 'keep_open' | 'cancel_after_seconds' | 'cancel_at_candle' | 'replace_market' })}
              options={[
                { value: 'keep_open', label: 'Keep open until event ends' },
                { value: 'cancel_after_seconds', label: 'Cancel after X seconds' },
                { value: 'cancel_at_candle', label: 'Cancel at next candle' },
                { value: 'replace_market', label: 'Replace with market order' },
              ]}
            />
          </div>

          {config.unfilledOrderBehavior === 'cancel_after_seconds' && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Cancel after:</label>
              <input
                type="text"
                value={config.cancelAfterSeconds}
                onChange={(e) => updateConfig({ cancelAfterSeconds: e.target.value })}
                placeholder=""
                className="w-full px-3 py-2 bg-dark-bg border border-gray-800 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">seconds</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Schedule Tab Component
function ScheduleTab({
  config,
  updateConfig,
}: {
  config: StrategyConfig
  updateConfig: (updates: Partial<StrategyConfig>) => void
}) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const handleDayToggle = (day: string) => {
    const newDays = config.selectedDays.includes(day)
      ? config.selectedDays.filter((d) => d !== day)
      : [...config.selectedDays, day]
    updateConfig({ selectedDays: newDays })
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-3">Days of Week</h4>
        <div className="grid grid-cols-2 gap-2">
          {days.map((day) => (
            <label key={day} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.selectedDays.includes(day)}
                onChange={() => handleDayToggle(day)}
                className="w-4 h-4 text-gold-primary bg-dark-bg border-gray-800 rounded focus:ring-gold-primary"
              />
              <span className="text-sm text-gray-300">{day}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-3">Time Range</h4>
        <div className="flex gap-3 items-center">
          <input
            type="time"
            value={config.timeRange.start}
            onChange={(e) =>
              updateConfig({
                timeRange: { ...config.timeRange, start: e.target.value },
              })
            }
            className="px-4 py-2 bg-dark-bg border border-gray-800 rounded text-white focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
          />
          <span className="text-gray-400">-</span>
          <input
            type="time"
            value={config.timeRange.end}
            onChange={(e) =>
              updateConfig({
                timeRange: { ...config.timeRange, end: e.target.value },
              })
            }
            className="px-4 py-2 bg-dark-bg border border-gray-800 rounded text-white focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
          />
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={config.runOnNewCandle}
            onChange={(e) => updateConfig({ runOnNewCandle: e.target.checked })}
            className="w-4 h-4 text-gold-primary bg-dark-bg border-gray-800 rounded focus:ring-gold-primary"
          />
          <span className="text-sm font-medium text-gray-300">Run on new candle only ({config.timeframe})</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={config.pauseOnSettlement}
            onChange={(e) => updateConfig({ pauseOnSettlement: e.target.checked })}
            className="w-4 h-4 text-gold-primary bg-dark-bg border-gray-800 rounded focus:ring-gold-primary"
          />
          <span className="text-sm font-medium text-gray-300">Pause on event settlement window</span>
        </label>
      </div>
    </div>
  )
}

// Preview Panel Component
function PreviewPanel({ config }: { config: StrategyConfig }) {
  const isValid = config.name.length > 0 && config.asset && config.timeframe

  const getSummary = () => {
    if (!isValid) return 'Please fill in basic strategy information to see preview.'
    
    const conditionsText =
      config.conditions.length > 0
        ? config.conditions
            .map((c, idx) => {
              const sourceA = c.sourceA.includes('indicator_')
                ? config.indicators.find((i) => i.id === c.sourceA.replace('indicator_', ''))?.type || c.sourceA
                : c.sourceA
              return `Condition ${idx + 1}: ${sourceA} ${c.operator} ${c.value || c.sourceB}`
            })
            .join('; ')
        : 'No conditions set'

    const actionsText =
      config.actions.length > 0
        ? config.actions.map((a) => `${a.action} ${a.direction} on ${a.market}`).join('; ')
        : 'No actions configured'

    return `Strategy will trigger when: ${conditionsText}. Actions: ${actionsText}`
  }

  return (
    <div className="bg-dark-bg border border-gray-800 rounded-lg p-6 space-y-6 sticky top-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Preview</h3>
        <div className="bg-dark-bg border border-gray-800 rounded p-4">
          <p className="text-sm text-gray-300 leading-relaxed">{getSummary()}</p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-3">Next Trade Estimate</h4>
        <div className="bg-dark-bg border border-gray-800 rounded p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Market:</span>
            <span className="text-white">{config.market || `${config.asset} ${config.timeframe} ${config.direction}`}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Side:</span>
            <span className="text-white">{config.side || `Buy ${config.direction}`}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Size:</span>
            <span className="text-white">{config.positionSize || 'Not set'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Type:</span>
            <span className="text-white">{config.orderType || 'Not set'}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              isValid ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm font-medium text-white">
            {isValid ? 'VALID CONFIG' : 'INVALID CONFIG'}
          </span>
        </div>
        {!isValid && (
          <p className="mt-2 text-xs text-gray-400">
            Strategy name, asset, and timeframe are required.
          </p>
        )}
      </div>
    </div>
  )
}

// Loading fallback for Suspense boundary
function StrategyEditorLoading() {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-gold-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-400">Loading strategy editor...</p>
      </div>
    </div>
  )
}

// Default export wraps content in Suspense for useSearchParams
export default function StrategyEditorPage() {
  return (
    <Suspense fallback={<StrategyEditorLoading />}>
      <StrategyEditorContent />
    </Suspense>
  )
}
