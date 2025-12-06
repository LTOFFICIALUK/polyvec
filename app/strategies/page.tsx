'use client'

import { useState, useEffect, KeyboardEvent, MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useStrategies, Strategy, fetchStrategyAnalytics } from '@/hooks/useStrategies'
import { useWallet } from '@/contexts/WalletContext'

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

const WS_SERVICE_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8081'

function AutoTradingSetup({ userAddress }: { userAddress: string }) {
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

  // Service not available
  if (status === null) {
    return null
  }

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

      {status.hasKey ? (
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
                className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
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
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg text-sm font-medium transition-colors"
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
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
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
// Main Strategies Page
// ============================================

interface StrategyWithAnalytics extends Strategy {
  pnl?: string
  pnlColor?: string
  totalTrades?: number
  winRate?: string
  lastUpdated?: string
  type?: string
}

export default function StrategiesPage() {
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
    <div className="bg-black text-white min-h-screen">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">Strategies</h1>
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
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-primary mx-auto mb-4" />
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
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-primary focus:ring-offset-2 focus:ring-offset-black ${
                            strategy.isActive ? 'bg-purple-primary' : 'bg-gray-600'
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
                            className="p-1.5 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-purple-primary focus:ring-offset-2 focus:ring-offset-black rounded"
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
                            className="p-1.5 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-purple-primary focus:ring-offset-2 focus:ring-offset-black rounded"
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
                            className="p-1.5 text-gray-400 hover:text-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-primary focus:ring-offset-2 focus:ring-offset-black rounded"
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
