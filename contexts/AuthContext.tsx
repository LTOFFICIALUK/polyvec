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
        fetch('/api/user/wallet'),
        fetch(`/api/user/balances${syncFromBlockchain ? '?sync=true' : ''}`),
      ])

      if (walletResponse.ok && balanceResponse.ok) {
        const walletData = await walletResponse.json()
        const balanceData = await balanceResponse.json()
        
        setCustodialWallet({
          walletAddress: walletData.wallet_address || null,
          usdcBalance: balanceData.usdc_balance || '0',
          polBalance: balanceData.pol_balance || '0',
        })
      } else {
        setCustodialWallet(null)
      }
    } catch (error) {
      console.error('[Auth] Failed to fetch custodial wallet:', error)
      setCustodialWallet(null)
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
