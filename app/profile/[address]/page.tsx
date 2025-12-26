'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useWallet } from '@/contexts/WalletContext'
import { usePlanModal } from '@/contexts/PlanModalContext'
import EditProfileModal from '@/components/EditProfileModal'

interface BalanceData {
  portfolioValue: number
  cashBalance: number
  positionsValue: number
  lastUpdated: string
}

interface Position {
  asset: string
  conditionId: string
  size: number
  avgPrice: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  title: string
  outcome: string
  curPrice: number
}

interface ClosedPosition {
  conditionId: string
  avgPrice: number
  totalBought: number
  realizedPnl: number
  timestamp: number
  title: string
  outcome: string
}

interface Trade {
  id: string
  market: string
  side: 'BUY' | 'SELL'
  size: string
  price: string
  match_time: string
  outcome: string
  title: string
}

interface ProfileStats {
  totalTrades: number
  winRate: number
  totalPnL: number
  portfolioValue: number
  cashBalance: number
  positionsValue: number
  activePositions: number
  closedPositions: number
  totalWins: number
  totalLosses: number
  avgTradeSize: number
  bestTrade: number
  worstTrade: number
  avgProfit: number
  avgLoss: number
  wlRatio: number
  totalVolume: number
  profitFactor: number
}

export default function ProfilePage() {
  const params = useParams()
  const address = params.address as string
  const { walletAddress } = useWallet()
  const { openModal: openPlanModal } = usePlanModal()
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [profileData, setProfileData] = useState<{
    username: string | null
    profilePictureUrl: string | null
  } | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  const isOwnProfile = walletAddress?.toLowerCase() === address?.toLowerCase()

  useEffect(() => {
    if (!address) return
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch all data in parallel
        const [balanceRes, positionsRes, closedRes, tradesRes, profileRes] = await Promise.all([
          fetch(`/api/user/balance?address=${address}`),
          fetch(`/api/user/positions?address=${address}`),
          fetch(`/api/user/closed-positions?address=${address}&limit=100`),
          fetch(`/api/user/trades?address=${address}&limit=500`),
          fetch(`/api/profile/${address}`),
        ])

        if (balanceRes.ok) {
          const balanceData = await balanceRes.json()
          setBalance(balanceData)
        }

        if (positionsRes.ok) {
          const positionsData = await positionsRes.json()
          setPositions(positionsData.positions || [])
        }

        if (closedRes.ok) {
          const closedData = await closedRes.json()
          setClosedPositions(closedData.positions || [])
        }

        if (tradesRes.ok) {
          const tradesData = await tradesRes.json()
          setTrades(tradesData.trades || [])
        }

        if (profileRes.ok) {
          const profileData = await profileRes.json()
          setProfileData({
            username: profileData.username || null,
            profilePictureUrl: profileData.profilePictureUrl || null,
          })
        }
      } catch (err) {
        console.error('Error fetching profile data:', err)
        setError('Failed to load profile data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [address])

  // Handle profile update

  const handleProfileUpdate = async () => {
    try {
      const response = await fetch(`/api/profile/${address}`)
      if (response.ok) {
        const data = await response.json()
        setProfileData({
          username: data.username || null,
          profilePictureUrl: data.profilePictureUrl || null,
        })
      }
    } catch (err) {
      console.error('Error refreshing profile data:', err)
    }
  }

  // Calculate comprehensive stats from real data
  const profileStats = useMemo((): ProfileStats => {
    // Win/Loss from closed positions
    const wins = closedPositions.filter((p) => p.realizedPnl > 0)
    const losses = closedPositions.filter((p) => p.realizedPnl < 0)

    const totalClosedPositions = closedPositions.length
    const winRate = totalClosedPositions > 0 
      ? (wins.length / totalClosedPositions) * 100 
      : 0

    // Total realized PnL
    const totalPnL = closedPositions.reduce((sum, p) => sum + p.realizedPnl, 0)

    // Average metrics
    const avgProfit = wins.length > 0
      ? wins.reduce((sum, p) => sum + p.realizedPnl, 0) / wins.length
      : 0

    const avgLoss = losses.length > 0
      ? losses.reduce((sum, p) => sum + p.realizedPnl, 0) / losses.length
      : 0

    // Best/worst trades
    const pnlValues = closedPositions.map((p) => p.realizedPnl)
    const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0
    const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0

    // W/L Ratio
    const wlRatio = losses.length > 0 && avgLoss !== 0
      ? Math.abs(avgProfit / avgLoss)
      : avgProfit > 0 ? Infinity : 0

    // Total volume from trades
    const totalVolume = trades.reduce((sum, t) => {
      const price = parseFloat(t.price) || 0
      const size = parseFloat(t.size) || 0
      return sum + (price * size)
    }, 0)

    // Average trade size
    const avgTradeSize = trades.length > 0 ? totalVolume / trades.length : 0

    // Profit factor
    const totalProfit = wins.reduce((sum, p) => sum + p.realizedPnl, 0)
    const totalLoss = Math.abs(losses.reduce((sum, p) => sum + p.realizedPnl, 0))
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0

    return {
      totalTrades: trades.length,
      winRate: Math.round(winRate * 10) / 10,
      totalPnL: Math.round(totalPnL * 100) / 100,
      portfolioValue: balance?.portfolioValue || 0,
      cashBalance: balance?.cashBalance || 0,
      positionsValue: balance?.positionsValue || 0,
      activePositions: positions.length,
      closedPositions: totalClosedPositions,
      totalWins: wins.length,
      totalLosses: losses.length,
      avgTradeSize: Math.round(avgTradeSize * 100) / 100,
      bestTrade: Math.round(bestTrade * 100) / 100,
      worstTrade: Math.round(worstTrade * 100) / 100,
      avgProfit: Math.round(avgProfit * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      wlRatio: wlRatio === Infinity ? 999 : Math.round(wlRatio * 100) / 100,
      totalVolume: Math.round(totalVolume * 100) / 100,
      profitFactor: profitFactor === Infinity ? 999 : Math.round(profitFactor * 100) / 100,
    }
  }, [balance, positions, closedPositions, trades])

  // Format wallet address for display
  const formatAddress = (addr: string) => {
    if (addr.length <= 10) return addr
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Copy address to clipboard
  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(true)
      setTimeout(() => setCopiedAddress(false), 2000)
    } catch (err) {
      console.error('Failed to copy address:', err)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-dark-bg text-white flex-1">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Profile</h1>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <svg className="w-12 h-12 animate-spin text-gold-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-400">Loading profile data...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!address) {
    return (
      <div className="bg-dark-bg text-white flex-1">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Profile</h1>
          <div className="text-center py-12">
            <p className="text-gray-400">Invalid address</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-bg text-white flex-1">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                {/* Profile Picture */}
                {profileData?.profilePictureUrl ? (
                  <img
                    src={profileData.profilePictureUrl}
                    alt={profileData.username || formatAddress(address)}
                    className="w-12 h-12 rounded-full object-cover border border-gray-700/50"
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.username || address.slice(0, 2))}&background=transparent&color=fff&size=128`
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gold-primary/20 flex items-center justify-center border border-gray-700/50">
                    <span className="text-gold-primary font-semibold text-lg">
                      {(profileData?.username || address).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold">
                    {profileData?.username || formatAddress(address)}
                  </h1>
                  {profileData?.username && (
                    <p className="text-sm text-gray-400 font-mono">{formatAddress(address)}</p>
                  )}
                </div>
                {isOwnProfile && (
                  <span className="px-2 py-1 bg-gold-primary/20 text-gold-primary text-xs font-medium rounded">
                    Your Profile
                  </span>
                )}
              </div>
              {!profileData?.username && (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 bg-dark-bg/40 border border-gray-700/50 rounded-lg px-4 py-2">
                    <span className="text-gray-400 text-sm">Wallet:</span>
                    <span className="text-white font-mono text-sm">{formatAddress(address)}</span>
                    <button
                      onClick={handleCopyAddress}
                      className="text-gray-400 hover:text-white transition-colors ml-2"
                      title={copiedAddress ? 'Copied!' : 'Copy full address'}
                      aria-label="Copy address"
                    >
                      {copiedAddress ? (
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
              <a
                href={`https://polygonscan.com/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-primary hover:text-gold-hover text-sm font-medium transition-colors flex items-center gap-1"
              >
                View on PolygonScan
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <div className="flex items-center gap-3">
              {isOwnProfile && (
                <>
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="px-4 py-2 bg-dark-bg/40 border border-gray-700/50 text-white rounded text-sm font-medium hover:bg-dark-bg/60 transition-colors"
                  >
                    Edit Profile
                  </button>
                  <button
                    onClick={openPlanModal}
                    className="px-4 py-2 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white rounded text-sm font-medium transition-all duration-200 transform hover:scale-105"
                  >
                    Choose Plan
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Portfolio Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Portfolio Value</div>
            <div className="text-white font-bold text-2xl">
              ${profileStats.portfolioValue.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Total value</div>
          </div>

          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Cash Balance</div>
            <div className="text-white font-bold text-2xl">
              ${profileStats.cashBalance.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">USDC available</div>
          </div>

          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Positions Value</div>
            <div className="text-white font-bold text-2xl">
              ${profileStats.positionsValue.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">{profileStats.activePositions} active</div>
          </div>

          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Total Realized PnL</div>
            <div className={`font-bold text-2xl ${profileStats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {profileStats.totalPnL >= 0 ? '+' : ''}${profileStats.totalPnL.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Trading Statistics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Total Trades</div>
            <div className="text-white font-bold text-2xl">{profileStats.totalTrades}</div>
          </div>

          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Win Rate</div>
            <div className={`font-bold text-2xl ${profileStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {profileStats.winRate}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {profileStats.totalWins}W / {profileStats.totalLosses}L
            </div>
          </div>

          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Total Volume</div>
            <div className="text-white font-bold text-2xl">
              ${profileStats.totalVolume.toFixed(2)}
            </div>
          </div>

          <div className="bg-dark-bg/40 rounded-lg p-4 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-1">Closed Positions</div>
            <div className="text-white font-bold text-2xl">{profileStats.closedPositions}</div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-dark-bg/40 rounded-lg p-6 border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Trading Activity</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Avg Trade Size</span>
                <span className="text-white font-semibold">${profileStats.avgTradeSize.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Best Trade</span>
                <span className={`font-semibold ${profileStats.bestTrade >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {profileStats.bestTrade >= 0 ? '+' : ''}${profileStats.bestTrade.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Worst Trade</span>
                <span className={`font-semibold ${profileStats.worstTrade >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {profileStats.worstTrade >= 0 ? '+' : ''}${profileStats.worstTrade.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Active Positions</span>
                <span className="text-white font-semibold">{profileStats.activePositions}</span>
              </div>
            </div>
          </div>

          <div className="bg-dark-bg/40 rounded-lg p-6 border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Performance Metrics</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">W/L Ratio</span>
                <span className="text-white font-semibold">
                  {profileStats.wlRatio === 999 ? '∞' : profileStats.wlRatio.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Avg Profit</span>
                <span className="text-green-400 font-semibold">
                  +${profileStats.avgProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Avg Loss</span>
                <span className="text-red-400 font-semibold">
                  ${profileStats.avgLoss.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Profit Factor</span>
                <span className="text-white font-semibold">
                  {profileStats.profitFactor === 999 ? '∞' : profileStats.profitFactor.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Positions */}
        {positions.length > 0 && (
          <div className="bg-dark-bg/40 rounded-lg p-6 border border-gray-700/50 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              Active Positions ({positions.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-700/50">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Market</th>
                    <th className="text-left py-3 px-4 font-medium">Outcome</th>
                    <th className="text-right py-3 px-4 font-medium">Size</th>
                    <th className="text-right py-3 px-4 font-medium">Avg Price</th>
                    <th className="text-right py-3 px-4 font-medium">Current</th>
                    <th className="text-right py-3 px-4 font-medium">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.slice(0, 10).map((position, index) => {
                    const pnl = position.cashPnl || 0
                    const pnlPercent = position.percentPnl || 0
                    const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400'

                    return (
                      <tr key={`${position.conditionId}-${index}`} className="border-b border-gray-700/50">
                        <td className="py-3 px-4">
                          <div className="max-w-xs truncate text-white" title={position.title}>
                            {position.title || 'Unknown Market'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={position.outcome === 'Yes' ? 'text-green-400' : 'text-red-400'}>
                            {position.outcome === 'Yes' ? 'UP' : position.outcome === 'No' ? 'DOWN' : '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {position.size?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '0'}
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {Math.round((position.avgPrice || 0) * 100)}¢
                        </td>
                        <td className="py-3 px-4 text-right text-white font-mono">
                          {Math.round((position.curPrice || 0) * 100)}¢
                        </td>
                        <td className={`py-3 px-4 text-right font-mono ${pnlColor}`}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          <span className="text-xs ml-1 opacity-70">
                            ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {positions.length > 10 && (
              <div className="mt-4 text-center">
                <span className="text-sm text-gray-400">
                  Showing 10 of {positions.length} positions
                </span>
              </div>
            )}
          </div>
        )}
        {isOwnProfile && (
          <EditProfileModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            walletAddress={address}
            currentUsername={profileData?.username || null}
            currentProfilePictureUrl={profileData?.profilePictureUrl || null}
            onUpdate={handleProfileUpdate}
          />
        )}
      </div>
    </div>
  )
}
