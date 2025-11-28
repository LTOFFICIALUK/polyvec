'use client'

import { useState, useRef, useEffect, useMemo, KeyboardEvent, MouseEvent } from 'react'
import StrategyAnalytics from './StrategyAnalytics'
import usePolymarketPrices from '@/hooks/usePolymarketPrices'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'


const TradingPanel = () => {
  const { selectedPair, selectedTimeframe } = useTradingContext()
  const [orderType, setOrderType] = useState<'market' | 'strategy' | 'analytics'>('market')
  const [executionType, setExecutionType] = useState<'market' | 'limit'>('market')
  const [amount, setAmount] = useState('')
  const [isBuy, setIsBuy] = useState(true)
  const [buyType, setBuyType] = useState<'up' | 'down'>('up')
  const [sellType, setSellType] = useState<'down' | 'up'>('up') // Synchronized with buyType: up -> up
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [enabledStrategies, setEnabledStrategies] = useState<Record<string, boolean>>({
    'Momentum Breakout': false,
    'RSI Reversal': false,
    'MACD Crossover': false,
    'Bollinger Squeeze': false,
  })
  const [limitPrice, setLimitPrice] = useState('')
  const [quickTradeOptions, setQuickTradeOptions] = useState([
    { quantity: 5, price: 0 },
    { quantity: 10, price: 0 },
    { quantity: 25, price: 0 },
  ])
  const [showQuickTradePanel, setShowQuickTradePanel] = useState(false)
  const [quickTradeQuantity, setQuickTradeQuantity] = useState('100')
  const [quickTradePrice, setQuickTradePrice] = useState('38')
  const [isEditingQuickTrade, setIsEditingQuickTrade] = useState(false)
  const [quickTradeAmountPresets, setQuickTradeAmountPresets] = useState<string[]>([
    '25',
    '30',
    '50',
    '75',
    '100',
  ])
  const [quickTradePricePresets, setQuickTradePricePresets] = useState<string[]>([
    '50',
    '40',
    '30',
    '20',
    '10',
  ])
  const [shareQuickAddPresets, setShareQuickAddPresets] = useState<string[]>(['5', '10', '25', '100'])
  const [isEditingSharePresets, setIsEditingSharePresets] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ x: 100, y: 100 })
  const saveSharePresetEdits = () => {
    setShareQuickAddPresets((prev) => prev.map((value) => (value.trim().length ? value : '0')))
    setIsEditingSharePresets(false)
  }

  const handleSharePresetInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveSharePresetEdits()
    }
  }
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const popupRef = useRef<HTMLDivElement>(null)

  // Update limit price when switching to limit mode
  const handleExecutionTypeChange = (newType: 'market' | 'limit') => {
    setExecutionType(newType)
    if (newType === 'limit') {
      // Set initial limit price to current market price
      const currentPrice = isBuy ? yesPriceFormatted : noPriceFormatted
      if (currentPrice !== 'ERROR' && !limitPrice) {
        setLimitPrice(currentPrice)
      } else if (currentPrice !== 'ERROR' && parseFloat(limitPrice) === 0) {
        setLimitPrice(currentPrice)
      }
    }
  }

  const handleAmountClick = (value: string) => {
    setAmount(value)
  }

  // Drag handlers for Quick Limit popup
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!popupRef.current) return
    const rect = popupRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
    setIsDragging(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !popupRef.current) return
      
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y
      
      // Constrain to viewport
      const popupWidth = popupRef.current.offsetWidth
      const popupHeight = popupRef.current.offsetHeight
      const maxX = window.innerWidth - popupWidth
      const maxY = window.innerHeight - popupHeight
      
      setPopupPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleBuy = () => {
    if (isBuy) {
      // Toggle between up and down when Buy is already active
      const newBuyType = buyType === 'up' ? 'down' : 'up'
      setBuyType(newBuyType)
      // Synchronize sell type: up -> up, down -> down
      setSellType(newBuyType === 'up' ? 'up' : 'down')
    } else {
      // Switch to Buy mode
      setIsBuy(true)
    }
  }

  const handleSell = () => {
    if (!isBuy) {
      // Toggle between down and up when Sell is already active
      const newSellType = sellType === 'down' ? 'up' : 'down'
      setSellType(newSellType)
      // Synchronize buy type: up -> up, down -> down
      setBuyType(newSellType === 'up' ? 'up' : 'down')
    } else {
      // Switch to Sell mode
      setIsBuy(false)
    }
  }

  const {
    market: currentMarket,
    loading: currentMarketLoading,
    error: currentMarketError,
  } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
  })

  // Get real-time Polymarket prices with minimal delay
  const { prices, loading, error } = usePolymarketPrices({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    interval: 5000, // Update every 5 seconds to reduce load
    useWebSocket: false, // Set to true once WebSocket is properly configured
  })

  // Format prices or show ERROR
  const yesPriceFormatted = error || !prices ? 'ERROR' : (prices.yesPrice * 100).toFixed(1)
  const noPriceFormatted = error || !prices ? 'ERROR' : (prices.noPrice * 100).toFixed(1)

  // Determine if we're trading UP (green) or DOWN (red)
  const isTradingUp = isBuy ? (buyType === 'up') : (sellType === 'up')
  const isTradingDown = !isTradingUp

  const formattedMarketStart =
    currentMarket.startTime != null
      ? new Date(currentMarket.startTime).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null
  const formattedMarketEnd =
    currentMarket.endTime != null
      ? new Date(currentMarket.endTime).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null

  const handlePolymarketLinkClick = (event?: MouseEvent<HTMLAnchorElement>) => {
    event?.preventDefault()
    if (!currentMarket.polymarketUrl || typeof window === 'undefined') return
    window.open(currentMarket.polymarketUrl, '_blank', 'noopener,noreferrer')
  }

  const handlePolymarketLinkKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handlePolymarketLinkClick()
  }

  const selectableAmountPresets = useMemo(
    () =>
      quickTradeAmountPresets
        .map((value, index) => ({ value: value.trim(), index }))
        .filter(({ value }) => value.length > 0),
    [quickTradeAmountPresets],
  )

  const selectablePricePresets = useMemo(
    () =>
      quickTradePricePresets
        .map((value, index) => ({ value: value.trim(), index }))
        .filter(({ value }) => value.length > 0),
    [quickTradePricePresets],
  )

  useEffect(() => {
    if (!selectablePricePresets.length) return

    const selectedPrice = parseFloat(quickTradePrice)
    const normalizedSelected = Number.isNaN(selectedPrice) ? null : selectedPrice.toString()
    const hasSelection = normalizedSelected !== null && quickTradePricePresets.includes(normalizedSelected)

    if (!quickTradePrice || !hasSelection) {
      const defaultPrice = quickTradePricePresets[0]
      setQuickTradePrice(defaultPrice)
      if (executionType === 'limit') {
        setLimitPrice(defaultPrice)
      }
    }
  }, [selectablePricePresets, quickTradePrice, executionType, quickTradePricePresets])

  // Mock strategies list - would come from API
  const strategies = ['Momentum Breakout', 'RSI Reversal', 'MACD Crossover', 'Bollinger Squeeze']

  // Store orderType to avoid TypeScript narrowing issues
  const currentOrderType = orderType

  // Render tab buttons (reusable component)
  const renderTabButtons = () => (
    <div className="flex gap-2 items-center">
      <button
        onClick={() => setOrderType('market')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 flex items-center justify-center gap-2 ${
          currentOrderType === 'market'
            ? 'bg-purple-primary text-white shadow-lg shadow-purple-500/20'
            : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        <span>{executionType === 'limit' ? 'Limit' : 'Market'}</span>
        {currentOrderType === 'market' && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              handleExecutionTypeChange(executionType === 'market' ? 'limit' : 'market')
            }}
            className="p-1 rounded transition-all duration-200 hover:bg-white/10 focus:outline-none cursor-pointer"
            role="button"
            aria-label={`Switch to ${executionType === 'market' ? 'limit' : 'market'} order`}
            title={`Switch to ${executionType === 'market' ? 'limit' : 'market'} order`}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                executionType === 'limit' ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </span>
        )}
      </button>
      <button
        onClick={() => setOrderType('strategy')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 ${
          currentOrderType === 'strategy'
            ? 'bg-purple-primary text-white shadow-lg shadow-purple-500/20'
            : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        Strategies
      </button>
      <button
        onClick={() => setOrderType('analytics')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 ${
          currentOrderType === 'analytics'
            ? 'bg-purple-primary text-white shadow-lg shadow-purple-500/20'
            : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        Analytics
      </button>
    </div>
  )

  // Show analytics panel if Analytics tab is selected
  if (currentOrderType === 'analytics') {
    return (
      <div className="h-full flex flex-col bg-black max-h-[50vh] lg:max-h-none overflow-y-auto">
        {/* Order Type Selector */}
        <div className="border-b border-gray-800 p-3 sm:p-4 bg-gray-900/30 flex-shrink-0">
          {renderTabButtons()}
        </div>

        {/* Strategy Analytics Panel */}
        <div className="flex-1 overflow-y-auto">
          <StrategyAnalytics selectedStrategy={selectedStrategy} />
        </div>
      </div>
    )
  }

  // Show strategy selector if Strategy tab is selected
  if (currentOrderType === 'strategy') {
    return (
      <div className="h-full flex flex-col bg-black max-h-[50vh] lg:max-h-none overflow-y-auto">
        {/* Order Type Selector */}
        <div className="border-b border-gray-800 p-3 sm:p-4 bg-gray-900/30 flex-shrink-0">
          {renderTabButtons()}
        </div>

        {/* Strategy Selector */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <h3 className="text-white font-semibold text-sm mb-2">Manage Strategies</h3>
            <p className="text-gray-400 text-xs">Toggle strategies on/off or click to view analytics</p>
          </div>

          <div className="space-y-2">
            {strategies.map((strategy) => {
              const isEnabled = enabledStrategies[strategy] || false
              return (
                <div
                  key={strategy}
                  className={`w-full p-3 rounded-lg transition-all duration-200 border ${
                    selectedStrategy === strategy
                      ? 'bg-purple-primary/20 border-purple-primary'
                      : 'bg-gray-900/50 border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => {
                        setSelectedStrategy(strategy)
                        setOrderType('analytics')
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="font-medium text-sm text-white">{strategy}</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEnabledStrategies((prev) => ({
                          ...prev,
                          [strategy]: !prev[strategy],
                        }))
                      }}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-primary focus:ring-offset-2 focus:ring-offset-black ${
                        isEnabled ? 'bg-purple-primary' : 'bg-gray-700'
                      }`}
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`Toggle ${strategy} strategy`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Default Market view
  return (
    <div className="h-full flex flex-col bg-black max-h-[50vh] lg:max-h-none overflow-y-auto">
      {/* Order Type Selector */}
      <div className="border-b border-gray-800 p-3 sm:p-4 bg-gray-900/30 flex-shrink-0">
        {renderTabButtons()}
      </div>

      {/* Buy/Sell Tabs */}
      <div className="border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center">
          <div className="flex flex-1">
            <button
              onClick={handleBuy}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative ${
                isBuy
                  ? (isTradingUp ? 'text-green-400' : 'text-red-400')
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Buy
              {isBuy && (
                <div className={`absolute bottom-0 left-0 right-0 h-px ${
                  isTradingUp ? 'bg-green-500' : 'bg-red-500'
                }`} />
              )}
            </button>
            <button
              onClick={handleSell}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative ${
                !isBuy
                  ? (isTradingUp ? 'text-green-400' : 'text-red-400')
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Sell
              {!isBuy && (
                <div className={`absolute bottom-0 left-0 right-0 h-px ${
                  isTradingUp ? 'bg-green-500' : 'bg-red-500'
                }`} />
              )}
            </button>
          </div>
          {/* Time Icon Button for Quick Limit */}
          <button
            onClick={() => setShowQuickTradePanel(!showQuickTradePanel)}
            className="px-3 py-3 text-gray-400 hover:text-white transition-colors"
            aria-label="Quick Limit"
            title="Quick Limit"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
      </div>


      {/* Limit Order Section - only shown when executionType is 'limit' */}
      {executionType === 'limit' && (
        <div className="border-b border-gray-800 p-4 flex-shrink-0 space-y-4">
          {/* Price Target Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                handleBuy()
                if (isBuy && buyType === 'up') {
                  const upPrice = parseFloat(yesPriceFormatted) || 0
                  setLimitPrice(upPrice.toFixed(1))
                } else if (isBuy && buyType === 'down') {
                  const downPrice = 100 - (parseFloat(yesPriceFormatted) || 0)
                  setLimitPrice(downPrice.toFixed(1))
                } else {
                  const upPrice = parseFloat(yesPriceFormatted) || 0
                  setLimitPrice(upPrice.toFixed(1))
                }
              }}
              className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                isBuy
                  ? (isTradingUp ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-red-500/10 border-red-500 text-red-400')
                  : (isTradingUp ? 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60')
              }`}
            >
              <span>Buy {buyType === 'up' ? 'Up' : 'Down'}</span>
              <span className={`text-xs font-semibold ${isBuy ? (isTradingUp ? 'text-green-400' : 'text-red-400') : (isTradingUp ? 'text-green-400' : 'text-red-400')}`}>
                {yesPriceFormatted}¢
              </span>
            </button>
            <button
              onClick={() => {
                handleSell()
                if (!isBuy && sellType === 'down') {
                  const noPrice = parseFloat(noPriceFormatted) || 0
                  setLimitPrice(noPrice.toFixed(1))
                } else if (!isBuy && sellType === 'up') {
                  const upPrice = parseFloat(yesPriceFormatted) || 0
                  setLimitPrice(upPrice.toFixed(1))
                } else {
                  const noPrice = parseFloat(noPriceFormatted) || 0
                  setLimitPrice(noPrice.toFixed(1))
                }
              }}
              className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                !isBuy
                  ? (isTradingUp ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-red-500/10 border-red-500 text-red-400')
                  : (isTradingUp ? 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60')
              }`}
            >
              <span>Sell {sellType === 'down' ? 'Down' : 'Up'}</span>
              <span className={`text-xs font-semibold ${!isBuy ? (isTradingUp ? 'text-green-400' : 'text-red-400') : (isTradingUp ? 'text-green-400' : 'text-red-400')}`}>
                {sellType === 'up' ? yesPriceFormatted : noPriceFormatted}¢
              </span>
            </button>
          </div>

          {/* Limit Price Input with +/- buttons */}
          <div>
            <label className="block text-sm text-white mb-2">Limit Price</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const current = parseFloat(limitPrice) || 0
                  const newPrice = Math.max(0, current - 0.1)
                  setLimitPrice(newPrice.toFixed(1))
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Decrease price"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={limitPrice}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '')
                    setLimitPrice(value)
                  }}
                  className="w-full bg-gray-900/50 border border-gray-800 rounded px-3 py-2 pr-8 text-white text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-purple-primary"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">¢</span>
              </div>
              <button
                onClick={() => {
                  const current = parseFloat(limitPrice) || 0
                  const newPrice = Math.min(100, current + 0.1)
                  setLimitPrice(newPrice.toFixed(1))
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Increase price"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy/Sell Toggle - only shown when executionType is 'market' */}
      {executionType === 'market' && (
        <div className="border-b border-gray-800 p-4 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={handleBuy}
                className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                  isBuy
                    ? (isTradingUp ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-red-500/10 border-red-500 text-red-400')
                    : (isTradingUp ? 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60')
                }`}
            >
              <span>Buy {buyType === 'up' ? 'Up' : 'Down'}</span>
                <span className={`text-xs font-semibold ${isBuy ? (isTradingUp ? 'text-green-400' : 'text-red-400') : (isTradingUp ? 'text-green-400' : 'text-red-400')}`}>
                {yesPriceFormatted}¢
              </span>
            </button>
            <button
              onClick={handleSell}
              className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                !isBuy
                  ? (isTradingUp ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-red-500/10 border-red-500 text-red-400')
                  : (isTradingUp ? 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60')
              }`}
            >
              <span>Sell {sellType === 'down' ? 'Down' : 'Up'}</span>
              <span className={`text-xs font-semibold ${!isBuy ? (isTradingUp ? 'text-green-400' : 'text-red-400') : (isTradingUp ? 'text-green-400' : 'text-red-400')}`}>
                {sellType === 'up' ? yesPriceFormatted : noPriceFormatted}¢
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Shares/Amount Input */}
      <div className="border-b border-gray-800 p-4 flex-shrink-0">
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-white">Shares</label>
              <button
                onClick={() => setAmount('0')}
                className="text-gray-400 hover:text-white transition-colors text-xs"
                aria-label="Reset shares"
                title="Reset"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const current = parseFloat(amount) || 0
                  const newAmount = Math.max(0, current - 1)
                  setAmount(newAmount.toString())
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Decrease shares"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-800 rounded px-3 py-2 text-white text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-purple-primary"
                  placeholder="0"
                />
              </div>
              <button
                onClick={() => {
                  const current = parseFloat(amount) || 0
                  const newAmount = current + 1
                  setAmount(newAmount.toString())
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Increase shares"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            {executionType === 'limit' ? (
              <div className="flex gap-2 mt-3">
                  {shareQuickAddPresets.map((value, index) => {
                    if (isEditingSharePresets) {
                      return (
                        <div
                          key={index}
                          className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-800 bg-gray-900/50 flex items-center justify-center"
                        >
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => {
                              const sanitized = e.target.value.replace(/[^0-9.]/g, '')
                              setShareQuickAddPresets((prev) => {
                                const next = [...prev]
                                next[index] = sanitized
                                return next
                              })
                            }}
                            onKeyDown={handleSharePresetInputKeyDown}
                            className="w-full bg-transparent text-center text-white focus:outline-none focus:ring-0"
                            placeholder="0"
                          />
                        </div>
                      )
                    }

                    const increment = parseFloat(value) || 0
                    return (
                      <button
                        key={index}
                        onClick={() => {
                          const current = parseFloat(amount) || 0
                          const newAmount = current + increment
                          setAmount(newAmount.toString())
                        }}
                        className="flex-1 px-2 py-1.5 text-xs bg-gray-900/50 text-gray-300 rounded border border-gray-800 hover:bg-gray-900/70 hover:border-gray-700 transition-colors"
                      >
                        +{value || 0}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => {
                      if (isEditingSharePresets) {
                        saveSharePresetEdits()
                      } else {
                        setIsEditingSharePresets(true)
                      }
                    }}
                    className={`px-2 py-1.5 rounded border border-gray-800 transition-colors ${
                      isEditingSharePresets
                        ? 'text-white bg-purple-primary hover:bg-purple-hover'
                        : 'text-gray-400 hover:text-white bg-gray-900/50 hover:bg-gray-900/70 hover:border-gray-700'
                    }`}
                    aria-label={isEditingSharePresets ? 'Save quick add options' : 'Edit quick add options'}
                    title={isEditingSharePresets ? 'Save' : 'Edit quick add options'}
                  >
                    {isEditingSharePresets ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
            ) : (
              <div className="flex gap-2 mt-3">
                {['0.001', '0.1', '0.15', '10'].map((value) => (
                  <button
                    key={value}
                    onClick={() => handleAmountClick(value)}
                    className="flex-1 px-2 py-1.5 text-xs bg-gray-900/50 text-gray-300 rounded border border-gray-800 hover:bg-gray-900/70 hover:border-gray-700 transition-colors"
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Action Button */}
      <div className="p-4 flex-shrink-0 space-y-3">
        <button
          className={`w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 border ${
            isTradingUp
              ? 'bg-green-500/10 border-green-500 text-green-400 hover:bg-green-500/20'
              : 'bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20'
          }`}
        >
          {executionType === 'limit'
            ? `${isBuy ? 'BUY' : 'SELL'} ${isBuy ? (buyType === 'up' ? 'UP' : 'DOWN') : (sellType === 'down' ? 'DOWN' : 'UP')} @ LIMIT`
            : `${isBuy ? 'BUY' : 'SELL'} ${isBuy ? (buyType === 'up' ? 'UP' : 'DOWN') : (sellType === 'down' ? 'DOWN' : 'UP')}`}
        </button>

        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 text-xs text-gray-400 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-gray-200">
              {currentMarket.marketId ? `Market ID: ${currentMarket.marketId}` : 'Market metadata unavailable'}
            </span>
            {currentMarket.polymarketUrl && (
              <a
                href={currentMarket.polymarketUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                tabIndex={0}
                aria-label="Open current market on Polymarket"
                onClick={handlePolymarketLinkClick}
                onKeyDown={handlePolymarketLinkKeyDown}
              >
                View on Polymarket
              </a>
            )}
          </div>
          {currentMarket.question ? (
            <p className="text-gray-400">{currentMarket.question}</p>
          ) : (
            <p className="text-gray-500">
              {currentMarketLoading
                ? 'Loading current market details...'
                : currentMarketError || 'Waiting for websocket service to return the active market.'}
            </p>
          )}
          {(formattedMarketStart || formattedMarketEnd) && (
            <p className="text-gray-400">
              Window: {formattedMarketStart || '—'}
              {formattedMarketEnd ? ` → ${formattedMarketEnd}` : ''}{' '}
              <span className="text-gray-500">(ET)</span>
            </p>
          )}
        </div>
      </div>

      {/* Account Summary */}
      <div className="border-t border-gray-800 p-4 mt-auto flex-shrink-0">
        <div className="bg-gray-900/50 rounded p-3 border border-gray-800 space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Bought</span>
            <span className="text-sm text-white font-bold">$0</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Sold</span>
            <span className="text-sm text-white font-bold">$79.15</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">Holding</span>
            <span className="text-sm text-white font-bold">$44.6</span>
          </div>
          <div className="h-px bg-gray-800 my-2" />
          <div className="flex justify-between items-center pt-1">
            <span className="text-xs text-gray-400">PnL</span>
            <span className="text-sm text-green-400 font-bold">+$123.8 (+0%)</span>
          </div>
        </div>
      </div>

      {/* Quick Limit Popup - Draggable */}
      {showQuickTradePanel && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-black border border-gray-800 rounded-lg shadow-2xl w-[280px]"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            cursor: isDragging ? 'grabbing' : 'default',
          }}
        >
            {/* Draggable Header */}
            <div
              onMouseDown={handleMouseDown}
              className="flex items-center justify-between px-3 py-2 border-b border-gray-800 cursor-grab active:cursor-grabbing bg-black rounded-t-lg"
            >
              <span className="text-xs text-white font-semibold">Quick Limit</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsEditingQuickTrade(!isEditingQuickTrade)}
                  className="text-gray-400 hover:text-white transition-colors p-0.5"
                  aria-label="Edit Quick Limit"
                  title="Edit Quick Limit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setShowQuickTradePanel(false)}
                  className="text-gray-400 hover:text-white transition-colors p-0.5"
                  aria-label="Close"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-2.5">
              {isEditingQuickTrade ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">
                        Limit Price
                      </div>
                      <div className="space-y-1">
                        {quickTradePricePresets.map((preset, index) => {
                          return (
                            <input
                              key={index}
                              type="text"
                              value={preset}
                              onChange={(e) => {
                                const sanitized = e.target.value.replace(/[^0-9.]/g, '')
                                setQuickTradePricePresets((prev) => {
                                  const next = [...prev]
                                  next[index] = sanitized
                                  return next
                                })
                              }}
                              className={`w-full px-2 py-1 rounded text-[10px] font-semibold bg-gray-900/50 border text-white text-center focus:outline-none focus:ring-1 ${
                                isTradingUp
                                  ? 'border-green-500/50 focus:ring-green-500 focus:border-green-500'
                                  : 'border-red-500/50 focus:ring-red-500 focus:border-red-500'
                              }`}
                              placeholder="50"
                            />
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">Shares</div>
                      <div className="space-y-1">
                        {quickTradeAmountPresets.map((preset, index) => (
                          <input
                            key={index}
                            type="text"
                            value={preset}
                            onChange={(e) => {
                              const sanitized = e.target.value.replace(/[^0-9.]/g, '')
                              setQuickTradeAmountPresets((prev) => {
                                const next = [...prev]
                                next[index] = sanitized
                                return next
                              })
                            }}
                            className="w-full px-2 py-1 rounded text-[10px] font-semibold bg-gray-900/50 border border-purple-primary/50 text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-primary focus:border-purple-primary"
                            placeholder="100"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-800">
                    <p className="text-[9px] text-gray-500">
                      Edit prices & amounts
                    </p>
                    <button
                      onClick={() => setIsEditingQuickTrade(false)}
                      className="px-2.5 py-0.5 bg-purple-primary hover:bg-purple-hover text-white text-[9px] font-semibold rounded transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">
                        Limit Price
                      </div>
                      <div className="space-y-1">
                        {selectablePricePresets.map(({ value, index }) => {
                          const isSelected = quickTradePrice === value
                          return (
                            <button
                              key={`${value}-${index}`}
                              onClick={() => {
                                setQuickTradePrice(value)
                                if (executionType === 'limit') {
                                  setLimitPrice(value)
                                }
                              }}
                              className={`w-full px-2 py-1 rounded text-[10px] font-semibold transition-all duration-200 border ${
                                isSelected
                                  ? isTradingUp
                                    ? 'bg-green-500/10 border-green-500 text-green-400'
                                    : 'bg-red-500/10 border-red-500 text-red-400'
                                  : isTradingUp
                                    ? 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                                    : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60'
                              }`}
                            >
                              {value}¢
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">Shares</div>
                      <div className="space-y-1">
                        {selectableAmountPresets.map(({ value, index }) => {
                          const isSelected = quickTradeQuantity === value
                          return (
                            <button
                              key={`${value}-${index}`}
                              onClick={() => {
                                setQuickTradeQuantity(value)
                                setAmount(value)
                              }}
                              className={`w-full px-2 py-1 rounded text-[10px] font-semibold transition-all duration-200 border ${
                                isSelected
                                  ? 'bg-purple-primary/20 border-purple-primary text-white'
                                  : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-purple-primary/60'
                              }`}
                            >
                              {value}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-gray-500">
                        ¢: <span className="text-white font-semibold text-[10px]">{quickTradePrice ? `${quickTradePrice}` : '--'}</span>
                      </span>
                      <span className="text-[9px] text-gray-500">
                        Q: <span className="text-white font-semibold text-[10px]">{quickTradeQuantity || '--'}</span>
                      </span>
                      <span className="text-[9px] text-gray-500">
                        Cost: <span className="text-white font-semibold text-[10px]">
                          {quickTradePrice && quickTradeQuantity 
                            ? `$${((parseFloat(quickTradePrice) * parseFloat(quickTradeQuantity)) / 100).toFixed(2)}`
                            : '--'
                          }
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setAmount(quickTradeQuantity)
                        if (executionType === 'limit' && quickTradePrice) {
                          setLimitPrice(quickTradePrice)
                        }
                      }}
                      className={`px-2.5 py-0.5 text-white text-[9px] font-semibold rounded transition-colors ${
                        isTradingUp
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {isBuy 
                        ? `Buy ${buyType === 'up' ? 'Up' : 'Down'}`
                        : `Sell ${sellType === 'down' ? 'Down' : 'Up'}`
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  )
}

export default TradingPanel

