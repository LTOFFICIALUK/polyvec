'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import { useWallet } from '@/contexts/WalletContext'
import Link from 'next/link'

interface PolymarketTrade {
  id: string
  market: string
  asset_id: string
  side: 'BUY' | 'SELL'
  size: string
  price: string
  match_time: string
  outcome: string
  title: string
  transaction_hash?: string
}

interface ClosedPosition {
  conditionId: string
  avgPrice: number
  totalBought: number
  realizedPnl: number
  timestamp: number
  title: string
  outcome: string
  outcomeIndex?: number
}

interface DisplayTrade {
  id: string
  timestamp: string
  rawTimestamp: string | number
  market: string
  title: string
  side: string
  sideColor: string
  shares: number
  price: number
  costPerShare: string
  totalCost: string
  pnl: string
  pnlValue: number
  pnlColor: string
  status: 'Open' | 'Closed'
}

interface AnalyticsData {
  totalTrades: number
  winRate: number
  totalPnL: number
  avgTradeCost: number
  avgCostPerShare: number
  avgFrequency: {
    perMonth: number
  }
  avgProfit: number
  avgLoss: number
  wlRatio: number
  bestTrade: number
  worstTrade: number
  totalWins: number
  totalLosses: number
}

interface PricePointStats {
  price: number
  totalTrades: number
  wins: number
  losses: number
  winRate: number
}

interface MarketTypeStats {
  type: 'UP' | 'DOWN'
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  totalPnL: number
}

interface AssetStats {
  asset: string
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  totalPnL: number
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
    const handleClickOutside = (event: MouseEvent) => {
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
        className={`w-full pl-3 pr-8 py-2 h-[42px] bg-dark-bg border border-gray-800 rounded text-white text-sm leading-normal text-left focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent transition-colors ${
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
        <div className="absolute z-30 w-full mt-1 bg-dark-bg border border-gray-800 rounded shadow-lg max-h-60 overflow-auto">
          <ul role="listbox" className="py-1">
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
                                    : 'text-white hover:bg-dark-bg/50'
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

export default function AnalyticsPage() {
  const { walletAddress, isConnected } = useWallet()
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'performance' | 'markets'>('overview')
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null)
  const [selectedTrade, setSelectedTrade] = useState<DisplayTrade | null>(null)
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null)
  const [selectedPricePoint, setSelectedPricePoint] = useState<number | null>(null)
  const [timeRange, setTimeRange] = useState<string>('all')
  
  // Data state
  const [trades, setTrades] = useState<DisplayTrade[]>([])
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const timeRanges = [
    { value: 'all', label: 'All Time' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
  ]

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

  const transformTrade = useCallback((trade: PolymarketTrade): DisplayTrade => {
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
    
    // Debug: log the raw timestamp to see what format it's in (only in dev)
    if (process.env.NODE_ENV === 'development' && !timestampValue) {
      console.warn('[transformTrade] Missing timestamp for trade:', trade.id, 'Available fields:', Object.keys(trade))
    }
    
    return {
      id: trade.id,
      timestamp: formatTimestamp(timestampValue),
      rawTimestamp: timestampValue,
      market: trade.market,
      title: trade.title || 'Unknown Market',
      side: sideDisplay,
      sideColor,
      shares: size,
      price: price,
      costPerShare: formatPrice(price),
      totalCost: `$${totalCost.toFixed(2)}`,
      pnl: '-',
      pnlValue: 0,
      pnlColor: 'text-gray-400',
      status: 'Open',
    }
  }, [])

  const fetchData = useCallback(async () => {
    if (!walletAddress) return

    setLoading(true)
    setError(null)

    try {
      // Fetch trades and closed positions in parallel
      const [tradesRes, closedRes] = await Promise.all([
        fetch(`/api/user/trades?address=${walletAddress}&limit=500`),
        fetch(`/api/user/closed-positions?address=${walletAddress}&limit=100`),
      ])

      if (tradesRes.ok) {
        const tradesData = await tradesRes.json()
        const transformedTrades = (tradesData.trades || []).map(transformTrade)
        setTrades(transformedTrades)
      }

      if (closedRes.ok) {
        const closedData = await closedRes.json()
        setClosedPositions(closedData.positions || [])
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err)
      setError('Failed to load analytics data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [walletAddress, transformTrade])

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchData()
    } else {
      setTrades([])
      setClosedPositions([])
      setLoading(false)
    }
  }, [isConnected, walletAddress, fetchData])

  // Calculate analytics from real data
  const analyticsData = useMemo((): AnalyticsData => {
    // Filter closed positions for winners and losers
    const wins = closedPositions.filter((p) => p.realizedPnl > 0)
    const losses = closedPositions.filter((p) => p.realizedPnl < 0)
    
    const totalTrades = trades.length
    const totalClosedPositions = closedPositions.length
    const winRate = totalClosedPositions > 0 
      ? (wins.length / totalClosedPositions) * 100 
      : 0
    
    const totalPnL = closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0)
    
    // Calculate average trade cost from trades
    const tradeCosts = trades.map((t) => {
      const cost = parseFloat(t.totalCost.replace('$', ''))
      return isNaN(cost) ? 0 : cost
    })
    const avgTradeCost = tradeCosts.length > 0 
      ? tradeCosts.reduce((a, b) => a + b, 0) / tradeCosts.length 
      : 0

    // Average price per share
    const avgCostPerShare = trades.length > 0
      ? trades.reduce((sum, t) => sum + t.price, 0) / trades.length
      : 0

    // Calculate markets per month (unique markets traded)
    // Use market field if available, otherwise fall back to title
    const uniqueMarkets = new Set(
      trades
        .map((t) => t.market || t.title)
        .filter((market): market is string => Boolean(market))
    )
    const totalUniqueMarkets = uniqueMarkets.size
    
    const timestamps = trades
      .map((t) => {
        const rawTime = t.rawTimestamp
        if (!rawTime) return null
        
        // Handle number timestamps (could be seconds or milliseconds)
        if (typeof rawTime === 'number') {
          // If it's less than a year 2000 timestamp in seconds, it's likely seconds
          if (rawTime < 946684800000) {
            return rawTime * 1000 // Convert seconds to milliseconds
          }
          return rawTime // Already in milliseconds
        }
        
        // Handle string timestamps
        if (typeof rawTime === 'string') {
          const date = new Date(rawTime)
          const time = date.getTime()
          return isNaN(time) ? null : time
        }
        
        return null
      })
      .filter((time): time is number => time !== null && !isNaN(time))
    
    let perMonth = 0
    
    if (totalUniqueMarkets > 0) {
      if (timestamps.length > 1) {
        const minTime = Math.min(...timestamps)
        const maxTime = Math.max(...timestamps)
        const daysDiff = (maxTime - minTime) / (1000 * 60 * 60 * 24)
        // Use at least 1 day to avoid division by zero, but allow fractional months
        const monthsDiff = Math.max(daysDiff / 30.44, 1 / 30.44) // Minimum 1 day = ~0.033 months
        perMonth = totalUniqueMarkets / monthsDiff
      } else if (timestamps.length === 1) {
        // If only one trade with valid timestamp, assume 1 month for calculation
        perMonth = totalUniqueMarkets
      } else if (timestamps.length === 0 && trades.length > 0) {
        // If we have trades but no valid timestamps, assume 1 month
        perMonth = totalUniqueMarkets
      }
    }

    // Average profit/loss from closed positions
    const avgProfit = wins.length > 0
      ? wins.reduce((sum, p) => sum + p.realizedPnl, 0) / wins.length
      : 0
    
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, p) => sum + p.realizedPnl, 0) / losses.length
      : 0

    // W/L Ratio
    const wlRatio = losses.length > 0 && avgLoss !== 0
      ? Math.abs(avgProfit / avgLoss)
      : avgProfit > 0 ? Infinity : 0

    // Best/worst trades
    const pnlValues = closedPositions.map((p) => p.realizedPnl)
    const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0
    const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0

    return {
      totalTrades,
      winRate: Math.round(winRate * 10) / 10,
      totalPnL: Math.round(totalPnL * 100) / 100,
      avgTradeCost: Math.round(avgTradeCost * 100) / 100,
      avgCostPerShare: Math.round(avgCostPerShare * 100) / 100,
      avgFrequency: {
        perMonth: isNaN(perMonth) || !isFinite(perMonth) ? 0 : Math.round(perMonth),
      },
      avgProfit: Math.round(avgProfit * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      wlRatio: Math.round(wlRatio * 100) / 100,
      bestTrade: Math.round(bestTrade * 100) / 100,
      worstTrade: Math.round(worstTrade * 100) / 100,
      totalWins: wins.length,
      totalLosses: losses.length,
    }
  }, [trades, closedPositions])

  // Calculate win rate by price point
  const pricePointStats = useMemo(() => {
    const stats: Record<number, { total: number; wins: number; losses: number }> = {}

    // Initialize all price points
    for (let i = 1; i <= 99; i++) {
      stats[i] = { total: 0, wins: 0, losses: 0 }
    }

    // Use closed positions which have PnL data
    closedPositions.forEach((position) => {
      const price = Math.round(position.avgPrice * 100)
      if (price >= 1 && price <= 99) {
        stats[price].total++
        if (position.realizedPnl > 0) {
          stats[price].wins++
        } else if (position.realizedPnl < 0) {
          stats[price].losses++
        }
      }
    })

    return Object.keys(stats)
      .map((price) => {
        const priceNum = parseInt(price)
        const stat = stats[priceNum]
        const winRate = stat.total > 0 ? (stat.wins / stat.total) * 100 : 0
        return {
          price: priceNum,
          totalTrades: stat.total,
          wins: stat.wins,
          losses: stat.losses,
          winRate: winRate,
        }
      })
      .sort((a, b) => a.price - b.price)
  }, [closedPositions])

  // Helper functions to extract market information
  const getMarketType = (side: string): 'UP' | 'DOWN' | null => {
    if (side.includes('UP')) return 'UP'
    if (side.includes('DOWN')) return 'DOWN'
    return null
  }

  const getAssetType = (title: string): string => {
    // Extract asset from title (e.g., "Bitcoin Up or Down" -> "BTC", "Ethereum Up or Down" -> "ETH")
    const titleLower = title.toLowerCase()
    
    // Common asset mappings
    if (titleLower.includes('bitcoin') || titleLower.includes('btc')) return 'BTC'
    if (titleLower.includes('ethereum') || titleLower.includes('eth')) return 'ETH'
    if (titleLower.includes('solana') || titleLower.includes('sol')) return 'SOL'
    if (titleLower.includes('xrp')) return 'XRP'
    if (titleLower.includes('cardano') || titleLower.includes('ada')) return 'ADA'
    if (titleLower.includes('polygon') || titleLower.includes('matic')) return 'MATIC'
    if (titleLower.includes('avalanche') || titleLower.includes('avax')) return 'AVAX'
    if (titleLower.includes('chainlink') || titleLower.includes('link')) return 'LINK'
    if (titleLower.includes('litecoin') || titleLower.includes('ltc')) return 'LTC'
    if (titleLower.includes('dogecoin') || titleLower.includes('doge')) return 'DOGE'
    
    // Try to extract from market slug or title pattern
    const match = title.match(/\b([A-Z]{2,5})\b/i)
    if (match) {
      const potential = match[1].toUpperCase()
      if (['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'MATIC', 'AVAX', 'LINK', 'LTC', 'DOGE'].includes(potential)) {
        return potential
      }
    }
    
    return 'Other'
  }

  // Calculate market statistics by type (UP/DOWN)
  const marketTypeStats = useMemo(() => {
    const stats: Record<'UP' | 'DOWN', { total: number; wins: number; losses: number; pnl: number }> = {
      UP: { total: 0, wins: 0, losses: 0, pnl: 0 },
      DOWN: { total: 0, wins: 0, losses: 0, pnl: 0 },
    }

    // Use closed positions directly
    // For Polymarket "Up or Down" markets:
    // - outcome "Yes" / outcomeIndex 0 = UP (betting price goes up)
    // - outcome "No" / outcomeIndex 1 = DOWN (betting price goes down)
    closedPositions.forEach((position) => {
      let marketType: 'UP' | 'DOWN' | null = null
      
      // First try outcomeIndex (most reliable) - 0 = Yes/UP, 1 = No/DOWN
      if (typeof position.outcomeIndex === 'number') {
        marketType = position.outcomeIndex === 0 ? 'UP' : 'DOWN'
      }
      
      // Fallback to outcome string
      if (!marketType && position.outcome) {
        const outcome = position.outcome.toLowerCase().trim()
        // Handle various formats: "Yes", "yes", "YES", "No", "no", "NO"
        if (outcome === 'yes' || outcome === 'y') {
          marketType = 'UP'
        } else if (outcome === 'no' || outcome === 'n') {
          marketType = 'DOWN'
        }
      }

      if (marketType) {
        stats[marketType].total++
        stats[marketType].pnl += position.realizedPnl
        if (position.realizedPnl > 0) {
          stats[marketType].wins++
        } else if (position.realizedPnl < 0) {
          stats[marketType].losses++
        }
      }
    })

    return (['UP', 'DOWN'] as const).map((type) => {
      const stat = stats[type]
      const winRate = stat.total > 0 ? (stat.wins / stat.total) * 100 : 0
      return {
        type,
        totalTrades: stat.total,
        wins: stat.wins,
        losses: stat.losses,
        winRate,
        totalPnL: stat.pnl,
      }
    })
  }, [closedPositions])

  // Calculate asset statistics
  const assetStats = useMemo(() => {
    const stats: Record<string, { total: number; wins: number; losses: number; pnl: number }> = {}

    // Use closed positions directly - extract asset from title
    closedPositions.forEach((position) => {
      const asset = getAssetType(position.title)
      if (!stats[asset]) {
        stats[asset] = { total: 0, wins: 0, losses: 0, pnl: 0 }
      }
      stats[asset].total++
      stats[asset].pnl += position.realizedPnl
      if (position.realizedPnl > 0) {
        stats[asset].wins++
      } else if (position.realizedPnl < 0) {
        stats[asset].losses++
      }
    })

    return Object.keys(stats)
      .map((asset) => {
        const stat = stats[asset]
        const winRate = stat.total > 0 ? (stat.wins / stat.total) * 100 : 0
        return {
          asset,
          totalTrades: stat.total,
          wins: stat.wins,
          losses: stat.losses,
          winRate,
          totalPnL: stat.pnl,
        }
      })
      .sort((a, b) => b.totalTrades - a.totalTrades)
  }, [closedPositions])

  const handleTradeClick = (trade: DisplayTrade) => {
    if (expandedTrade === trade.id) {
      setExpandedTrade(null)
      setSelectedTrade(null)
    } else {
      setExpandedTrade(trade.id)
      setSelectedTrade(trade)
    }
  }

  const closeTradeDetail = () => {
    setExpandedTrade(null)
    setSelectedTrade(null)
  }

  const handlePricePointClick = (price: number) => {
    setSelectedPricePoint(price)
  }

  const closePricePointModal = () => {
    setSelectedPricePoint(null)
  }

  // Get color for win rate (heatmap style)
  const getWinRateColor = (winRate: number, totalTrades: number) => {
    if (totalTrades === 0) {
      return 'bg-dark-bg border-gray-800'
    }
    if (winRate >= 70) {
      return 'bg-green-600/80 border-green-500'
    } else if (winRate >= 60) {
      return 'bg-green-500/60 border-green-400'
    } else if (winRate >= 50) {
      return 'bg-yellow-500/60 border-yellow-400'
    } else if (winRate >= 40) {
      return 'bg-orange-500/60 border-orange-400'
    } else {
      return 'bg-red-500/60 border-red-400'
    }
  }

  const getTextColor = (winRate: number, totalTrades: number) => {
    if (totalTrades === 0) {
      return 'text-gray-600'
    }
    return 'text-white'
  }

  // Get trades for selected price point
  const getTradesForPricePoint = (price: number): ClosedPosition[] => {
    return closedPositions.filter((position) => {
      const posPrice = Math.round(position.avgPrice * 100)
      return posPrice === price
    })
  }

  // Not connected state
  if (!isConnected) {
    return (
      <div className="bg-dark-bg text-white flex-1">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Analytics</h1>
          <div className="py-16 text-center">
            <h2 className="text-base font-medium text-gray-400 mb-1">Wallet Not Connected</h2>
            <p className="text-sm text-gray-500">
              Connect your wallet to view your trading analytics.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-dark-bg text-white flex-1">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Analytics</h1>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <svg className="w-12 h-12 animate-spin text-gold-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-400">Loading your analytics...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-bg text-white flex-1">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Analytics</h1>
              <p className="text-sm text-gray-400 mt-1">
                Your trading performance insights
              </p>
            </div>
            <div className="flex items-center gap-3">
              <CustomDropdown
                value={timeRange}
                onChange={(value) => setTimeRange(value)}
                options={timeRanges}
                placeholder="Time Range"
                className="w-40"
              />
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-dark-bg/60 border border-gray-800 rounded text-sm text-gray-400 hover:text-white hover:border-gray-700 transition-colors"
                aria-label="Refresh data"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'overview' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Overview
              {activeTab === 'overview' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'trades' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Trade Details
              {activeTab === 'trades' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'performance' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Performance
              {activeTab === 'performance' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('markets')}
              className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                activeTab === 'markets' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Markets
              {activeTab === 'markets' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
              )}
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {trades.length === 0 && closedPositions.length === 0 ? (
              <div className="py-16 text-center">
                <h2 className="text-base font-medium text-gray-400 mb-1">No Trading Data</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Start trading on Polymarket to see your analytics here.
                </p>
                <Link
                  href="/terminal"
                  className="inline-block px-6 py-2.5 bg-gold-primary hover:bg-gold-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Go to Terminal
                </Link>
              </div>
            ) : (
              <>
                {/* Key Metrics - Large Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Total PnL - Hero Card */}
                  <div className="md:col-span-2 bg-gradient-to-br from-dark-bg/80 to-dark-bg/40 rounded-xl p-6 border border-gold-primary/20 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-sm text-gray-400 uppercase tracking-wider">Total Profit & Loss</div>
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        analyticsData.totalPnL >= 0 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {analyticsData.totalPnL >= 0 ? 'PROFITABLE' : 'IN LOSS'}
                    </div>
                      </div>
                    <div className={`text-5xl font-bold mb-2 ${
                      analyticsData.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {analyticsData.totalPnL >= 0 ? '+' : ''}${analyticsData.totalPnL.toFixed(2)}
                      </div>
                    <div className="text-xs text-gray-500">Across {closedPositions.length} closed position{closedPositions.length !== 1 ? 's' : ''}</div>
                    </div>

                  {/* Win Rate Card */}
                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">Win Rate</div>
                    <div className="flex items-end gap-3 mb-4">
                      <div className={`text-4xl font-bold ${analyticsData.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {analyticsData.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex-1">
                        <div className="text-gray-500 text-xs mb-1">Wins</div>
                        <div className="text-green-400 font-semibold">{analyticsData.totalWins}</div>
                      </div>
                      <div className="w-px h-8 bg-gray-800"></div>
                      <div className="flex-1">
                        <div className="text-gray-500 text-xs mb-1">Losses</div>
                        <div className="text-red-400 font-semibold">{analyticsData.totalLosses}</div>
                    </div>
                    </div>
                      </div>
                    </div>

                {/* Trading Activity */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                    <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Total Trades</div>
                    <div className="text-3xl font-bold text-white mb-1">{analyticsData.totalTrades}</div>
                    <div className="text-xs text-gray-500">All-time activity</div>
                      </div>

                  <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                    <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Trading Frequency</div>
                    <div className="text-2xl font-bold text-white mb-1">
                      {isNaN(analyticsData.avgFrequency.perMonth) ? 0 : analyticsData.avgFrequency.perMonth}/month
                    </div>
                    <div className="text-xs text-gray-500">Unique markets traded</div>
                      </div>

                  <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                    <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Avg Trade Size</div>
                    <div className="text-3xl font-bold text-white mb-1">${analyticsData.avgTradeCost.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Per transaction</div>
                    </div>

                  <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                    <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Avg Price</div>
                    <div className="text-3xl font-bold text-white mb-1">{Math.round(analyticsData.avgCostPerShare * 100)}¢</div>
                    <div className="text-xs text-gray-500">Per share</div>
                      </div>
                    </div>

                {/* Profitability Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">Profitability Metrics</div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Average Profit</div>
                          <div className="text-2xl font-bold text-green-400">+${analyticsData.avgProfit.toFixed(2)}</div>
                      </div>
                        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                    </div>
                      </div>
                      <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Average Loss</div>
                          <div className="text-2xl font-bold text-red-400">-${Math.abs(analyticsData.avgLoss).toFixed(2)}</div>
                    </div>
                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                          </svg>
                      </div>
                    </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Win/Loss Ratio</div>
                          <div className="text-2xl font-bold text-white">
                            {analyticsData.wlRatio === Infinity ? '∞' : analyticsData.wlRatio.toFixed(2)}x
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>

                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">Best & Worst Trades</div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Best Trade</div>
                          <div className="text-2xl font-bold text-green-400">+${analyticsData.bestTrade.toFixed(2)}</div>
                      </div>
                        <div className="w-12 h-12 rounded-full bg-gold-primary/20 flex items-center justify-center">
                          <svg className="w-6 h-6 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Worst Trade</div>
                          <div className="text-2xl font-bold text-red-400">-${Math.abs(analyticsData.worstTrade).toFixed(2)}</div>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-300">Recent Trades</h2>
              <div className="text-sm text-gray-400">
                {trades.length} trades loaded
              </div>
            </div>

            {trades.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500">No trades found</p>
              </div>
            ) : (
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
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 50).map((trade) => (
                      <tr
                        key={trade.id}
                        onClick={() => handleTradeClick(trade)}
                        className="border-b border-gray-800 hover:bg-dark-bg/30 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{trade.timestamp}</td>
                        <td className="py-3 px-4">
                          <div className="max-w-xs truncate text-white" title={trade.title}>
                            {trade.title}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={trade.sideColor}>{trade.side}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {trade.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {trade.costPerShare}
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {trade.totalCost}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="space-y-6">
              {closedPositions.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">
                    No closed positions to analyze. Complete some trades to see your performance by price point.
                  </p>
                </div>
              ) : (
                <>
                {/* Performance Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">Best Performing</div>
                    {(() => {
                      const bestStats = pricePointStats
                        .filter((s) => s.totalTrades >= 2)
                        .sort((a, b) => b.winRate - a.winRate)
                      const best = bestStats[0]
                      return best ? (
                        <>
                          <div className="text-3xl font-bold text-green-400 mb-2">{best.price}¢</div>
                          <div className="text-sm text-gray-300 mb-4">
                            <span className="text-green-400 font-semibold">{best.winRate.toFixed(1)}%</span> win rate
                      </div>
                          <div className="text-xs text-gray-500">
                            {best.totalTrades} position{best.totalTrades !== 1 ? 's' : ''} • {best.wins}W / {best.losses}L
                      </div>
                        </>
                      ) : (
                        <div className="text-gray-500 text-sm">Insufficient data</div>
                      )
                    })()}
                      </div>

                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">Most Active</div>
                    {(() => {
                      const mostTraded = pricePointStats
                        .filter((s) => s.totalTrades > 0)
                        .sort((a, b) => b.totalTrades - a.totalTrades)
                      const most = mostTraded[0]
                      return most ? (
                        <>
                          <div className="text-3xl font-bold text-gold-primary mb-2">{most.price}¢</div>
                          <div className="text-sm text-gray-300 mb-4">
                            <span className="font-semibold">{most.totalTrades}</span> position{most.totalTrades !== 1 ? 's' : ''}
                      </div>
                          <div className="text-xs text-gray-500">
                            {most.winRate.toFixed(1)}% win rate • {most.wins}W / {most.losses}L
                      </div>
                        </>
                      ) : (
                        <div className="text-gray-500 text-sm">No data</div>
                      )
                    })()}
                      </div>

                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">Worst Performing</div>
                    {(() => {
                      const worstStats = pricePointStats
                        .filter((s) => s.totalTrades >= 2)
                        .sort((a, b) => a.winRate - b.winRate)
                      const worst = worstStats[0]
                      return worst ? (
                        <>
                          <div className="text-3xl font-bold text-red-400 mb-2">{worst.price}¢</div>
                          <div className="text-sm text-gray-300 mb-4">
                            <span className="text-red-400 font-semibold">{worst.winRate.toFixed(1)}%</span> win rate
                          </div>
                          <div className="text-xs text-gray-500">
                            {worst.totalTrades} position{worst.totalTrades !== 1 ? 's' : ''} • {worst.wins}W / {worst.losses}L
                          </div>
                        </>
                      ) : (
                        <div className="text-gray-500 text-sm">Insufficient data</div>
                      )
                    })()}
                    </div>
                  </div>

                {/* Price Range Performance */}
                <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-2">Performance by Price Range</h3>
                    <p className="text-sm text-gray-400">
                      Your win rate across different price ranges. Click any range to see details.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {[
                      { label: '0-20¢', min: 1, max: 20, color: 'from-red-500/20 to-orange-500/20' },
                      { label: '21-40¢', min: 21, max: 40, color: 'from-orange-500/20 to-yellow-500/20' },
                      { label: '41-60¢', min: 41, max: 60, color: 'from-yellow-500/20 to-green-500/20' },
                      { label: '61-80¢', min: 61, max: 80, color: 'from-green-500/20 to-green-600/20' },
                      { label: '81-99¢', min: 81, max: 99, color: 'from-green-600/20 to-green-500/20' },
                    ].map((range) => {
                      const rangeStats = pricePointStats.filter((s) => s.price >= range.min && s.price <= range.max)
                      const totalTrades = rangeStats.reduce((sum, s) => sum + s.totalTrades, 0)
                      const totalWins = rangeStats.reduce((sum, s) => sum + s.wins, 0)
                      const totalLosses = rangeStats.reduce((sum, s) => sum + s.losses, 0)
                      const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0
                      const pricePointsUsed = rangeStats.filter((s) => s.totalTrades > 0).length

                            return (
                              <div
                          key={range.label}
                          className="bg-gradient-to-r from-dark-bg/40 to-dark-bg/60 rounded-lg p-5 border border-gray-800 hover:border-gray-700 transition-colors cursor-pointer"
                          onClick={() => {
                            // Find first price in range with trades for modal
                            const firstWithTrades = rangeStats.find((s) => s.totalTrades > 0)
                            if (firstWithTrades) {
                              handlePricePointClick(firstWithTrades.price)
                            }
                          }}
                              >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="text-lg font-bold text-white">{range.label}</div>
                              <div className="text-xs text-gray-500 px-2 py-1 bg-dark-bg/60 rounded">
                                {pricePointsUsed} price point{pricePointsUsed !== 1 ? 's' : ''} used
                                  </div>
                                  </div>
                            <div className={`text-2xl font-bold ${
                              winRate >= 50 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {winRate.toFixed(1)}%
                                    </div>
                                </div>

                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-gray-400">Win Rate</span>
                                <span className="text-white font-semibold">{winRate.toFixed(1)}%</span>
                                    </div>
                              <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    winRate >= 70 ? 'bg-green-500' :
                                    winRate >= 60 ? 'bg-green-400' :
                                    winRate >= 50 ? 'bg-yellow-500' :
                                    winRate >= 40 ? 'bg-orange-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(winRate, 100)}%` }}
                                />
                                        </div>
                                        </div>
                                        </div>

                          <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
                            <div>
                              <span className="text-gray-400">Positions:</span>{' '}
                              <span className="text-white font-semibold">{totalTrades}</span>
                                        </div>
                            <div>
                              <span className="text-green-400 font-semibold">{totalWins}W</span>
                              {' / '}
                              <span className="text-red-400 font-semibold">{totalLosses}L</span>
                                      </div>
                                      </div>
                              </div>
                            )
                          })}
                        </div>
                    </div>

                {/* Top 10 Best & Worst Price Points */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Top 10 Best Price Points
                    </div>
                    <div className="space-y-2">
                      {pricePointStats
                                .filter((s) => s.totalTrades >= 2)
                                .sort((a, b) => b.winRate - a.winRate)
                        .slice(0, 10)
                        .map((stat, index) => (
                          <div
                            key={stat.price}
                            className="flex items-center justify-between p-3 bg-dark-bg/40 rounded-lg border border-gray-800/50 hover:border-green-500/50 transition-colors cursor-pointer"
                            onClick={() => handlePricePointClick(stat.price)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold">
                                {index + 1}
                          </div>
                              <div>
                                <div className="text-white font-semibold">{stat.price}¢</div>
                                <div className="text-xs text-gray-500">{stat.totalTrades} position{stat.totalTrades !== 1 ? 's' : ''}</div>
                        </div>
                          </div>
                            <div className="text-right">
                              <div className="text-green-400 font-bold">{stat.winRate.toFixed(1)}%</div>
                              <div className="text-xs text-gray-500">{stat.wins}W / {stat.losses}L</div>
                        </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                    <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6 6" />
                      </svg>
                      Top 10 Worst Price Points
                    </div>
                    <div className="space-y-2">
                      {pricePointStats
                                .filter((s) => s.totalTrades >= 2)
                                .sort((a, b) => a.winRate - b.winRate)
                        .slice(0, 10)
                        .map((stat, index) => (
                          <div
                            key={stat.price}
                            className="flex items-center justify-between p-3 bg-dark-bg/40 rounded-lg border border-gray-800/50 hover:border-red-500/50 transition-colors cursor-pointer"
                            onClick={() => handlePricePointClick(stat.price)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-xs font-bold">
                                {index + 1}
                          </div>
                              <div>
                                <div className="text-white font-semibold">{stat.price}¢</div>
                                <div className="text-xs text-gray-500">{stat.totalTrades} position{stat.totalTrades !== 1 ? 's' : ''}</div>
                        </div>
                          </div>
                            <div className="text-right">
                              <div className="text-red-400 font-bold">{stat.winRate.toFixed(1)}%</div>
                              <div className="text-xs text-gray-500">{stat.wins}W / {stat.losses}L</div>
                        </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
          </div>
        )}

        {/* Markets Tab */}
        {activeTab === 'markets' && (
          <div className="space-y-6">
            {closedPositions.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500">
                  No closed positions to analyze. Complete some trades to see your market analytics.
                </p>
              </div>
            ) : (
              <>
                {/* Market Type Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {marketTypeStats.map((stat) => (
                    <div key={stat.type} className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                      <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">
                        {stat.type} Markets
                      </div>
                      <div className="space-y-4">
                        <div>
                          <div className="text-3xl font-bold text-white mb-2">{stat.totalTrades}</div>
                          <div className="text-xs text-gray-500">Total Positions</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className={`text-2xl font-bold mb-1 ${stat.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                              {stat.winRate.toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500">Win Rate</div>
                          </div>
                          <div>
                            <div className={`text-2xl font-bold mb-1 ${stat.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {stat.totalPnL >= 0 ? '+' : ''}${stat.totalPnL.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">Total P&L</div>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-gray-800">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-green-400 font-semibold">{stat.wins}W</span>
                            <span className="text-gray-500">/</span>
                            <span className="text-red-400 font-semibold">{stat.losses}L</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Asset Performance */}
                <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-2">Performance by Asset</h3>
                    <p className="text-sm text-gray-400">
                      Your trading statistics broken down by cryptocurrency asset.
                    </p>
                  </div>
                  {assetStats.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      No asset data available
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assetStats.map((stat) => (
                        <div
                          key={stat.asset}
                          className="bg-dark-bg/40 rounded-lg p-4 border border-gray-800/50 hover:border-gray-700 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-gold-primary/20 flex items-center justify-center">
                                <span className="text-gold-primary font-bold text-lg">{stat.asset}</span>
                              </div>
                              <div>
                                <div className="text-white font-semibold">{stat.asset}</div>
                                <div className="text-xs text-gray-500">
                                  {stat.totalTrades} position{stat.totalTrades !== 1 ? 's' : ''} • {stat.wins}W / {stat.losses}L
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`font-bold text-lg ${stat.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                {stat.winRate.toFixed(1)}%
                              </div>
                              <div className={`text-sm ${stat.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {stat.totalPnL >= 0 ? '+' : ''}${stat.totalPnL.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Market Type Comparison */}
                <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-2">UP vs DOWN Comparison</h3>
                    <p className="text-sm text-gray-400">
                      Compare your performance trading UP markets versus DOWN markets.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {marketTypeStats.map((stat) => (
                      <div key={stat.type} className="bg-dark-bg/40 rounded-lg p-5 border border-gray-800/50">
                        <div className="flex items-center justify-between mb-4">
                          <div className={`text-2xl font-bold ${stat.type === 'UP' ? 'text-green-400' : 'text-red-400'}`}>
                            {stat.type}
                          </div>
                          <div className={`text-xl font-bold ${stat.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {stat.totalPnL >= 0 ? '+' : ''}${stat.totalPnL.toFixed(2)}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Win Rate</span>
                            <span className={`font-semibold ${stat.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                              {stat.winRate.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Total Positions</span>
                            <span className="text-white font-semibold">{stat.totalTrades}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Wins / Losses</span>
                            <span className="text-white">
                              <span className="text-green-400">{stat.wins}</span> / <span className="text-red-400">{stat.losses}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Price Point Detail Modal */}
      {selectedPricePoint !== null && (
        <div
          className="fixed inset-0 bg-dark-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closePricePointModal}
        >
          <div
            className="bg-dark-bg border border-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-dark-bg">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Entry Price: {selectedPricePoint}¢
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Positions entered at this price point
                </p>
              </div>
              <button
                onClick={closePricePointModal}
                className="text-gray-400 hover:text-white transition-colors p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-dark-bg">
              {(() => {
                const pricePositions = getTradesForPricePoint(selectedPricePoint)
                const priceStat = pricePointStats.find((s) => s.price === selectedPricePoint) || {
                  price: selectedPricePoint,
                  totalTrades: 0,
                  wins: 0,
                  losses: 0,
                  winRate: 0,
                }

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-dark-bg/50 rounded-lg p-4 border border-gray-800">
                        <div className="text-xs text-gray-400 mb-1">Total Positions</div>
                        <div className="text-white font-bold text-2xl">{priceStat.totalTrades}</div>
                      </div>
                      <div className="bg-dark-bg/50 rounded-lg p-4 border border-gray-800">
                        <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                        <div className={`font-bold text-2xl ${priceStat.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                          {priceStat.winRate.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-dark-bg/50 rounded-lg p-4 border border-gray-800">
                        <div className="text-xs text-gray-400 mb-1">Wins</div>
                        <div className="text-green-400 font-bold text-2xl">{priceStat.wins}</div>
                      </div>
                      <div className="bg-dark-bg/50 rounded-lg p-4 border border-gray-800">
                        <div className="text-xs text-gray-400 mb-1">Losses</div>
                        <div className="text-red-400 font-bold text-2xl">{priceStat.losses}</div>
                      </div>
                    </div>

                    {pricePositions.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3">Position History</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-gray-400 border-b border-gray-800">
                              <tr>
                                <th className="text-left py-3 px-4 font-medium">Closed</th>
                                <th className="text-left py-3 px-4 font-medium">Market</th>
                                <th className="text-left py-3 px-4 font-medium">Outcome</th>
                                <th className="text-right py-3 px-4 font-medium">Avg Price</th>
                                <th className="text-right py-3 px-4 font-medium">Total Bought</th>
                                <th className="text-right py-3 px-4 font-medium">PnL</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pricePositions.map((position, index) => {
                                const pnl = position.realizedPnl
                                const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400'
                                const pnlDisplay = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`

                                return (
                                  <tr
                                    key={`${position.conditionId}-${index}`}
                                    className="border-b border-gray-800 hover:bg-dark-bg/30"
                                  >
                                    <td className="py-3 px-4 text-gray-400">
                                      {formatTimestamp(position.timestamp)}
                                    </td>
                                    <td className="py-3 px-4 text-white truncate max-w-xs">
                                      {position.title}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className={position.outcome === 'Yes' ? 'text-green-400' : 'text-red-400'}>
                                        {position.outcome === 'Yes' ? 'UP' : 'DOWN'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 text-right text-white font-mono">
                                      {Math.round(position.avgPrice * 100)}¢
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
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

