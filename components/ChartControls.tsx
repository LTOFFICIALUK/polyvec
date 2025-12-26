'use client'

import { useState, useRef, useEffect } from 'react'
import { useTradingContext } from '@/contexts/TradingContext'
import { useToast } from '@/contexts/ToastContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'

const ChartControls = () => {
  const { selectedTimeframe, selectedPair, showTradingView, marketOffset, setSelectedTimeframe, setSelectedPair, setShowTradingView, setMarketOffset } =
    useTradingContext()
  const { showToast } = useToast()
  const [showMarketDropdown, setShowMarketDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [countdown, setCountdown] = useState({ minutes: 0, seconds: 0 })
  
  // Get current market data to access actual start/end times
  const { market: currentMarket } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    offset: marketOffset,
  })
  
  // Check if current market is a future market
  const isFutureMarket = marketOffset > 0

  const timeframes = ['15m', '1h']
  const pairs = ['BTC', 'SOL', 'ETH', 'XRP']

  // Market offsets: -3 to +3 (past 3, current, future 3)
  const marketOffsets = [-3, -2, -1, 0, 1, 2, 3]

  // Format market window time range using actual market times in ET
  const getMarketWindowLabel = (offset: number, includeDate: boolean = false): string => {
    // Get market data for the specified offset
    // For now, we'll use the current market data and calculate relative to it
    // In a more complete implementation, we'd fetch market data for each offset
    // But for the main display (offset === marketOffset), we use the actual market times
    
    if (offset === marketOffset && currentMarket.startTime && currentMarket.endTime) {
      // Use actual market times and format in ET timezone
      const startDate = new Date(currentMarket.startTime)
      const endDate = new Date(currentMarket.endTime)
      
      // Format start time in ET
      const startFormatted = startDate.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: includeDate ? 'short' : undefined,
        day: includeDate ? 'numeric' : undefined,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      
      // Format end time in ET
      const endFormatted = endDate.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      
      if (includeDate) {
        // Extract date part from start (e.g., "Dec 2")
        const datePart = startDate.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
        })
        
        // Extract time parts (e.g., "10:00 AM" and "11:00 AM")
        const startTimePart = startDate.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        
        const endTimePart = endDate.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        
        return `${datePart}, ${startTimePart}-${endTimePart} ET`
      } else {
        // Just time range without date
        return `${startFormatted}-${endFormatted}`
      }
    }
    
    // Fallback: calculate from ET time (for dropdown options when market data not available)
    const now = new Date()
    const timeframeMinutes = selectedTimeframe === '15m' ? 15 : 60
    
    // Get current time in ET timezone
    const nowETString = now.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const [etHours, etMinutes] = nowETString.split(':').map(Number)
    
    // Calculate the start of the current market window in ET
    const currentMinutes = etHours * 60 + etMinutes
    const windowStartMinutes = Math.floor(currentMinutes / timeframeMinutes) * timeframeMinutes
    
    // Apply offset to get target window start
    const targetStartMinutes = windowStartMinutes + (offset * timeframeMinutes)
    const targetEndMinutes = targetStartMinutes + timeframeMinutes
    
    // Calculate days offset for date
    const daysOffset = Math.floor(targetStartMinutes / (24 * 60))
    const adjustedStartMinutes = ((targetStartMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
    const adjustedEndMinutes = ((targetEndMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
    
    const startHours = Math.floor(adjustedStartMinutes / 60)
    const startMins = adjustedStartMinutes % 60
    const endHours = Math.floor(adjustedEndMinutes / 60)
    const endMins = adjustedEndMinutes % 60
    
    // Format start time
    const startPeriod = startHours >= 12 ? 'PM' : 'AM'
    const startDisplayHours = startHours % 12 || 12
    const startTime = startMins === 0 
      ? `${startDisplayHours}` 
      : `${startDisplayHours}:${startMins.toString().padStart(2, '0')}`
    
    // Format end time
    const endPeriod = endHours >= 12 ? 'PM' : 'AM'
    const endDisplayHours = endHours % 12 || 12
    const endTime = endMins === 0 
      ? `${endDisplayHours}${endPeriod}` 
      : `${endDisplayHours}:${endMins.toString().padStart(2, '0')}${endPeriod}`
    
    // Build time range string
    const timeRange = startPeriod === endPeriod 
      ? `${startTime}-${endTime}` 
      : `${startTime}${startPeriod}-${endTime}`
    
    if (includeDate) {
      // Get current date in ET timezone
      const etDateString = now.toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      const [month, day] = etDateString.split(' ')
      const targetDate = new Date(etDateString)
      targetDate.setDate(targetDate.getDate() + daysOffset)
      
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December']
      const monthIndex = monthNames.indexOf(month)
      const fullMonth = monthIndex >= 0 ? fullMonthNames[monthIndex] : month
      const targetDay = targetDate.getDate()
      
      return `${fullMonth} ${targetDay}, ${timeRange} ET`
    }
    
    return timeRange
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMarketDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Countdown timer to market close
  useEffect(() => {
    const calculateCountdown = () => {
      // Use actual market end time if available
      if (currentMarket.endTime && marketOffset === 0) {
        const now = Date.now()
        const endTime = currentMarket.endTime
        
        let remainingSeconds = Math.floor((endTime - now) / 1000)
        
        // Handle case where market has already ended
        if (remainingSeconds < 0) {
          remainingSeconds = 0
        }
        
        const mins = Math.floor(remainingSeconds / 60)
        const secs = remainingSeconds % 60
        
        setCountdown({ minutes: mins, seconds: secs })
      } else {
        // Fallback: calculate from local time
        const now = new Date()
        const timeframeMinutes = selectedTimeframe === '15m' ? 15 : 60
        
        // Calculate the start of the current market window
        const currentMinutes = now.getHours() * 60 + now.getMinutes()
        const windowStartMinutes = Math.floor(currentMinutes / timeframeMinutes) * timeframeMinutes
        
        // Apply offset to get target window end
        const targetEndMinutes = windowStartMinutes + ((marketOffset + 1) * timeframeMinutes)
        
        // Calculate seconds until window closes
        const currentSeconds = now.getSeconds()
        const totalSecondsNow = currentMinutes * 60 + currentSeconds
        const targetEndSeconds = targetEndMinutes * 60
        
        let remainingSeconds = targetEndSeconds - totalSecondsNow
        
        // Handle day boundary
        if (remainingSeconds < 0) {
          remainingSeconds += 24 * 60 * 60
        }
        
        const mins = Math.floor(remainingSeconds / 60)
        const secs = remainingSeconds % 60
        
        setCountdown({ minutes: mins, seconds: secs })
      }
    }

    calculateCountdown()
    const interval = setInterval(calculateCountdown, 1000)
    
    return () => clearInterval(interval)
  }, [selectedTimeframe, marketOffset, currentMarket.endTime])

  const handleTimeframeClick = (tf: string) => {
    if (selectedTimeframe === tf) {
      // Toggle dropdown if clicking the already selected timeframe
      setShowMarketDropdown(!showMarketDropdown)
    } else {
      // Switch timeframe and close dropdown
      setSelectedTimeframe(tf)
      setShowMarketDropdown(false)
    }
  }

  const handleMarketSelect = (offset: number) => {
    setMarketOffset(offset)
    setShowMarketDropdown(false)
    
    // Auto-switch to TradingView for future markets (no Poly Orderbook data yet)
    if (offset > 0 && !showTradingView) {
      setShowTradingView(true)
    }
  }

  // Handle TradingView toggle - block switching away for future markets
  const handleTradingViewToggle = () => {
    if (isFutureMarket && showTradingView) {
      // Trying to switch away from TradingView on a future market - block it
      showToast('Market not started — Poly Orderbook not available yet', 'warning')
      return
    }
    setShowTradingView(!showTradingView)
  }

  return (
    <div className="bg-dark-bg border-b border-gray-700/50 px-2 sm:px-4 py-2 sm:py-3">
      <div className="flex items-center justify-between">
        {/* Pair Selector and Timeframes */}
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {pairs.map((pair) => (
              <button
                key={pair}
                onClick={() => setSelectedPair(pair)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded transition-colors ${
                  selectedPair === pair
                    ? 'bg-gold-primary text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {pair}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-gray-800 hidden sm:block" />

          <div className="flex items-center gap-1 sm:gap-2 flex-wrap relative" ref={dropdownRef}>
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => handleTimeframeClick(tf)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded transition-colors flex items-center gap-1 ${
                  selectedTimeframe === tf
                    ? 'bg-gold-primary text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {tf}
                {selectedTimeframe === tf && (
                  <svg
                    className={`w-3 h-3 transition-transform ${showMarketDropdown ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            ))}

            {/* Market Window Dropdown */}
            {showMarketDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-dark-bg border border-gray-700/50 rounded-lg shadow-xl z-50 min-w-[180px] py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase text-gray-500 font-semibold tracking-wider border-b border-gray-700/50">
                  Select Market Window
                </div>
                {marketOffsets.map((offset) => {
                  const isCurrent = offset === 0
                  const isPast = offset < 0
                  const isSelected = marketOffset === offset
                  
                  return (
                    <button
                      key={offset}
                      onClick={() => handleMarketSelect(offset)}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-dark-bg/60 transition-colors ${
                        isSelected ? 'bg-gold-primary/20 text-gold-hover' : 'text-gray-300'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isPast && <span className="text-gray-500 text-xs">Ended</span>}
                        {isCurrent && <span className="text-green-500 text-xs">Live</span>}
                        {!isPast && !isCurrent && <span className="text-blue-500 text-xs">Future</span>}
                        <span className={isCurrent ? 'font-semibold' : ''}>
                          {getMarketWindowLabel(offset)}
                        </span>
                      </span>
                      {isSelected && (
                        <svg className="w-4 h-4 text-gold-hover" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="h-6 w-px bg-gray-800 hidden sm:block" />

          {/* Current Market Window Indicator */}
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${
              marketOffset === 0 
                ? 'bg-green-500/20 text-green-400' 
                : marketOffset < 0 
                  ? 'bg-gray-500/20 text-gray-400'
                  : 'bg-blue-500/20 text-blue-400'
            }`}>
              {marketOffset === 0 ? 'LIVE' : marketOffset < 0 ? 'ENDED' : 'FUTURE'}
            </span>
            <span className="text-gray-300 font-medium">
              {getMarketWindowLabel(marketOffset, true)}
            </span>
          </div>

          {/* Countdown Timer - only show for live market */}
          {marketOffset === 0 && (
            <>
              <span className="text-gray-500 hidden sm:inline">→</span>
              <span className="text-gray-300 font-medium text-xs sm:text-sm">
                {String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
              </span>
            </>
          )}
        </div>

        {/* TradingView Chart Button - Commented out, side-by-side view is now default */}
        {/*
        <div className="flex items-center">
          <button
            onClick={handleTradingViewToggle}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded transition-colors flex items-center gap-2 ${
              showTradingView
                ? 'bg-gold-primary text-white'
                : isFutureMarket
                  ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            aria-label="TradingView Chart"
            title={isFutureMarket && showTradingView ? 'Poly Orderbook not available for future markets' : 'TradingView Chart'}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span className="hidden sm:inline">TradingView</span>
          </button>
        </div>
        */}
      </div>
    </div>
  )
}

export default ChartControls

