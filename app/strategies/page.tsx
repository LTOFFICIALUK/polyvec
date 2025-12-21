'use client'

// ============================================
// COMING SOON PAGE - Commented out for future use
// ============================================
// Original "Coming Soon" content commented out below
// To restore: Uncomment the ComingSoonPage component and update the default export
// ============================================

import { useState, useEffect, KeyboardEvent, MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useStrategies, Strategy, fetchStrategyAnalytics } from '@/hooks/useStrategies'
import { useWallet } from '@/contexts/WalletContext'
import { useAuth } from '@/contexts/AuthContext'
import PlanSelectionModal from '@/components/PlanSelectionModal'

// ============================================
// Auto-Trading Setup Component
// ============================================

interface TradingKeyStatus {
  hasKey: boolean
  metadata?: {
    isActive: boolean
    createdAt: string
    lastUsedAt?: string
  } | null
}

const WS_SERVICE_URL = process.env.NEXT_PUBLIC_WS_URL_A || 'http://localhost:8081'

const AutoTradingSetup = function({ userAddress }: { userAddress: string }) {
  const [status, setStatus] = useState<TradingKeyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [privateKey, setPrivateKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Check if user has a trading key
  useEffect(() => {
    const checkKey = async () => {
      try {
        const res = await fetch(`${WS_SERVICE_URL}/api/trading/key/check?address=${userAddress}`)
        const data = await res.json()
        setStatus(data)
      } catch {
        // Service might not be available
        setStatus(null)
      } finally {
        setLoading(false)
      }
    }
    checkKey()
  }, [userAddress])

  const handleSaveKey = async () => {
    if (!privateKey.trim()) {
      setError('Please enter your private key')
      return
    }

    // Basic validation - should be 64 hex chars (with or without 0x)
    const cleanKey = privateKey.trim().replace('0x', '')
    if (!/^[a-fA-F0-9]{64}$/.test(cleanKey)) {
      setError('Invalid private key format. Should be 64 hex characters.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`${WS_SERVICE_URL}/api/trading/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          privateKey: privateKey.trim(),
        }),
      })

      const data = await res.json()

      if (data.success) {
        setSuccess('Trading key saved securely!')
        setPrivateKey('')
        setShowKeyInput(false)
        setStatus({ hasKey: true, metadata: { isActive: true, createdAt: new Date().toISOString() } })
      } else {
        setError(data.error || 'Failed to save key')
      }
    } catch {
      setError('Failed to connect to trading service')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteKey = async () => {
    if (!confirm('Are you sure you want to remove your trading key? Auto-trading will be disabled.')) {
      return
    }

    try {
      const res = await fetch(`${WS_SERVICE_URL}/api/trading/key?address=${userAddress}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        setStatus({ hasKey: false })
        setSuccess('Trading key removed')
      }
    } catch {
      setError('Failed to remove key')
    }
  }

  if (loading) {
    return (
      <div className="mb-6 p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-5 h-5 bg-gray-700 rounded"></div>
          <div className="h-4 bg-gray-700 rounded w-48"></div>
        </div>
      </div>
    )
  }

  // Service not available - still show setup but with message
  const serviceUnavailable = status === null

  return (
    <div className="mb-6">
      {/* Success/Error messages */}
      {success && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-green-400 text-sm">{success}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {serviceUnavailable ? (
        // Service not available - show setup prompt with note
        <div className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Auto-Trading</p>
                <p className="text-gray-400 text-sm">Backend service connecting... Auto-trading setup available on production.</p>
              </div>
            </div>
          </div>
        </div>
      ) : status?.hasKey ? (
        // Key is configured
        <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Auto-Trading Enabled</p>
                <p className="text-gray-400 text-sm">Your trading key is securely stored. Strategies will execute automatically.</p>
              </div>
            </div>
            <button
              onClick={handleDeleteKey}
              className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
            >
              Remove Key
            </button>
          </div>
        </div>
      ) : showKeyInput ? (
        // Key input form
        <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">Enter Your Private Key</p>
              <p className="text-gray-400 text-sm mt-1">
                Your key is encrypted with AES-256 before storage. We never see or store your plaintext key.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Private Key</label>
              <input
                type="password"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Enter your wallet private key (64 hex characters)"
                className="w-full px-3 py-2 bg-dark-bg border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gold-primary"
              />
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-yellow-400 text-xs">
                <strong>⚠️ Security Recommendations:</strong>
              </p>
              <ul className="text-yellow-400/80 text-xs mt-1 space-y-1 list-disc list-inside">
                <li>Use a dedicated trading wallet, not your main wallet</li>
                <li>Only deposit funds you're willing to trade with</li>
                <li>Your key is encrypted and can be removed anytime</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveKey}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save Key Securely'}
              </button>
              <button
                onClick={() => {
                  setShowKeyInput(false)
                  setPrivateKey('')
                  setError('')
                }}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        // No key configured - show setup prompt
        <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Enable Auto-Trading</p>
                <p className="text-gray-400 text-sm">Add your trading wallet key to execute strategies automatically 24/7.</p>
              </div>
            </div>
            <button
              onClick={() => setShowKeyInput(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Setup Now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Main Strategies Page Component
// ============================================

interface StrategyWithAnalytics extends Strategy {
  pnl?: string
  pnlColor?: string
  totalTrades?: number
  winRate?: string
  lastUpdated?: string
  type?: string
}

const LiveTradingContent = function() {
  const router = useRouter()
  const { walletAddress: address } = useWallet()
  
  // Use the hook with user's address if connected, otherwise fetch all
  const { 
    strategies: rawStrategies, 
    loading, 
    error, 
    refetch, 
    toggleActive, 
    deleteStrategy: deleteStrategyHook 
  } = useStrategies({ 
    userAddress: address || undefined,
    autoFetch: true 
  })

  // Store strategies with analytics
  const [strategies, setStrategies] = useState<StrategyWithAnalytics[]>([])

  // Fetch analytics for each strategy
  useEffect(() => {
    const fetchAnalyticsForStrategies = async () => {
      const strategiesWithAnalytics = await Promise.all(
        rawStrategies.map(async (strategy) => {
          try {
            const analyticsResult = await fetchStrategyAnalytics(strategy.id!)
            const analytics = analyticsResult.data
            
            const pnl = analytics?.totalPnl || 0
            const pnlFormatted = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`
            const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400'
            
            // Determine "type" from indicators
            const hasIndicators = strategy.indicators && strategy.indicators.length > 0
            const type = hasIndicators ? 'Technical' : 'Custom'
            
            // Format last updated
            const updatedAt = strategy.updatedAt ? new Date(strategy.updatedAt) : new Date()
            const now = new Date()
            const diffMs = now.getTime() - updatedAt.getTime()
            const diffMins = Math.floor(diffMs / 60000)
            const diffHours = Math.floor(diffMins / 60)
            const diffDays = Math.floor(diffHours / 24)
            
            let lastUpdated = 'just now'
            if (diffDays > 0) {
              lastUpdated = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
            } else if (diffHours > 0) {
              lastUpdated = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
            } else if (diffMins > 0) {
              lastUpdated = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
            }
            
            return {
              ...strategy,
              pnl: pnlFormatted,
              pnlColor,
              totalTrades: analytics?.totalTrades || 0,
              winRate: analytics ? `${analytics.winRate.toFixed(0)}%` : '0%',
              lastUpdated,
              type,
            }
          } catch {
            return {
              ...strategy,
              pnl: '$0.00',
              pnlColor: 'text-gray-400',
              totalTrades: 0,
              winRate: '0%',
              lastUpdated: 'unknown',
              type: 'Custom',
            }
          }
        })
      )
      setStrategies(strategiesWithAnalytics)
    }

    if (rawStrategies.length > 0) {
      fetchAnalyticsForStrategies()
    } else {
      setStrategies([])
    }
  }, [rawStrategies])

  const handleToggleStrategy = async (id: string) => {
    const result = await toggleActive(id)
    if (result) {
      // Update local state with new isActive value
    setStrategies((prev) =>
      prev.map((strategy) =>
        strategy.id === id
            ? { ...strategy, isActive: result.isActive }
          : strategy
      )
    )
    }
  }

  const handleStrategyClick = (id: string) => {
    router.push(`/strategies/${id}`)
  }

  const handleCreateNew = () => {
    router.push('/strategies/new')
  }

  const handleCreateKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    handleCreateNew()
  }

  const handleDelete = async (id: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    
    if (!confirm('Are you sure you want to delete this strategy?')) {
      return
    }
    
    const deleted = await deleteStrategyHook(id)
    if (deleted) {
      setStrategies((prev) => prev.filter((s) => s.id !== id))
    }
  }

  const handleClone = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    // Navigate to new strategy with clone parameter
    router.push(`/strategies/new?clone=${id}`)
  }

  const handleEdit = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    router.push(`/strategies/${id}/edit`)
  }

  const sortedStrategies = [...strategies].sort((a, b) => {
    if (a.isActive === b.isActive) return 0
    return a.isActive ? -1 : 1
  })

  return (
    <div className="bg-dark-bg text-white flex-1">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">Strategies</h1>
          <div className="flex gap-3">
            <button
              type="button"
              tabIndex={0}
              aria-label="Backtest strategies"
              onClick={() => router.push('/strategies/backtest')}
              className="w-full sm:w-auto rounded bg-gold-primary px-4 py-2 text-center text-sm font-medium text-white transition-colors duration-200 hover:bg-gold-dark focus:outline-none flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Backtest
            </button>
          <button
            type="button"
            tabIndex={0}
            aria-label="Create new strategy"
            onClick={handleCreateNew}
            onKeyDown={handleCreateKeyDown}
            className="w-full sm:w-auto rounded bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors duration-200 hover:bg-blue-700 focus:outline-none"
          >
            New strategy
          </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Auto-Trading Setup - only show when wallet connected */}
        {address && <AutoTradingSetup userAddress={address} />}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="text-left py-3 px-4 font-medium w-16">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Strategy Name</th>
                  <th className="text-left py-3 px-4 font-medium">Type</th>
                  <th className="text-right py-3 px-4 font-medium">PnL</th>
                  <th className="text-right py-3 px-4 font-medium">Total Trades</th>
                  <th className="text-right py-3 px-4 font-medium">Win Rate</th>
                  <th className="text-right py-3 px-4 font-medium">Last Updated</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-primary mx-auto mb-4" />
                    <p className="text-gray-400 text-sm">Loading strategies...</p>
                  </td>
                </tr>
              ) : sortedStrategies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <p className="text-gray-500 text-sm">No strategies yet</p>
                  </td>
                </tr>
              ) : (
                sortedStrategies.map((strategy, index) => (
                <tr
                  key={strategy.id || `strategy-${index}`}
                  onClick={() => strategy.id && handleStrategyClick(strategy.id)}
                  className={`border-b border-gray-800 hover:bg-gray-900/30 cursor-pointer ${
                    !strategy.isActive ? 'opacity-70' : ''
                  }`}
                >
                      <td className="py-3 px-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (strategy.id) handleToggleStrategy(strategy.id)
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-black ${
                            strategy.isActive ? 'bg-gold-primary' : 'bg-gray-600'
                          }`}
                          aria-label={`Toggle ${strategy.name}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              strategy.isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="py-3 px-4 text-white font-medium">{strategy.name}</td>
                      <td className="py-3 px-4 text-gray-400">{strategy.type}</td>
                      <td className={`py-3 px-4 text-right ${strategy.pnlColor}`}>
                        {strategy.pnl}
                      </td>
                      <td className="py-3 px-4 text-right text-white">
                        {strategy.totalTrades}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-400">
                        {strategy.winRate}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-400">
                        {strategy.lastUpdated}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => strategy.id && handleEdit(strategy.id, e)}
                            className="p-1.5 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-black rounded"
                            aria-label={`Edit ${strategy.name}`}
                            tabIndex={0}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => strategy.id && handleClone(strategy.id, e)}
                            className="p-1.5 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-black rounded"
                            aria-label={`Clone ${strategy.name}`}
                            tabIndex={0}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => strategy.id && handleDelete(strategy.id, e)}
                            className="p-1.5 text-gray-400 hover:text-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-black rounded"
                            aria-label={`Delete ${strategy.name}`}
                            tabIndex={0}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  )
}

// ============================================
// Mode Selector Component
// ============================================

type TradingMode = 'select' | 'live' | 'paper'

export default function StrategiesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [mode, setMode] = useState<TradingMode>('select')
  const [showPlanModal, setShowPlanModal] = useState(false)
  
  // Check if user has pro plan
  const hasProPlan = user?.plan_tier === 'pro'
  
  // If user doesn't have pro plan, show upgrade message
  if (!hasProPlan) {
    return (
      <div className="bg-dark-bg text-white flex-1 min-h-screen">
        <div className="px-4 sm:px-6 py-12 sm:py-16 max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-gold-primary/20 to-gold-dark/20 flex items-center justify-center border-2 border-gold-primary/30">
                <svg 
                  className="w-10 h-10 sm:w-12 sm:h-12 text-gold-primary" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={1.5} 
                    d="M13 10V3L4 14h7v7l9-11h-7z" 
                  />
                </svg>
              </div>
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-gold-primary to-gold-hover bg-clip-text text-transparent">
              Automated Trading Strategies
            </h1>
            
            <p className="text-xl sm:text-2xl text-gray-300 mb-2 font-medium">
              Trade 24/7 Without Being Online
            </p>
            
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
              Create custom trading bots that automatically execute trades on Polymarket based on TradingView signals, technical indicators, and your custom rules.
            </p>
          </div>

          {/* What You Get Section */}
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 text-center">
              What You're Getting
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Feature 1 */}
              <div className="bg-dark-bg/50 border border-gray-800 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gold-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-2">TradingView Integration</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Connect TradingView indicators (RSI, MACD, Moving Averages, etc.) to automatically trigger trades when your conditions are met. No coding required.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="bg-dark-bg/50 border border-gray-800 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gold-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-2">24/7 Automated Execution</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Your strategies run continuously, even when you're asleep. Never miss a trading opportunity on BTC, ETH, SOL, or XRP markets.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="bg-dark-bg/50 border border-gray-800 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gold-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-2">Risk Management Controls</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Set stop-loss, take-profit, position limits, daily loss caps, and trading schedules. Full control over your automated trading.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="bg-dark-bg/50 border border-gray-800 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gold-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-2">Backtesting & Analytics</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Test your strategies on historical data before going live. Track performance, win rate, P&L, and optimize your strategies.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-12 bg-gray-900/30 border border-gray-800 rounded-lg p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">
              Real Examples of What You Can Build:
            </h2>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base"><strong className="text-white">RSI Strategy:</strong> Automatically buy when RSI drops below 30 and sell when it rises above 70 on BTC markets</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base"><strong className="text-white">Moving Average Crossover:</strong> Buy when 50-day MA crosses above 200-day MA, sell on reverse crossover</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base"><strong className="text-white">Time-Based Trading:</strong> Only trade during market hours (9 AM - 10 PM), pause on weekends</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm sm:text-base"><strong className="text-white">Multi-Asset Strategy:</strong> Monitor BTC, ETH, SOL, and XRP simultaneously with different rules for each</span>
              </li>
            </ul>
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <div className="mb-6">
              <p className="text-gray-300 text-lg sm:text-xl mb-2 font-medium">
                Start Building Your First Strategy
              </p>
              <p className="text-gray-400 text-sm sm:text-base">
                Upgrade to Pro for $49/month and unlock unlimited automated trading strategies
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => setShowPlanModal(true)}
                className="px-8 py-4 bg-gold-primary hover:bg-gold-hover text-white rounded-lg font-semibold text-base transition-all duration-200 inline-flex items-center gap-2 transform hover:scale-105 shadow-lg shadow-gold-primary/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Upgrade to Pro - $49/month
              </button>
              <button
                onClick={() => router.push('/terminal')}
                className="px-6 py-4 bg-dark-bg/60 border border-gray-800 hover:border-gray-700 text-white rounded-lg font-medium transition-colors duration-200 inline-flex items-center gap-2"
              >
                Continue Manual Trading
              </button>
            </div>
          </div>
        </div>
        
        {/* Plan Selection Modal */}
        <PlanSelectionModal
          isOpen={showPlanModal}
          onClose={() => setShowPlanModal(false)}
        />
      </div>
    )
  }

  const handleLiveTrading = () => {
    setMode('live')
  }

  const handlePaperTesting = () => {
    router.push('/strategies/backtest')
  }

  const handleBackToSelect = () => {
    setMode('select')
  }

  const handleLiveTradingKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    handleLiveTrading()
  }

  const handlePaperTestingKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    handlePaperTesting()
  }

  // Show mode selector initially
  if (mode === 'select') {
    return (
      <div className="bg-dark-bg text-white flex-1 flex items-center justify-center">
        <div className="px-4 sm:px-6 py-12 sm:py-16 max-w-2xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-gold-primary to-gold-hover bg-clip-text text-transparent leading-[1.15] pb-2">
            Trading Strategies
          </h1>

          {/* Subheading */}
          <p className="text-xl sm:text-2xl text-gray-300 mb-10 font-medium leading-relaxed">
            Select your trading mode to begin automating your strategies professionally
          </p>

          {/* Mode Selection Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            {/* Live Trading Button */}
            <button
              type="button"
              tabIndex={0}
              aria-label="Live Trading - Execute strategies with real funds"
              onClick={handleLiveTrading}
              onKeyDown={handleLiveTradingKeyDown}
              className="group relative p-8 bg-dark-bg/60 border-2 border-gray-800 hover:border-gold-primary rounded-lg transition-all duration-200 hover:bg-dark-bg/80 focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-dark-bg"
            >
              <div className="w-16 h-16 bg-gold-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-gold-primary/30 transition-colors">
                <svg className="w-8 h-8 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-2 text-lg">Live Trading</h3>
              <p className="text-gray-400 text-sm">
                Execute strategies with real funds on Polymarket
              </p>
            </button>

            {/* Paper Testing Button */}
            <button
              type="button"
              tabIndex={0}
              aria-label="Paper Testing - Test strategies without real funds"
              onClick={handlePaperTesting}
              onKeyDown={handlePaperTestingKeyDown}
              className="group relative p-8 bg-dark-bg/60 border-2 border-gray-800 hover:border-gold-primary rounded-lg transition-all duration-200 hover:bg-dark-bg/80 focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-dark-bg"
            >
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/30 transition-colors">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-2 text-lg">Paper Testing</h3>
              <p className="text-gray-400 text-sm">
                Test strategies without real funds using historical data
              </p>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show live trading content
  if (mode === 'live') {
    return (
      <div>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-800">
          <button
            type="button"
            tabIndex={0}
            aria-label="Back to mode selection"
            onClick={handleBackToSelect}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 focus:ring-offset-dark-bg rounded px-2 py-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Selection
          </button>
        </div>
        <LiveTradingContent />
      </div>
    )
  }

  return null
}

// ============================================
// Coming Soon Page - Commented out for future use
// ============================================
// Uncomment below to restore the "Coming Soon" page
// ============================================

/*
import Link from 'next/link'

const ComingSoonPage = function() {
  return (
    <div className="bg-dark-bg text-white min-h-screen flex items-center justify-center">
      <div className="px-4 sm:px-6 py-12 sm:py-16 max-w-2xl mx-auto text-center">
        {/* Icon/Illustration *\/}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-gold-primary/20 to-gold-dark/20 flex items-center justify-center border-2 border-gold-primary/30">
              <svg 
                className="w-12 h-12 sm:w-16 sm:h-16 text-gold-primary" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={1.5} 
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
                />
              </svg>
            </div>
            {/* Animated pulse ring *\/}
            <div className="absolute inset-0 rounded-full bg-gold-primary/20 animate-ping opacity-75"></div>
          </div>
        </div>

        {/* Heading *\/}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-gold-primary to-gold-hover bg-clip-text text-transparent">
          Coming Soon
        </h1>

        {/* Subheading *\/}
        <p className="text-xl sm:text-2xl text-gray-300 mb-6 font-medium">
          Automated Trading Strategies
        </p>

        {/* Description *\/}
        <p className="text-gray-400 text-base sm:text-lg mb-10 max-w-lg mx-auto leading-relaxed">
          We&apos;re building powerful automated trading strategies that will help you trade smarter, faster, and more efficiently. 
          Stay tuned for the launch.
        </p>

        {/* Feature Preview *\/}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-dark-bg/60 border border-gray-800 rounded-lg p-5">
            <div className="w-10 h-10 bg-gold-primary/20 rounded-lg flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2 text-sm">Auto-Execute</h3>
            <p className="text-gray-400 text-xs">24/7 automated trading</p>
          </div>

          <div className="bg-dark-bg/60 border border-gray-800 rounded-lg p-5">
            <div className="w-10 h-10 bg-gold-primary/20 rounded-lg flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2 text-sm">Advanced Analytics</h3>
            <p className="text-gray-400 text-xs">Track performance metrics</p>
          </div>

          <div className="bg-dark-bg/60 border border-gray-800 rounded-lg p-5">
            <div className="w-10 h-10 bg-gold-primary/20 rounded-lg flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h3 className="text-white font-semibold mb-2 text-sm">Customizable</h3>
            <p className="text-gray-400 text-xs">Build your own strategies</p>
          </div>
        </div>

        {/* CTA Button *\/}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/terminal"
            className="px-6 py-3 bg-gold-primary hover:bg-gold-hover text-white rounded-lg font-medium transition-colors duration-200 inline-flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            Go to Terminal
          </Link>
          <Link
            href="/analytics"
            className="px-6 py-3 bg-dark-bg/60 border border-gray-800 hover:border-gray-700 text-white rounded-lg font-medium transition-colors duration-200 inline-flex items-center gap-2"
          >
            View Analytics
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </Link>
          </div>
      </div>
    </div>
  )
}
*/
