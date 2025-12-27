'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabType = 'deposit' | 'withdraw'

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC.e (Bridged) - Polymarket uses this specific contract

export default function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const { user, custodialWallet, refreshCustodialWallet } = useAuth()
  const { showToast } = useToast()
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedUsdce, setCopiedUsdce] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('deposit')
  
  // Withdraw state
  const [withdrawTokenType, setWithdrawTokenType] = useState<'USDC' | 'POL'>('USDC')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Use cached data from context, or fallback to null
  const walletAddress = custodialWallet?.walletAddress || null
  // Also fetch fresh balance from blockchain API for accurate display
  const [freshBalance, setFreshBalance] = useState<{ usdc: number; pol: number } | null>(null)
  
  const usdcBalance = freshBalance?.usdc ?? (custodialWallet ? parseFloat(custodialWallet.usdcBalance) : 0)
  const polBalance = freshBalance?.pol ?? (custodialWallet ? parseFloat(custodialWallet.polBalance) : 0)
  const needsPol = polBalance < 0.01

  const fetchWalletAndBalances = useCallback(async (syncFromBlockchain = false) => {
    if (!user) return

    setIsLoading(true)
    try {
      await refreshCustodialWallet(syncFromBlockchain)
    } catch (error) {
      console.error('Failed to fetch wallet/balances:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user, refreshCustodialWallet])

  // Fetch fresh balance from blockchain when modal opens
  useEffect(() => {
    if (isOpen && user && walletAddress) {
      // Always sync from blockchain when modal opens to get the most up-to-date balance
      // This ensures deposits are immediately visible
      refreshCustodialWallet(true).catch(console.error)
      
      // Also fetch from the balance API endpoint (always fetches from blockchain)
      fetch(`/api/user/balance?address=${walletAddress}`)
        .then(res => res.json())
        .then(data => {
          if (data.cashBalance !== undefined) {
            setFreshBalance({
              usdc: data.cashBalance || 0,
              pol: data.breakdown?.polBalance || 0,
            })
          }
        })
        .catch(err => {
          console.error('Failed to fetch fresh balance:', err)
        })
    } else if (!isOpen) {
      // Clear fresh balance when modal closes
      setFreshBalance(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user, walletAddress])

  // Reset withdraw form when switching tabs
  useEffect(() => {
    if (activeTab === 'deposit') {
      setWithdrawAmount('')
      setWithdrawAddress('')
    }
  }, [activeTab])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleCopyAddress = async () => {
    if (!walletAddress) return
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopiedAddress(true)
      showToast('Address copied to clipboard', 'success')
      setTimeout(() => setCopiedAddress(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleCopyUsdce = async () => {
    try {
      await navigator.clipboard.writeText(USDC_E_ADDRESS)
      setCopiedUsdce(true)
      showToast('USDC.e contract address copied', 'success')
      setTimeout(() => setCopiedUsdce(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || !withdrawAddress) {
      showToast('Please fill in all fields', 'error')
      return
    }

    const amountNum = parseFloat(withdrawAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('Please enter a valid amount', 'error')
      return
    }

    const availableBalance = withdrawTokenType === 'USDC' ? usdcBalance : polBalance
    if (amountNum > availableBalance) {
      showToast(`Insufficient ${withdrawTokenType} balance`, 'error')
      return
    }

    // Validate address format
    try {
      if (!withdrawAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        showToast('Invalid recipient address format', 'error')
        return
      }
    } catch {
      showToast('Invalid recipient address format', 'error')
      return
    }

    setIsWithdrawing(true)
    try {
      const response = await fetch('/api/user/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenType: withdrawTokenType,
          amount: amountNum,
          recipientAddress: withdrawAddress,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Withdrawal failed')
      }

      showToast(`Successfully withdrew ${amountNum} ${withdrawTokenType}`, 'success')
      
      // Refresh balances immediately after successful withdrawal
      // Wait a moment for blockchain to update, then refresh
      setTimeout(async () => {
        // Refresh AuthContext balances
      await refreshCustodialWallet(true)
        
        // Refresh fresh balance in modal
        if (walletAddress) {
          try {
            const res = await fetch(`/api/user/balance?address=${walletAddress}`)
            const data = await res.json()
            if (data.cashBalance !== undefined) {
              setFreshBalance({
                usdc: data.cashBalance || 0,
                pol: data.breakdown?.polBalance || 0,
              })
            }
          } catch (err) {
            console.error('Failed to refresh balance after withdrawal:', err)
          }
        }
        
        // Trigger header balance refresh by dispatching a custom event
        window.dispatchEvent(new CustomEvent('refreshBalances'))
      }, 2000) // Wait 2 seconds for transaction to be confirmed on blockchain
      
      // Reset form
      setWithdrawAmount('')
      setWithdrawAddress('')
      
      // Optionally switch to deposit tab
      // setActiveTab('deposit')
    } catch (error: any) {
      console.error('Withdrawal error:', error)
      showToast(error.message || 'Failed to process withdrawal', 'error')
    } finally {
      setIsWithdrawing(false)
    }
  }

  const handleMaxAmount = () => {
    const availableBalance = withdrawTokenType === 'USDC' ? usdcBalance : polBalance
    // For POL, leave a small amount for gas (0.01 POL)
    const maxAmount = withdrawTokenType === 'POL' 
      ? Math.max(0, availableBalance - 0.01)
      : availableBalance
    setWithdrawAmount(maxAmount > 0 ? maxAmount.toString() : '0')
  }

  if (!isOpen || !mounted) return null

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="bg-dark-bg border border-gray-700/30 rounded-xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/70"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-700/30">
          <div>
            <h2 className="text-2xl font-bold text-white">Wallet</h2>
            <p className="text-sm text-gray-400 mt-1">Manage your custodial wallet funds</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800/50 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700/30">
          <button
            onClick={() => setActiveTab('deposit')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'deposit'
                ? 'text-gold-primary border-b-2 border-gold-primary bg-dark-bg/30'
                : 'text-gray-400 hover:text-gray-300 hover:bg-dark-bg/20'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'withdraw'
                ? 'text-gold-primary border-b-2 border-gold-primary bg-dark-bg/30'
                : 'text-gray-400 hover:text-gray-300 hover:bg-dark-bg/20'
            }`}
          >
            Withdraw
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!user ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">Please log in to manage your wallet</p>
            </div>
          ) : !walletAddress ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800/50 flex items-center justify-center">
                <svg className={`w-6 h-6 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">Loading wallet...</p>
            </div>
          ) : activeTab === 'deposit' ? (
            <div className="space-y-4">
              {/* Balance Summary */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-dark-bg/50 border border-gray-700/50">
                <div className="flex items-center gap-4">
                <div>
                    <p className="text-xs text-gray-400 mb-0.5">USDC.e</p>
                    <p className="text-xl font-bold text-white">
                    {isLoading ? '...' : `$${usdcBalance.toFixed(2)}`}
                  </p>
                  </div>
                  <div className="h-8 w-px bg-gray-700/50" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">POL</p>
                    <p className={`text-xl font-bold ${needsPol ? 'text-amber-400' : 'text-white'}`}>
                      {polBalance.toFixed(4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => fetchWalletAndBalances(true)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  title="Sync balances from blockchain"
                >
                  <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Sync</span>
                </button>
              </div>

              {needsPol && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-dark-bg/50 border border-gray-600/50">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-xs text-amber-400">
                    Low POL balance — send ~0.1 POL for gas fees
                  </p>
                </div>
              )}

              {/* Deposit Address */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Deposit Address
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2.5 rounded-lg bg-dark-bg/50 border border-gray-700/50 text-sm text-gray-300 break-all">
                    {walletAddress}
                  </div>
                  <button
                    onClick={handleCopyAddress}
                    className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                      copiedAddress
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                    }`}
                  >
                    {copiedAddress ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* USDC.e Contract Info */}
              <div className="p-3 rounded-lg bg-dark-bg/50 border border-gray-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-gray-400">Use <span className="text-gold-primary">USDC.e</span> (bridged), not regular USDC</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-2 py-1.5 rounded bg-dark-bg border border-gray-800/60 text-sm text-gray-400 break-all">
                    {USDC_E_ADDRESS}
                  </div>
              <button
                    onClick={handleCopyUsdce}
                    className={`px-2 py-1.5 rounded text-sm font-medium transition-all flex-shrink-0 ${
                      copiedUsdce
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                    }`}
                  >
                    {copiedUsdce ? '✓' : 'Copy'}
              </button>
                </div>
                    </div>
                    </div>
          ) : (
            // Withdraw Tab
            <div className="space-y-4">
              {/* Balance Summary */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-dark-bg/50 border border-gray-700/50">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">USDC.e</p>
                    <p className="text-xl font-bold text-white">
                      {isLoading ? '...' : `$${usdcBalance.toFixed(2)}`}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-gray-700/50" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">POL</p>
                    <p className={`text-xl font-bold ${needsPol ? 'text-amber-400' : 'text-white'}`}>
                      {polBalance.toFixed(4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setIsLoading(true)
                    try {
                      await refreshCustodialWallet(true)
                      if (walletAddress) {
                        const res = await fetch(`/api/user/balance?address=${walletAddress}`)
                        const data = await res.json()
                        if (data.cashBalance !== undefined) {
                          setFreshBalance({
                            usdc: data.cashBalance || 0,
                            pol: data.breakdown?.polBalance || 0,
                          })
                        }
                      }
                    } catch (err) {
                      console.error('Failed to sync:', err)
                    } finally {
                      setIsLoading(false)
                    }
                  }}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  title="Sync balances from blockchain"
                >
                  <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  <span>Sync</span>
                </button>
                    </div>

              {/* Token Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Token
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setWithdrawTokenType('USDC')
                      setWithdrawAmount('')
                    }}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      withdrawTokenType === 'USDC'
                        ? 'bg-gold-primary/20 border-2 border-gold-primary text-gold-primary'
                        : 'bg-dark-bg/50 border-2 border-gray-700/50 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    USDC.e
                  </button>
                  <button
                    onClick={() => {
                      setWithdrawTokenType('POL')
                      setWithdrawAmount('')
                    }}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      withdrawTokenType === 'POL'
                        ? 'bg-gold-primary/20 border-2 border-gold-primary text-gold-primary'
                        : 'bg-dark-bg/50 border-2 border-gray-700/50 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    POL
                  </button>
                    </div>
                  </div>

              {/* Amount Input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Amount
                  </label>
                      <button
                    onClick={handleMaxAmount}
                    className="text-xs text-gold-primary hover:text-gold-hover transition-colors"
                      >
                    Max
                      </button>
                    </div>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-lg bg-dark-bg/50 border border-gray-700/50 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary/50 focus:border-gold-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {withdrawTokenType}
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Available: {withdrawTokenType === 'USDC' ? `$${usdcBalance.toFixed(2)}` : `${polBalance.toFixed(4)} POL`}
                </p>
              </div>

              {/* Recipient Address */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2.5 rounded-lg bg-dark-bg/50 border border-gray-700/50 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary/50 focus:border-gold-primary"
                />
              </div>

              {/* Info Note */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-dark-bg/50 border border-gray-700/50">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-400">
                  Withdrawals are processed on Polygon network. Gas fees are deducted from your POL balance.
                </p>
              </div>

              {/* Withdraw Button */}
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawing || !withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount) <= 0}
                className={`w-full px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                  isWithdrawing || !withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount) <= 0
                    ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
                    : 'bg-gold-primary hover:bg-gold-hover text-white shadow-lg shadow-gold-primary/20 hover:shadow-gold-primary/30'
                }`}
              >
                {isWithdrawing && (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {isWithdrawing ? 'Processing...' : `Withdraw ${withdrawTokenType}`}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700/30">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-800/50 hover:bg-gray-700/50 text-white font-medium rounded-lg transition-all duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
