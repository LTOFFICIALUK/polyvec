'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

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

const POLYMARKET_CREDS_KEY_PREFIX = 'polymarket_api_credentials_'

// Helper function to get the storage key for a specific address
const getCredsKey = (address: string): string => {
  return `${POLYMARKET_CREDS_KEY_PREFIX}${address.toLowerCase()}`
}

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [polymarketCredentials, setPolymarketCredentialsState] = useState<PolymarketApiCredentials | null>(null)

  // Load wallet and Polymarket credentials from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('walletAddress')
      if (stored) {
        setWalletAddress(stored)
        setIsConnected(true)
        
        // Load credentials for this specific address
        const credsKey = getCredsKey(stored)
        const storedCreds = localStorage.getItem(credsKey)
        if (storedCreds) {
          try {
            const creds = JSON.parse(storedCreds)
            setPolymarketCredentialsState(creds)
          } catch (error) {
            console.error('Failed to parse stored Polymarket credentials:', error)
            localStorage.removeItem(credsKey)
          }
        }
      }
    }
  }, [])

  const connectWallet = (address: string) => {
    const normalizedAddress = address.toLowerCase()
    setWalletAddress(normalizedAddress)
    setIsConnected(true)
    // Store in localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('walletAddress', normalizedAddress)
      
      // Load credentials for this specific address
      const credsKey = getCredsKey(normalizedAddress)
      const storedCreds = localStorage.getItem(credsKey)
      if (storedCreds) {
        try {
          const creds = JSON.parse(storedCreds)
          setPolymarketCredentialsState(creds)
        } catch (error) {
          console.error('Failed to parse stored Polymarket credentials:', error)
          localStorage.removeItem(credsKey)
          setPolymarketCredentialsState(null)
        }
      } else {
        // Clear credentials if this address doesn't have any
        setPolymarketCredentialsState(null)
      }
    }
  }

  const disconnectWallet = () => {
    setWalletAddress(null)
    setIsConnected(false)
    setPolymarketCredentialsState(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('walletAddress')
    }
  }

  const setPolymarketCredentials = (creds: PolymarketApiCredentials | null) => {
    setPolymarketCredentialsState(creds)
    if (typeof window !== 'undefined' && walletAddress) {
      const credsKey = getCredsKey(walletAddress)
      if (creds) {
        localStorage.setItem(credsKey, JSON.stringify(creds))
      } else {
        localStorage.removeItem(credsKey)
      }
    }
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

