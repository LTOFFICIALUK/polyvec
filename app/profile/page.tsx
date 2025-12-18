'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/contexts/WalletContext'

export default function ProfilePage() {
  const router = useRouter()
  const { walletAddress, isConnected } = useWallet()
  const [address, setAddress] = useState('')
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Auto-redirect connected users to their profile
  useEffect(() => {
    if (isConnected && walletAddress) {
      setIsRedirecting(true)
      router.push(`/profile/${walletAddress}`)
    }
  }, [isConnected, walletAddress, router])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedAddress = address.trim()
    if (trimmedAddress) {
      // Basic validation for Ethereum address format
      if (trimmedAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        router.push(`/profile/${trimmedAddress}`)
      } else {
        // Could add toast notification here
        alert('Please enter a valid Ethereum address (0x...)')
      }
    }
  }

  // Show loading state while redirecting
  if (isRedirecting) {
    return (
      <div className="bg-dark-bg text-white min-h-screen">
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Profile</h1>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <svg className="w-12 h-12 animate-spin text-gold-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-400">Redirecting to your profile...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-bg text-white min-h-screen">
      <div className="px-4 sm:px-6 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">Profile</h1>
        
        <div className="max-w-lg mx-auto">
          {/* Not Connected Message */}
          <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-800 mb-6 text-center">
            <div className="text-5xl mb-4">🔗</div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Connect your wallet to automatically view your Polymarket trading profile, 
              or enter any wallet address below to view their profile.
            </p>
            <p className="text-xs text-gray-500">
              Click the &quot;Connect Wallet&quot; button in the header to get started.
            </p>
          </div>

          {/* Manual Address Entry */}
          <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              View Any Profile
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Enter a Polygon wallet address to view their Polymarket trading profile.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="address" className="block text-sm text-gray-400 mb-2">
                  Polygon Wallet Address
                </label>
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-dark-bg border border-gray-800 text-white px-4 py-3 rounded focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent font-mono text-sm placeholder-gray-600"
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <button
                type="submit"
                disabled={!address.trim()}
                className="w-full px-4 py-3 bg-gold-primary hover:bg-gold-hover text-white rounded transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                View Profile
              </button>
            </form>
          </div>

          {/* Popular Traders Section (Optional - could show leaderboard) */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Tip: You can share your profile by copying the URL after viewing it.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
