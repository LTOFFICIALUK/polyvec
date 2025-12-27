'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from '@/components/AuthModal'
import Footer from '@/components/Footer'
import TerminalDemo from '@/components/TerminalDemo'
import AnalyticsDemo from '@/components/AnalyticsDemo'
import BacktestDemo from '@/components/BacktestDemo'

const LandingPageContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [isVisible, setIsVisible] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [activeDemo, setActiveDemo] = useState<'terminal' | 'analytics' | 'backtest'>('terminal')
  const heroRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)

  // Removed automatic modal opening on page load
  // Modal will only open when user clicks "Login / Register" or "Get Started" buttons

  useEffect(() => {
    setIsVisible(true)
    
    // Intersection Observer for scroll animations with better performance
    const observerOptions = {
      threshold: 0.15,
      rootMargin: '0px 0px -100px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in-up')
          // Unobserve after animation to improve performance
          observer.unobserve(entry.target)
        }
      })
    }, observerOptions)

    const elements = document.querySelectorAll('.scroll-animate')
    elements.forEach((el) => observer.observe(el))

    return () => {
      elements.forEach((el) => observer.unobserve(el))
    }
  }, [])

  const handleGetStarted = () => {
    if (user) {
      router.push('/terminal')
            } else {
      setAuthMode('signup')
      setShowAuthModal(true)
    }
  }

  const features = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: 'Trading Terminal',
      description: 'Professional Polymarket crypto trading interface'
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: 'Wallet Connection',
      description: 'Seamless integration with your Web3 wallet'
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      title: '8 Live Markets',
      description: 'BTC, ETH, SOL, XRP — 15m & 1h timeframes'
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: 'Historical Context',
      description: 'Basic historical market flow for informed decisions'
    },
  ]

  return (
    <div className="bg-dark-bg text-white min-h-screen">
      {/* Hero Section */}
      <section 
        ref={heroRef}
        className={`relative overflow-hidden pt-32 pb-20 px-4 sm:px-6 lg:px-8 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-gold-primary/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-gold-primary via-gold-hover to-gold-primary bg-clip-text text-transparent animate-gradient">
              Identify Markets Worth Trading
            </span>
          </h1>
          
          <p className="text-xl sm:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
            PolyVec helps Polymarket crypto traders identify when short-term markets are worth trading — and when they&apos;re not.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              onClick={handleGetStarted}
              className="px-8 py-4 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white text-base font-medium rounded transition-all duration-200 transform hover:scale-105 focus:outline-none uppercase tracking-wide"
              style={{ fontFamily: 'monospace' }}
            >
              Get Started
            </button>
            <Link
              href="/terminal"
              className="px-8 py-4 bg-transparent border-2 border-gold-primary/50 hover:border-gold-primary text-gold-primary hover:text-gold-hover text-base font-medium rounded transition-all duration-200 transform hover:scale-105 focus:outline-none uppercase tracking-wide"
              style={{ fontFamily: 'monospace' }}
            >
              View Demo
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center items-center gap-8 text-gray-400 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Polymarket Crypto Only</span>
              </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Real-time Data</span>
              </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Secure Wallet Integration</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gold-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Secure Payments via Stripe</span>
            </div>
      </div>
        </div>
      </section>

      {/* Features Section */}
      <section 
        id="features"
        ref={featuresRef}
        className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-dark-bg/50 to-transparent"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 scroll-animate">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              Everything You Need to Trade Smarter
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              A professional trading terminal designed for Polymarket crypto markets
            </p>
              </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {features.map((feature, index) => (
              <div
                key={index}
                className="scroll-animate p-6 bg-dark-bg border border-gray-700/20 hover:border-gold-primary/30 rounded-lg transition-all duration-300 transform hover:-translate-y-1 shadow-lg shadow-black/50"
              >
                <div className="text-gold-primary mb-4">
                  {feature.icon}
              </div>
                <h3 className="text-xl font-semibold mb-2 text-white">
                  {feature.title}
                </h3>
                <p className="text-gray-400">
                  {feature.description}
                </p>
            </div>
            ))}
          </div>

          {/* Pricing Card */}
          <div id="pricing" className="max-w-md mx-auto scroll-animate">
            <div className="bg-dark-bg border-2 border-gold-primary/30 rounded-2xl p-8 shadow-lg shadow-black/50 hover:border-gold-primary/50 transition-all duration-300">
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-2 text-white">Trading Terminal</h3>
                <p className="text-gray-400 mb-6">Polymarket crypto only</p>
                
                <div className="mb-8">
                  <span className="text-5xl font-bold text-gold-primary">$49</span>
                  <span className="text-xl text-gray-400">/month</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-300">Login & Wallet connection</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-300">8 live markets (BTC, ETH, SOL, XRP)</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-300">15m & 1h timeframes</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-300">Basic historical market flow</span>
                </li>
              </ul>

                              <button
                onClick={handleGetStarted}
                className="w-full px-6 py-3 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white text-sm font-medium rounded transition-all duration-200 transform hover:scale-105 focus:outline-none uppercase tracking-wide"
                style={{ fontFamily: 'monospace' }}
              >
                Get Started
                              </button>
                              
                              {/* Payment Security Badge */}
                              <div className="mt-4 pt-4 border-t border-gray-700/30">
                                <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span>Secured payments powered by</span>
                                  <span className="font-semibold text-gray-300">Stripe</span>
                                </div>
                              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 scroll-animate">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              See It In Action
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              A professional trading terminal designed for Polymarket crypto markets
            </p>
          </div>

          <div className="scroll-animate max-w-7xl mx-auto">
            {/* Browser Chrome Frame */}
            <div className="relative bg-dark-bg border border-gray-700/30 rounded-lg overflow-hidden shadow-2xl shadow-black/50">
              {/* Browser Chrome */}
              <div className="bg-gray-800/50 px-4 py-3 flex items-center gap-2 border-b border-gray-700/30 relative z-10">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-gray-900/50 rounded px-3 py-1 text-xs text-gray-400 text-center">
                    {activeDemo === 'terminal' && 'polyvec.com/terminal'}
                    {activeDemo === 'analytics' && 'polyvec.com/analytics'}
                    {activeDemo === 'backtest' && 'polyvec.com/strategies/backtest'}
                  </div>
                </div>
                
                {/* Navigation Arrows */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const demos: Array<'terminal' | 'analytics' | 'backtest'> = ['terminal', 'analytics', 'backtest']
                      const currentIndex = demos.indexOf(activeDemo)
                      const prevIndex = currentIndex === 0 ? demos.length - 1 : currentIndex - 1
                      setActiveDemo(demos[prevIndex])
                    }}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-all duration-200"
                    aria-label="Previous demo"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="flex items-center gap-1">
                    {(['terminal', 'analytics', 'backtest'] as const).map((demo, index) => (
                      <div
                        key={demo}
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                          activeDemo === demo ? 'bg-gold-primary w-6' : 'bg-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const demos: Array<'terminal' | 'analytics' | 'backtest'> = ['terminal', 'analytics', 'backtest']
                      const currentIndex = demos.indexOf(activeDemo)
                      const nextIndex = currentIndex === demos.length - 1 ? 0 : currentIndex + 1
                      setActiveDemo(demos[nextIndex])
                    }}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-all duration-200"
                    aria-label="Next demo"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Demo Content - Preview Mode */}
              <div className="relative h-[600px] overflow-hidden">
                {activeDemo === 'terminal' && <TerminalDemo />}
                {activeDemo === 'analytics' && <AnalyticsDemo />}
                {activeDemo === 'backtest' && <BacktestDemo />}
                
                {/* Overlay to prevent interactions */}
                <div className="absolute inset-0 bg-transparent z-50 cursor-not-allowed" 
                     style={{ pointerEvents: 'auto' }}
                     onClick={(e) => e.preventDefault()}
                     onMouseDown={(e) => e.preventDefault()}
                     title="Preview - Sign up to access the full features" />
              </div>
              
              {/* Caption */}
              <div className="bg-gray-900/30 px-6 py-4 border-t border-gray-700/30">
                <p className="text-center text-gray-400 text-sm">
                  {activeDemo === 'terminal' && 'Professional trading interface with real-time market data, advanced charts, and seamless wallet integration'}
                  {activeDemo === 'analytics' && 'Comprehensive trading analytics with performance metrics, win rate analysis, and market insights'}
                  {activeDemo === 'backtest' && 'Test your trading strategies with historical data to optimize performance before going live'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-gold-primary/5 to-transparent">
        <div className="max-w-4xl mx-auto text-center scroll-animate">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">
            Ready to Trade Smarter?
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Join PolyVec today and identify when short-term markets are worth trading — and when they&apos;re not.
          </p>
          <button
            onClick={handleGetStarted}
            className="px-8 py-4 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white text-base font-medium rounded transition-all duration-200 transform hover:scale-105 focus:outline-none uppercase tracking-wide"
            style={{ fontFamily: 'monospace' }}
          >
            Get Started Now
          </button>
          </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        initialMode={authMode}
      />
    </div>
  )
}

const LandingPage = () => {
  return (
    <Suspense fallback={
      <div className="bg-dark-bg text-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-primary"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <LandingPageContent />
    </Suspense>
  )
}

export default LandingPage
