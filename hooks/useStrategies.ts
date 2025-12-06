'use client'

import { useState, useCallback, useEffect } from 'react'

// ============================================
// Types (matching ws-service/strategyRecorder.ts)
// ============================================

export interface Indicator {
  id: string
  type: string
  timeframe: string
  parameters: Record<string, number>
  useInConditions: boolean
  preset?: string
}

export interface Condition {
  id: string
  sourceA: string
  operator: string
  sourceB: string
  value?: number
  value2?: number
  candle: 'current' | 'previous'
}

export interface Action {
  id: string
  conditionId: string
  action: string
  direction: string
  market: string
  orderType: string
  orderPrice?: number
  sizing: string
  sizingValue?: number
}

export interface OrderbookRule {
  id: string
  field: string
  operator: string
  value: string
  value2?: string
  action: string
}

export interface OrderLadderItem {
  id: string
  price: string
  shares: string
}

export interface TimeRange {
  start: string
  end: string
}

export interface Strategy {
  id?: string
  userAddress: string
  name: string
  description?: string
  asset: string
  direction: string
  timeframe: string
  isLive: boolean
  isActive: boolean
  indicators: Indicator[]
  conditionLogic: 'all' | 'any'
  conditions: Condition[]
  actions: Action[]
  tradeOnEventsCount: number
  market?: string
  side?: string
  orderType?: string
  orderbookRules: OrderbookRule[]
  orderSizeMode: 'fixed_dollar' | 'fixed_shares' | 'percentage'
  fixedDollarAmount?: number
  fixedSharesAmount?: number
  percentageOfBalance?: number
  dynamicBaseSize?: number
  dynamicMaxSize?: number
  limitOrderPrice: 'best_ask' | 'best_bid' | 'mid_price' | 'custom'
  customLimitPrice?: number
  adjustPriceAboveBid: boolean
  adjustPriceBelowAsk: boolean
  maxTradesPerEvent?: number
  maxOpenOrders?: number
  dailyTradeCap?: number
  maxDailyLoss?: number
  maxOrdersPerHour?: number
  maxPositionShares?: number
  maxPositionDollar?: number
  useTakeProfit: boolean
  takeProfitPercent?: number
  useStopLoss: boolean
  stopLossPercent?: number
  unfilledOrderBehavior: 'keep_open' | 'cancel_after_seconds' | 'cancel_at_candle' | 'replace_market'
  cancelAfterSeconds?: number
  useOrderLadder: boolean
  orderLadder: OrderLadderItem[]
  selectedDays: string[]
  timeRange: TimeRange
  runOnNewCandle: boolean
  pauseOnSettlement: boolean
  createdAt?: string
  updatedAt?: string
}

export interface StrategyAnalytics {
  id?: string
  strategyId: string
  totalTrades: number
  winCount: number
  lossCount: number
  winRate: number
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  avgTradePnl: number
  bestTrade: number
  worstTrade: number
  sharpeRatio?: number
  maxDrawdown: number
  maxDrawdownPercent: number
  profitFactor: number
  totalVolume: number
  avgTradeSize: number
  avgPositionTimeSeconds: number
  tradesToday: number
  pnlToday: number
}

export interface StrategyTrade {
  id?: string
  strategyId: string
  userAddress: string
  marketId: string
  tokenId: string
  side: 'buy' | 'sell'
  direction: 'YES' | 'NO'
  entryPrice?: number
  exitPrice?: number
  shares: number
  pnl?: number
  fees?: number
  orderType: 'market' | 'limit'
  orderId?: string
  status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'expired'
  executedAt?: string
  settledAt?: string
  createdAt?: string
}

// ============================================
// API Functions
// ============================================

/**
 * Fetch all strategies (public, for browsing)
 */
export const fetchAllStrategies = async (
  limit = 50,
  offset = 0
): Promise<{ success: boolean; data?: Strategy[]; error?: string }> => {
  try {
    const response = await fetch(`/api/strategies?limit=${limit}&offset=${offset}`)
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error fetching strategies:', error)
    return { success: false, error: 'Failed to fetch strategies' }
  }
}

/**
 * Fetch strategies for a specific user
 */
export const fetchUserStrategies = async (
  userAddress: string
): Promise<{ success: boolean; data?: Strategy[]; error?: string }> => {
  try {
    const response = await fetch(`/api/strategies/user?address=${encodeURIComponent(userAddress)}`)
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error fetching user strategies:', error)
    return { success: false, error: 'Failed to fetch user strategies' }
  }
}

/**
 * Fetch a single strategy by ID
 */
export const fetchStrategy = async (
  strategyId: string
): Promise<{ success: boolean; data?: Strategy; error?: string }> => {
  try {
    const response = await fetch(`/api/strategies/${strategyId}`)
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error fetching strategy:', error)
    return { success: false, error: 'Failed to fetch strategy' }
  }
}

/**
 * Create a new strategy
 */
export const createStrategyAPI = async (
  strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; data?: Strategy; error?: string }> => {
  try {
    const response = await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(strategy),
    })
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error creating strategy:', error)
    return { success: false, error: 'Failed to create strategy' }
  }
}

/**
 * Update a strategy
 */
export const updateStrategyAPI = async (
  strategyId: string,
  updates: Partial<Strategy>
): Promise<{ success: boolean; data?: Strategy; error?: string }> => {
  try {
    const response = await fetch(`/api/strategies/${strategyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error updating strategy:', error)
    return { success: false, error: 'Failed to update strategy' }
  }
}

/**
 * Delete a strategy
 */
export const deleteStrategyAPI = async (
  strategyId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(`/api/strategies/${strategyId}`, {
      method: 'DELETE',
    })
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error deleting strategy:', error)
    return { success: false, error: 'Failed to delete strategy' }
  }
}

/**
 * Toggle strategy active status
 */
export const toggleStrategyActiveAPI = async (
  strategyId: string
): Promise<{ success: boolean; data?: Strategy; error?: string }> => {
  try {
    const response = await fetch(`/api/strategies/${strategyId}/toggle`, {
      method: 'POST',
    })
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error toggling strategy:', error)
    return { success: false, error: 'Failed to toggle strategy' }
  }
}

/**
 * Fetch strategy analytics
 */
export const fetchStrategyAnalytics = async (
  strategyId: string
): Promise<{ success: boolean; data?: StrategyAnalytics; error?: string }> => {
  try {
    const response = await fetch(`/api/strategies/${strategyId}/analytics`)
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return { success: false, error: 'Failed to fetch analytics' }
  }
}

/**
 * Fetch strategy trades
 */
export const fetchStrategyTrades = async (
  strategyId: string,
  limit = 100,
  offset = 0
): Promise<{ success: boolean; data?: StrategyTrade[]; error?: string }> => {
  try {
    const response = await fetch(
      `/api/strategies/${strategyId}/trades?limit=${limit}&offset=${offset}`
    )
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error fetching trades:', error)
    return { success: false, error: 'Failed to fetch trades' }
  }
}

// ============================================
// Hook: useStrategies
// ============================================

interface UseStrategiesOptions {
  userAddress?: string
  autoFetch?: boolean
}

interface UseStrategiesReturn {
  strategies: Strategy[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  createStrategy: (strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Strategy | null>
  updateStrategy: (strategyId: string, updates: Partial<Strategy>) => Promise<Strategy | null>
  deleteStrategy: (strategyId: string) => Promise<boolean>
  toggleActive: (strategyId: string) => Promise<Strategy | null>
}

export const useStrategies = (options: UseStrategiesOptions = {}): UseStrategiesReturn => {
  const { userAddress, autoFetch = true } = options
  
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = userAddress
        ? await fetchUserStrategies(userAddress)
        : await fetchAllStrategies()
      
      if (result.success && result.data) {
        setStrategies(result.data)
      } else {
        setError(result.error || 'Failed to fetch strategies')
      }
    } catch (err) {
      setError('Failed to fetch strategies')
    } finally {
      setLoading(false)
    }
  }, [userAddress])

  const createStrategy = useCallback(
    async (strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Strategy | null> => {
      const result = await createStrategyAPI(strategy)
      if (result.success && result.data) {
        setStrategies((prev) => [result.data!, ...prev])
        return result.data
      }
      setError(result.error || 'Failed to create strategy')
      return null
    },
    []
  )

  const updateStrategy = useCallback(
    async (strategyId: string, updates: Partial<Strategy>): Promise<Strategy | null> => {
      const result = await updateStrategyAPI(strategyId, updates)
      if (result.success && result.data) {
        setStrategies((prev) =>
          prev.map((s) => (s.id === strategyId ? result.data! : s))
        )
        return result.data
      }
      setError(result.error || 'Failed to update strategy')
      return null
    },
    []
  )

  const deleteStrategy = useCallback(async (strategyId: string): Promise<boolean> => {
    const result = await deleteStrategyAPI(strategyId)
    if (result.success) {
      setStrategies((prev) => prev.filter((s) => s.id !== strategyId))
      return true
    }
    setError(result.error || 'Failed to delete strategy')
    return false
  }, [])

  const toggleActive = useCallback(
    async (strategyId: string): Promise<Strategy | null> => {
      const result = await toggleStrategyActiveAPI(strategyId)
      if (result.success && result.data) {
        setStrategies((prev) =>
          prev.map((s) => (s.id === strategyId ? result.data! : s))
        )
        return result.data
      }
      setError(result.error || 'Failed to toggle strategy')
      return null
    },
    []
  )

  useEffect(() => {
    if (autoFetch) {
      refetch()
    }
  }, [autoFetch, refetch])

  return {
    strategies,
    loading,
    error,
    refetch,
    createStrategy,
    updateStrategy,
    deleteStrategy,
    toggleActive,
  }
}

// ============================================
// Hook: useStrategy (single strategy)
// ============================================

interface UseStrategyReturn {
  strategy: Strategy | null
  analytics: StrategyAnalytics | null
  trades: StrategyTrade[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  refetchAnalytics: () => Promise<void>
  refetchTrades: (limit?: number) => Promise<void>
}

export const useStrategy = (strategyId: string | null): UseStrategyReturn => {
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [analytics, setAnalytics] = useState<StrategyAnalytics | null>(null)
  const [trades, setTrades] = useState<StrategyTrade[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!strategyId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await fetchStrategy(strategyId)
      if (result.success && result.data) {
        setStrategy(result.data)
      } else {
        setError(result.error || 'Failed to fetch strategy')
      }
    } catch (err) {
      setError('Failed to fetch strategy')
    } finally {
      setLoading(false)
    }
  }, [strategyId])

  const refetchAnalytics = useCallback(async () => {
    if (!strategyId) return
    
    try {
      const result = await fetchStrategyAnalytics(strategyId)
      if (result.success && result.data) {
        setAnalytics(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    }
  }, [strategyId])

  const refetchTrades = useCallback(
    async (limit = 100) => {
      if (!strategyId) return
      
      try {
        const result = await fetchStrategyTrades(strategyId, limit)
        if (result.success && result.data) {
          setTrades(result.data)
        }
      } catch (err) {
        console.error('Failed to fetch trades:', err)
      }
    },
    [strategyId]
  )

  useEffect(() => {
    if (strategyId) {
      refetch()
      refetchAnalytics()
      refetchTrades()
    }
  }, [strategyId, refetch, refetchAnalytics, refetchTrades])

  return {
    strategy,
    analytics,
    trades,
    loading,
    error,
    refetch,
    refetchAnalytics,
    refetchTrades,
  }
}

export default useStrategies
