'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '@/contexts/WalletContext'
import { getBrowserProvider, ensurePolygonNetwork } from '@/lib/polymarket-auth'

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
}

declare global {
  interface Window {
    phantom?: {
      ethereum: {
        request: (args: { method: string; params?: any[] }) => Promise<any>
        isPhantom?: boolean
      }
    }
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>
      isPhantom?: boolean
      providers?: any[]
      isMetaMask?: boolean
    }
  }
}

export default function ConnectWalletModal({ isOpen, onClose }: ConnectWalletModalProps) {
  const { connectWallet } = useWallet()
  const [showHelp, setShowHelp] = useState(false)
  const [error, setError] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleConnectWallet = async () => {
    setError('')
    setIsConnecting(true)

    try {
      const provider = getBrowserProvider()
      if (!provider) {
        setError('No wallet found. Please install MetaMask or Phantom.')
        setIsConnecting(false)
        return
      }

      const accounts = await provider.send('eth_requestAccounts', [])

      if (!accounts || accounts.length === 0) {
        setError('No accounts found. Please unlock your wallet.')
        setIsConnecting(false)
        return
      }

      await ensurePolygonNetwork(provider)

      const address = accounts[0]
      connectWallet(address)
      onClose()
    } catch (err: any) {
      console.error('Wallet connection error:', err)
      if (err.code === 4001) {
        setError('Connection rejected. Please approve in your wallet.')
      } else if (err.message?.includes('network')) {
        setError('Please approve the network switch to Polygon.')
      } else {
        setError('Connection failed. Please try again.')
      }
    } finally {
      setIsConnecting(false)
    }
  }

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

  if (!isOpen || !mounted) return null

  const hasMetaMask = typeof window !== 'undefined' && window.ethereum?.isMetaMask
  const hasPhantom = typeof window !== 'undefined' && ((window as any).phantom?.ethereum || window.ethereum?.isPhantom)

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
        className="bg-[#0d0d0d] border border-gray-800/60 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60">
          <h2 className="text-lg font-semibold text-white">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Quick Requirements Note */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/20 border border-blue-800/30">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-blue-200/80">
              You&apos;ll need <strong>USDC</strong> + <strong>POL</strong> (gas) on Polygon to trade
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/30">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Wallet Options */}
          <div className="space-y-2">
            {/* MetaMask */}
            <button
              onClick={handleConnectWallet}
              disabled={isConnecting || !hasMetaMask}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-800/60 hover:border-gray-700 hover:bg-gray-900/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <img src="/wallets/MetaMask-icon-fox.svg" alt="" className="w-5 h-5" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-white">MetaMask</p>
                <p className="text-xs text-gray-500">
                  {hasMetaMask ? 'Popular browser wallet' : 'Not installed'}
                </p>
              </div>
              {!hasMetaMask && (
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Install
                </a>
              )}
            </button>

            {/* Phantom */}
            <button
              onClick={handleConnectWallet}
              disabled={isConnecting || !hasPhantom}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-800/60 hover:border-gray-700 hover:bg-gray-900/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-gold-primary/10 flex items-center justify-center">
                <img src="/wallets/Phantom-Icon_Transparent_Purple.svg" alt="" className="w-5 h-5" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-white">Phantom</p>
                <p className="text-xs text-gray-500">
                  {hasPhantom ? 'Multi-chain wallet' : 'Not installed'}
                </p>
              </div>
              {!hasPhantom && (
                <a
                  href="https://phantom.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Install
                </a>
              )}
            </button>
          </div>

          {/* Help Toggle */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="w-full flex items-center justify-between px-1 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span>Using Polymarket wallet? How to import</span>
            <svg className={`w-4 h-4 transition-transform ${showHelp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Help Content */}
          {showHelp && (
            <div className="p-3 rounded-lg bg-gray-900/30 border border-gray-800/40 space-y-2">
              <p className="text-xs text-gray-400">
                Export your private key from <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-gold-hover hover:underline">Polymarket.com</a> (Settings → Security), 
                then import it into MetaMask or Phantom to use your existing account.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs text-gray-500">Your funds & positions will be accessible here</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800/60">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
