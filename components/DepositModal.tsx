'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '@/contexts/WalletContext'

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
}

interface BalanceBreakdown {
  nativeUsdc: number
  bridgedUsdc: number
  polBalance: number
  polymarketPositions: number
}

interface BalanceData {
  portfolioValue: number
  cashBalance: number
  positionsValue: number
  breakdown: BalanceBreakdown
  lastUpdated: string
}

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

export default function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const { walletAddress, isConnected } = useWallet()
  const [mounted, setMounted] = useState(false)
  const [balances, setBalances] = useState<BalanceData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedUsdce, setCopiedUsdce] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/user/balance?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        setBalances(data)
      }
    } catch (error) {
      console.error('Failed to fetch balances:', error)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  useEffect(() => {
    if (isOpen && walletAddress) {
      fetchBalances()
    }
  }, [isOpen, walletAddress, fetchBalances])

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
      setTimeout(() => setCopiedAddress(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleCopyUsdce = async () => {
    try {
      await navigator.clipboard.writeText(USDC_E_ADDRESS)
      setCopiedUsdce(true)
      setTimeout(() => setCopiedUsdce(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const totalUsdc = (balances?.breakdown?.nativeUsdc || 0) + (balances?.breakdown?.bridgedUsdc || 0)
  const polBalance = balances?.breakdown?.polBalance || 0
  const needsPol = polBalance < 0.01

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
        className="bg-[#0d0d0d] border border-gray-800/60 rounded-xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60">
          <h2 className="text-lg font-semibold text-white">Deposit</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {!isConnected ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">Connect wallet to continue</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Balance Summary */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-purple-900/20 to-transparent border border-purple-800/30">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">USDC.e Balance</p>
                  <p className="text-2xl font-bold text-white">
                    {isLoading ? '...' : `$${totalUsdc.toFixed(2)}`}
                  </p>
                </div>
                <button
                  onClick={fetchBalances}
                  disabled={isLoading}
                  className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Refresh balances"
                >
                  <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* USDC.e Note */}
              <div className="px-3 py-2.5 rounded-lg bg-blue-950/30 border border-blue-800/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-blue-200/80">
                    Use <strong>USDC.e</strong> (Bridged USDC) — not regular USDC
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-2 py-1.5 rounded bg-black/40 font-mono text-[11px] text-blue-300/90 truncate">
                    {USDC_E_ADDRESS}
                  </div>
                  <button
                    onClick={handleCopyUsdce}
                    className={`px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
                      copiedUsdce
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-800/50 text-blue-200 hover:bg-blue-700/50'
                    }`}
                  >
                    {copiedUsdce ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Status Indicators */}
              <div className="flex gap-3">
                <div className={`flex-1 px-3 py-2.5 rounded-lg border ${
                  needsPol ? 'bg-amber-950/30 border-amber-700/40' : 'bg-gray-900/50 border-gray-800/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">POL (Gas)</span>
                    {needsPol && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                  </div>
                  <p className={`text-sm font-medium mt-0.5 ${needsPol ? 'text-amber-400' : 'text-white'}`}>
                    {polBalance.toFixed(4)}
                  </p>
                </div>
                <div className="flex-1 px-3 py-2.5 rounded-lg bg-gray-900/50 border border-gray-800/60">
                  <span className="text-xs text-gray-400">In Positions</span>
                  <p className="text-sm font-medium text-white mt-0.5">
                    ${balances?.breakdown?.polymarketPositions?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>

              {/* POL Warning */}
              {needsPol && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/20 border border-amber-800/30">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-xs text-amber-200/80">
                    Need POL for gas fees — send ~0.1 POL to enable transactions
                  </p>
                </div>
              )}

              {/* Deposit Address */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">Your Polygon Address</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2.5 rounded-lg bg-black/50 border border-gray-800/60 font-mono text-xs text-gray-300 truncate">
                    {walletAddress}
                  </div>
                  <button
                    onClick={handleCopyAddress}
                    className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      copiedAddress
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {copiedAddress ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Help Toggle */}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span>Need help? What do I need to trade?</span>
                <svg className={`w-4 h-4 transition-transform ${showHelp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Help Content */}
              {showHelp && (
                <div className="space-y-2.5 pt-2 border-t border-gray-800/60">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm text-white">USDC.e</span>
                      <span className="text-xs text-gray-500 ml-2">Bridged · for trading</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm text-white">POL</span>
                      <span className="text-xs text-gray-500 ml-2">~$0.10 · for gas fees</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm text-gray-500">Regular USDC</span>
                      <span className="text-xs text-gray-600 ml-2">won't work</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-gray-500 font-mono flex-1 truncate">{USDC_E_ADDRESS}</span>
                    <button
                      onClick={handleCopyUsdce}
                      className="text-[10px] text-gray-500 hover:text-white transition-colors"
                    >
                      {copiedUsdce ? '✓' : 'copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800/60">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
