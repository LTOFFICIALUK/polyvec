'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '@/contexts/WalletContext'
import { useAuth } from '@/contexts/AuthContext'
import { signClobAuthMessage, ensurePolygonNetwork, getBrowserProvider } from '@/lib/polymarket-auth'
import { ethers } from 'ethers'

interface PolymarketAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function PolymarketAuthModal({ isOpen, onClose, onSuccess }: PolymarketAuthModalProps) {
  const { setPolymarketCredentials } = useWallet()
  const { custodialWallet } = useAuth()
  const [step, setStep] = useState<'sign' | 'generating' | 'success' | 'error'>('sign')
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  
  // Use custodial wallet address
  const walletAddress = custodialWallet?.walletAddress || null

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setStep('generating')
      setError('')
      // Auto-start authentication when modal opens
      handleAuthenticate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleAuthenticate = async () => {
    if (!walletAddress) {
      setError('Custodial wallet not found. Please ensure you are logged in.')
      return
    }

    setError('')
    setStep('generating')

    try {
      // Sign authentication message server-side using custodial wallet
      const signResponse = await fetch('/api/polymarket/auth/sign-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!signResponse.ok) {
        const errorData = await signResponse.json()
        throw new Error(errorData.error || 'Failed to sign authentication message')
      }

      const signature = await signResponse.json()

      console.log('[PolymarketAuth] Authenticating with custodial wallet:', {
        walletAddress: signature.address,
      })

      // Generate API key
      const response = await fetch('/api/polymarket/auth/api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: signature.address,
          signature: signature.signature,
          timestamp: signature.timestamp,
          nonce: signature.nonce,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate API key')
      }

      const credentials = await response.json()
      
      console.log('[PolymarketAuth] Received credentials:', {
        apiKey: credentials.apiKey?.substring(0, 10) + '...',
        secretLength: credentials.secret?.length,
        passphraseLength: credentials.passphrase?.length,
        allFields: Object.keys(credentials),
        authenticatedAddress: signature.address,
      })
      
      if (!credentials.apiKey || !credentials.secret || !credentials.passphrase) {
        throw new Error(`Missing credentials: ${Object.keys(credentials).join(', ')}`)
      }
      
      // Store credentials in database
      const storeResponse = await fetch('/api/user/polymarket-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          secret: credentials.secret,
          passphrase: credentials.passphrase,
        }),
      })

      if (!storeResponse.ok) {
        const errorData = await storeResponse.json()
        throw new Error(errorData.error || 'Failed to store credentials')
      }
      
      // Also update local state
      setPolymarketCredentials({
        apiKey: credentials.apiKey,
        secret: credentials.secret,
        passphrase: credentials.passphrase,
      })
      
      console.log('[PolymarketAuth] Credentials stored in database for address:', signature.address)

      setStep('success')
      
      // Auto-close after success (show checkmark for 2 seconds)
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2000)
    } catch (err: any) {
      console.error('Polymarket authentication error:', err)
      setError(err.message || 'Failed to authenticate with Polymarket')
      setStep('error')
    }
  }

  if (!isOpen || !mounted) return null

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="bg-dark-bg/95 backdrop-blur-sm border border-gray-700/50 rounded-lg w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Content */}
        <div className="flex flex-col items-center justify-center p-12 pb-8 min-h-[300px]">
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center space-y-6">
              {/* Animated Orange Circle */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-orange-500/30"></div>
                <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-orange-500 animate-spin"></div>
              </div>
              <p className="text-gray-300 text-center text-sm">
                Authenticating with Polymarket...
              </p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center space-y-6">
              {/* Green Checkmark in Circle */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-green-500/20 border-4 border-green-500 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-white text-lg font-semibold">Authentication Complete</p>
              <p className="text-gray-400 text-sm text-center">
                You can now trade on Polymarket
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-red-500/20 border-4 border-red-500 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="text-red-400 font-semibold">Authentication Failed</p>
              <p className="text-gray-300 text-sm text-center max-w-sm">{error}</p>
              <button
                onClick={() => {
                  setStep('generating')
                  setError('')
                  handleAuthenticate()
                }}
                className="px-6 py-2 bg-gold-primary hover:bg-gold-hover text-white rounded transition-colors font-medium text-sm"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Small print at bottom */}
        <div className="px-6 pb-4 text-center">
          <p className="text-gray-500 text-xs">
            Click anywhere outside this box to close
          </p>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

