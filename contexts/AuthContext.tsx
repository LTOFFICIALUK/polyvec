'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  email: string
  created_at: string
  last_login: string | null
  plan_tier?: 'free' | 'pro'
}

interface CustodialWalletData {
  walletAddress: string | null
  usdcBalance: string
  polBalance: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  custodialWallet: CustodialWalletData | null
  refreshCustodialWallet: (syncFromBlockchain?: boolean) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [custodialWallet, setCustodialWallet] = useState<CustodialWalletData | null>(null)
  const router = useRouter()

  const fetchCustodialWallet = useCallback(async (syncFromBlockchain = false) => {
    try {
      const [walletResponse, balanceResponse] = await Promise.all([
        fetch('/api/user/wallet').catch(err => {
          console.error('[Auth] Wallet fetch error:', err)
          return { ok: false, json: async () => ({ error: err.message }) }
        }),
        fetch(`/api/user/balances${syncFromBlockchain ? '?sync=true' : ''}`).catch(err => {
          console.error('[Auth] Balances fetch error:', err)
          return { ok: false, json: async () => ({ usdc_balance: '0', pol_balance: '0' }) }
        }),
      ])

      // Handle wallet response - 404 is okay (wallet not created yet), but 500 means error
      let walletAddress: string | null = null
      if (walletResponse.ok) {
        const walletData = await walletResponse.json()
        walletAddress = walletData.wallet_address || null
      } else if (walletResponse.status === 404) {
        // Wallet not found - this is okay, user might not have one yet
        walletAddress = null
      } else {
        // Other error (500, etc.) - log but don't fail completely
        console.warn('[Auth] Wallet fetch failed with status:', walletResponse.status)
      }

      // Handle balance response - always try to get balances, default to 0 if fails
      let usdcBalance = '0'
      let polBalance = '0'
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json()
        usdcBalance = balanceData.usdc_balance || '0'
        polBalance = balanceData.pol_balance || '0'
      } else {
        // Balance fetch failed - use defaults
        console.warn('[Auth] Balance fetch failed with status:', balanceResponse.status)
      }
      
      // Only set custodial wallet if we have an address, otherwise set to null
      if (walletAddress) {
        setCustodialWallet({
          walletAddress,
          usdcBalance,
          polBalance,
        })
      } else {
        setCustodialWallet(null)
      }
    } catch (error) {
      console.error('[Auth] Failed to fetch custodial wallet:', error)
      // Don't set to null on error - keep existing state if available
      // setCustodialWallet(null)
    }
  }, [])

  const refreshCustodialWallet = async (syncFromBlockchain = false) => {
    if (user) {
      await fetchCustodialWallet(syncFromBlockchain)
    }
  }

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        // Pre-fetch custodial wallet data when user is authenticated
        await fetchCustodialWallet()
      } else {
        setUser(null)
        setCustodialWallet(null)
      }
    } catch (error) {
      console.error('[Auth] Check auth error:', error)
      setUser(null)
      setCustodialWallet(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  // Auto-refresh custodial wallet balances every 5 seconds
  // Sync from blockchain every 30 seconds to avoid rate limiting
  useEffect(() => {
    if (!user) return

    let syncCounter = 0
    const interval = setInterval(() => {
      syncCounter++
      // Sync from blockchain every 6th call (30 seconds), otherwise just refresh from cache
      const shouldSyncFromBlockchain = syncCounter % 6 === 0
      fetchCustodialWallet(shouldSyncFromBlockchain).catch((error) => {
        console.error('[Auth] Auto-refresh error:', error)
      })
    }, 5000) // Every 5 seconds

    return () => clearInterval(interval)
  }, [user, fetchCustodialWallet])

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Login failed')
    }

    setUser(data.user)
    // Pre-fetch custodial wallet data immediately after login
    await fetchCustodialWallet()
    router.push('/terminal')
  }

  const signup = async (email: string, password: string) => {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Signup failed')
    }

    // Auto-login after signup
    await login(email, password)
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setCustodialWallet(null)
    router.push('/')
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, custodialWallet, refreshCustodialWallet, login, signup, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
