'use client'

import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { useRef, useState, useEffect, useCallback } from 'react'
import { useWallet } from '@/contexts/WalletContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePlanModal } from '@/contexts/PlanModalContext'
import ConnectWalletModal from './ConnectWalletModal'
import PolymarketAuthModal from './PolymarketAuthModal'
import DepositModal from './DepositModal'
import AuthModal from './AuthModal'
import PlanSelectionModal from './PlanSelectionModal'

interface BalanceData {
  portfolioValue: number
  cashBalance: number
}

const Header = () => {
  const router = useRouter()
  const pathname = usePathname()
  const { isConnected, walletAddress, disconnectWallet, isPolymarketAuthenticated } = useWallet()
  const { user, isLoading: authLoading, logout: authLogout, custodialWallet } = useAuth()
  const isAuthenticated = !!user
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showPolymarketAuthModal, setShowPolymarketAuthModal] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { isOpen: showPlanModal, openModal: openPlanModal, closeModal: closePlanModal } = usePlanModal()
  const [isProfileMenuVisible, setIsProfileMenuVisible] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const [balances, setBalances] = useState<BalanceData>({ portfolioValue: 0, cashBalance: 0 })

  const isLandingPage = pathname === '/'

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  // Fetch balances from API (silent refresh - only updates if values change)
  const fetchBalances = useCallback(async () => {
    if (!walletAddress || isLandingPage) {
      setBalances({ portfolioValue: 0, cashBalance: 0 })
      return
    }

    try {
      const balanceRes = await fetch(`/api/user/balance?address=${walletAddress}`)
      const balanceData = await balanceRes.json()
      
      const newPortfolioValue = balanceData.portfolioValue || 0
      const newCashBalance = balanceData.cashBalance || 0

      // Only update if values actually changed (prevent unnecessary re-renders)
      setBalances((prevBalances) => {
        const portfolioChanged = Math.abs(prevBalances.portfolioValue - newPortfolioValue) > 0.01
        const cashChanged = Math.abs(prevBalances.cashBalance - newCashBalance) > 0.01

        if (portfolioChanged || cashChanged) {
          return {
            portfolioValue: newPortfolioValue,
            cashBalance: newCashBalance,
          }
        }
        return prevBalances
      })
    } catch (error) {
      console.error('Failed to fetch balances:', error)
      // Only set to 0 if we don't have any existing balance data
      setBalances((prev) => {
        if (prev.portfolioValue === 0 && prev.cashBalance === 0) {
          return { portfolioValue: 0, cashBalance: 0 }
        }
        return prev
      })
    }
  }, [walletAddress, isLandingPage])

  // Use custodial wallet balances from AuthContext (auto-refreshes every 5 seconds)
  const custodialUsdcBalance = custodialWallet ? parseFloat(custodialWallet.usdcBalance) : 0
  const custodialPolBalance = custodialWallet ? parseFloat(custodialWallet.polBalance) : 0

  // Fetch balances on mount and when auth changes
  useEffect(() => {
    if (!isLandingPage) {
    fetchBalances()
    
    // Refresh balances every 5 seconds
    const interval = setInterval(fetchBalances, 5000)
    return () => clearInterval(interval)
    }
  }, [fetchBalances, isLandingPage])

  const handleLogoClick = () => {
    router.push('/')
  }

  const handleLogoKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleLogoClick()
    }
  }

  const handleAuthClick = () => {
    if (isAuthenticated) {
      router.push('/terminal')
    } else {
      setShowAuthModal(true)
    }
  }

  const scrollToSection = (sectionId: string) => {
    setIsMobileMenuOpen(false)
    if (pathname !== '/') {
      router.push('/')
      setTimeout(() => {
        const element = document.getElementById(sectionId)
        if (element) {
          const headerOffset = 80
          const elementPosition = element.getBoundingClientRect().top
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          })
        }
      }, 100)
    } else {
      const element = document.getElementById(sectionId)
      if (element) {
        const headerOffset = 80
        const elementPosition = element.getBoundingClientRect().top
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        })
      }
    }
  }

  // Landing page navigation items
  const landingPageNavItems = [
    { label: 'Features', onClick: () => scrollToSection('features') },
    { label: 'Pricing', onClick: () => scrollToSection('pricing') },
    { label: 'Demo', onClick: () => scrollToSection('demo') },
  ]

  // Regular navigation items
  const navigationItems = [
    { label: 'Terminal', href: '/terminal' },
    { label: 'Analytics', href: '/analytics' },
    { label: 'History', href: '/history' },
    // Only show Strategies for Pro users
    ...(user?.plan_tier === 'pro' ? [{ label: 'Strategies', href: '/strategies' }] : []),
  ]

  const handleNavClick = (href: string) => {
    router.push(href)
    setIsMobileMenuOpen(false)
  }

  const handleNavKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    href: string
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleNavClick(href)
    }
  }

  const handleDepositClick = () => {
    // First check if user is authenticated (email/password login)
    if (!isAuthenticated) {
      setShowAuthModal(true)
      return
    }
    // If authenticated, show deposit modal with custodial wallet address
    setShowDepositModal(true)
  }

  const handleProfileClick = () => {
    // If authenticated, navigate to profile page
    if (isAuthenticated) {
      // Use custodial wallet address if available, otherwise use connected wallet
      const profileAddress = custodialWallet?.walletAddress || walletAddress
      if (profileAddress) {
        router.push(`/profile/${profileAddress}`)
      } else {
        // If no wallet address, go to profile page (it will handle redirect)
        router.push('/profile')
      }
      return
    }
    // If not authenticated, show auth modal
    if (!isAuthenticated) {
      setShowAuthModal(true)
    }
  }

  const handleProfileKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleProfileClick()
    }
  }

  const handleProfileMouseEnter = () => {
    if (!isAuthenticated) {
      return
    }
    setIsProfileMenuVisible(true)
  }

  const handleProfileMouseLeave = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    const nextTarget = event.relatedTarget as Node
    if (profileMenuRef.current && profileMenuRef.current.contains(nextTarget)) {
      return
    }
    setIsProfileMenuVisible(false)
  }

  const handleProfileFocus = () => {
    if (!isAuthenticated) {
      return
    }
    setIsProfileMenuVisible(true)
  }

  const handleProfileBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return
    }
    setIsProfileMenuVisible(false)
  }

  const handleDropdownMouseEnter = () => {
    setIsProfileMenuVisible(true)
  }

  const handleDropdownMouseLeave = () => {
    setIsProfileMenuVisible(false)
  }

  const handleLogoutClick = async () => {
    setIsProfileMenuVisible(false)
    // Log out from email/password auth
    if (isAuthenticated) {
      await authLogout()
    }
    // Disconnect wallet if connected
    if (isConnected) {
      disconnectWallet()
    }
  }

  // Landing Page Header
  if (isLandingPage) {
    return (
      <>
        <header className="w-full border-b border-gray-700/30 bg-dark-bg/95 backdrop-blur-sm relative z-[9999]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div
                onClick={handleLogoClick}
                onKeyDown={handleLogoKeyDown}
                tabIndex={0}
                role="button"
                aria-label="Navigate to home"
                className="cursor-pointer focus:outline-none rounded"
              >
                <Image
                  src="/logo.png"
                  alt="PolyVec"
                  width={112}
                  height={36}
                  className="h-7 w-auto"
                  priority
                />
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center space-x-8">
                {landingPageNavItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.onClick}
                    className="text-gray-400 hover:text-white transition-colors duration-200 focus:outline-none text-sm font-medium uppercase tracking-wider"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              {/* Auth Button */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleAuthClick}
                  className="px-6 py-2.5 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white text-sm font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 focus:outline-none uppercase tracking-wider"
                >
                  {isAuthenticated ? 'Go to Terminal' : 'Login / Register'}
                </button>

                {/* Mobile Menu Button */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 text-gray-400 hover:text-white focus:outline-none"
                  aria-label="Toggle menu"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {isMobileMenuOpen ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
              <div className="md:hidden border-t border-gray-700/30 py-4">
                <nav className="flex flex-col space-y-4">
                  {landingPageNavItems.map((item) => (
                    <button
                      key={item.label}
                      onClick={item.onClick}
                      className="text-left text-gray-400 hover:text-white transition-colors duration-200 focus:outline-none text-sm font-medium uppercase tracking-wider py-2"
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            )}
          </div>
        </header>

        {/* Auth Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </>
    )
  }

  // Regular Header (for terminal and other pages)
  return (
    <header className="w-full border-b border-gray-700/50 bg-dark-bg/95 backdrop-blur-sm relative z-[9999]">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div
              onClick={handleLogoClick}
              onKeyDown={handleLogoKeyDown}
              tabIndex={0}
              role="button"
              aria-label="Navigate to home"
              className="cursor-pointer focus:outline-none rounded"
            >
              <Image
                src="/logo.png"
                alt="PolyTrade"
                width={112}
                height={36}
                className="h-7 w-auto"
                priority
              />
            </div>
            <nav className="hidden md:flex items-center space-x-6">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <div
                    key={item.href}
                    onClick={() => handleNavClick(item.href)}
                    onKeyDown={(e) => handleNavKeyDown(e, item.href)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Navigate to ${item.label}`}
                    className={`cursor-pointer transition-colors duration-200 focus:outline-none rounded px-2 py-1 ${
                      isActive
                        ? 'text-gold-primary font-semibold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <span className="text-sm font-medium tracking-wide uppercase" style={{ fontFamily: 'monospace' }}>
                      {item.label}
                    </span>
                  </div>
                )
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-6">
            {/* Polymarket Auth Status/Button */}
            {isConnected && !isPolymarketAuthenticated && (
              <button
                onClick={() => setShowPolymarketAuthModal(true)}
                className="px-4 py-2 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white text-sm font-medium rounded transition-all duration-200 transform hover:scale-105 focus:outline-none flex items-center gap-2 uppercase tracking-wide"
                style={{ fontFamily: 'monospace' }}
                title="Connect to Polymarket for fast trading"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Connect to Polymarket
              </button>
            )}
            {/* Cash Balance (USDC.e) */}
            {isAuthenticated && (
            <div className="hidden lg:flex flex-col">
                <span className="text-xs text-gray-400 uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Cash</span>
              <span 
                  key={`cash-${custodialUsdcBalance}`}
                className="text-sm font-semibold text-green-400 transition-all duration-300 font-mono"
              >
                  {formatCurrency(custodialUsdcBalance)}
              </span>
            </div>
            )}
            {/* Gas Balance (POL) */}
            {isAuthenticated && (
            <div className="hidden lg:flex flex-col">
                <span className="text-xs text-gray-400 uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Gas</span>
              <span 
                  key={`gas-${custodialPolBalance}`}
                className="text-sm font-semibold text-green-400 transition-all duration-300 font-mono"
              >
                  {custodialPolBalance.toFixed(4)}
              </span>
            </div>
            )}
            {/* Deposit / Log In Button */}
            <button
              onClick={handleDepositClick}
              className="px-4 py-2 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white text-sm font-medium rounded transition-all duration-200 transform hover:scale-105 focus:outline-none uppercase tracking-wide"
              style={{ fontFamily: 'monospace' }}
            >
              {isAuthenticated ? 'Deposit' : 'Log In'}
            </button>
            {/* Profile Picture */}
            <div
              onMouseEnter={handleProfileMouseEnter}
              onMouseLeave={handleProfileMouseLeave}
              onFocus={handleProfileFocus}
              onBlur={handleProfileBlur}
              className="relative z-50"
              style={{ zIndex: 9999 }}
            >
              <div
                onClick={handleProfileClick}
                onKeyDown={handleProfileKeyDown}
                tabIndex={0}
                role="button"
                aria-haspopup="true"
                aria-expanded={isProfileMenuVisible}
                aria-label="Navigate to my profile"
                className="flex items-center cursor-pointer focus:outline-none rounded-full hover:ring-2 hover:ring-gold-primary hover:ring-offset-2 hover:ring-offset-black transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 via-gold-primary to-yellow-600 flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">U</span>
                </div>
              </div>
              {isAuthenticated && isProfileMenuVisible && (
                <div
                  ref={profileMenuRef}
                  onMouseEnter={handleDropdownMouseEnter}
                  onMouseLeave={handleDropdownMouseLeave}
                  role="menu"
                  aria-label="Profile actions"
                  className="absolute right-0 top-full pt-1 z-50"
                  style={{ zIndex: 9999 }}
                >
                  <div className="w-40 rounded-lg border border-gray-800 bg-dark-bg/95 text-white shadow-lg backdrop-blur overflow-hidden">
                    <button
                      onClick={() => {
                        setIsProfileMenuVisible(false)
                        handleProfileClick()
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary transition-colors uppercase tracking-wide"
                      style={{ fontFamily: 'monospace' }}
                    >
                      Profile
                    </button>
                    <div className="h-px bg-gray-800" />
                    <button
                      onClick={() => {
                        setIsProfileMenuVisible(false)
                        openPlanModal()
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary transition-colors uppercase tracking-wide"
                      style={{ fontFamily: 'monospace' }}
                    >
                      Choose Plan
                    </button>
                    <div className="h-px bg-gray-800" />
                    <button
                      onClick={() => {
                        setIsProfileMenuVisible(false)
                        router.push('/docs')
                      }}
                      className="block w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary transition-colors uppercase tracking-wide"
                      style={{ fontFamily: 'monospace' }}
                    >
                      Docs
                    </button>
                    <div className="h-px bg-gray-800" />
                    <button
                      onClick={handleLogoutClick}
                      className="block w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary transition-colors uppercase tracking-wide"
                      style={{ fontFamily: 'monospace' }}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Connect Wallet Modal */}
      <ConnectWalletModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
      />

      {/* Polymarket Auth Modal */}
      <PolymarketAuthModal
        isOpen={showPolymarketAuthModal}
        onClose={() => setShowPolymarketAuthModal(false)}
        onSuccess={() => {
          setShowPolymarketAuthModal(false)
        }}
      />

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => {
          setShowDepositModal(false)
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* Plan Selection Modal */}
      <PlanSelectionModal
        isOpen={showPlanModal}
        onClose={closePlanModal}
      />
    </header>
  )
}

export default Header
