'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'

export interface PolymarketApiCredentials {
  apiKey: string
  secret: string
  passphrase: string
}

interface WalletContextType {
  isConnected: boolean
  walletAddress: string | null
  connectWallet: (address: string) => void
  disconnectWallet: () => void
  // Polymarket API credentials
  polymarketCredentials: PolymarketApiCredentials | null
  setPolymarketCredentials: (creds: PolymarketApiCredentials | null) => void
  isPolymarketAuthenticated: boolean
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { user, custodialWallet } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [polymarketCredentials, setPolymarketCredentialsState] = useState<PolymarketApiCredentials | null>(null)

  // Use custodial wallet address when user is authenticated
  useEffect(() => {
    if (user && custodialWallet?.walletAddress) {
      const address = custodialWallet.walletAddress.toLowerCase()
      setWalletAddress(address)
      setIsConnected(true)
    } else {
      setWalletAddress(null)
      setIsConnected(false)
      setPolymarketCredentialsState(null)
    }
  }, [user, custodialWallet?.walletAddress])

  // Automatically load Polymarket credentials from database when user is authenticated
  useEffect(() => {
    if (user && custodialWallet?.walletAddress) {
      const loadCredentials = async () => {
        try {
          const response = await fetch('/api/user/polymarket-credentials')
          if (response.ok) {
            const data = await response.json()
            if (data.credentials) {
              setPolymarketCredentialsState(data.credentials)
            } else {
              setPolymarketCredentialsState(null)
            }
          }
        } catch (error) {
          console.error('[WalletContext] Failed to load Polymarket credentials:', error)
        }
      }
      loadCredentials()
    } else {
      setPolymarketCredentialsState(null)
    }
  }, [user, custodialWallet?.walletAddress])

  const connectWallet = (address: string) => {
    // This is kept for compatibility but custodial wallet is used automatically
    const normalizedAddress = address.toLowerCase()
    setWalletAddress(normalizedAddress)
    setIsConnected(true)
  }

  const disconnectWallet = () => {
    // This is kept for compatibility but custodial wallet is managed by AuthContext
    setWalletAddress(null)
    setIsConnected(false)
    setPolymarketCredentialsState(null)
  }

  const setPolymarketCredentials = async (creds: PolymarketApiCredentials | null) => {
    setPolymarketCredentialsState(creds)
    // Credentials are stored in database, not localStorage
    // If manually setting credentials (e.g., from auth modal), they're already in the database
  }

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        walletAddress,
        connectWallet,
        disconnectWallet,
        polymarketCredentials,
        setPolymarketCredentials,
        isPolymarketAuthenticated: polymarketCredentials !== null,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export const useWallet = () => {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

