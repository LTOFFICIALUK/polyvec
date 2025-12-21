'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useRouter } from 'next/navigation'

interface PlanSelectionModalProps {
  isOpen: boolean
  onClose: () => void
}

type PlanTier = 'free' | 'pro'

export default function PlanSelectionModal({ isOpen, onClose }: PlanSelectionModalProps) {
  const { user, checkAuth } = useAuth()
  const { showToast } = useToast()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<PlanTier | null>(null)
  const [subscription, setSubscription] = useState<{
    status: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    cancelledAt: string | null
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && user) {
      fetchCurrentPlan()
      fetchSubscription()
    }
  }, [isOpen, user])

  const fetchCurrentPlan = async () => {
    if (!user) return
    try {
      const response = await fetch('/api/user/plan')
      if (response.ok) {
        const data = await response.json()
        setCurrentPlan(data.plan || 'free')
      }
    } catch (error) {
      console.error('Failed to fetch plan:', error)
    }
  }

  const fetchSubscription = async () => {
    if (!user) return
    try {
      const response = await fetch('/api/user/subscription')
      if (response.ok) {
        const data = await response.json()
        console.log('[PlanSelectionModal] Subscription data received:', data)
        if (data.subscription) {
          console.log('[PlanSelectionModal] Setting subscription:', {
            status: data.subscription.status,
            currentPeriodEnd: data.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: data.subscription.cancelAtPeriodEnd,
          })
          setSubscription({
            status: data.subscription.status,
            currentPeriodEnd: data.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: data.subscription.cancelAtPeriodEnd,
            cancelledAt: data.subscription.cancelledAt,
          })
        } else {
          console.log('[PlanSelectionModal] No subscription found')
          setSubscription(null)
        }
      } else {
        console.error('[PlanSelectionModal] Failed to fetch subscription:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('[PlanSelectionModal] Failed to fetch subscription:', error)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) {
      console.log('[formatDate] No date string provided')
      return null
    }
    try {
      // Parse the date string (handles both ISO strings and timestamps)
      const date = new Date(dateString)
      
      // Check if date is valid and not epoch (Jan 1, 1970)
      if (isNaN(date.getTime())) {
        console.error('[formatDate] Invalid date (NaN):', dateString)
        return null
      }
      
      // Check if date is epoch (Jan 1, 1970) - indicates invalid timestamp
      if (date.getTime() === 0) {
        console.error('[formatDate] Date is epoch (0):', dateString)
        return null
      }
      
      // Format in user's local timezone
      const formatted = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
      })
      
      console.log('[formatDate] Successfully formatted:', dateString, '->', formatted)
      return formatted
    } catch (error) {
      console.error('[formatDate] Error formatting date:', error, dateString)
      return null
    }
  }

  const handlePlanSelect = async (plan: PlanTier) => {
    if (!user) {
      showToast('Please log in to select a plan', 'error')
      return
    }

    if (currentPlan === plan) {
      showToast(`You are already on the ${plan === 'free' ? 'Free' : 'Pro'} plan`, 'info')
      return
    }

    // SECURITY: Users cannot directly change plans
    // Free to Pro: Must go through payment flow
    if (plan === 'pro' && currentPlan === 'free') {
      setIsUpdating(true)
      try {
        // Create Stripe checkout session
        const response = await fetch('/api/stripe/create-checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan: 'pro' }),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to create checkout session')
        }

        // Redirect to Stripe Checkout
        if (result.url) {
          window.location.href = result.url
        } else {
          throw new Error('No checkout URL received')
        }
      } catch (error: any) {
        console.error('Checkout error:', error)
        showToast(error.message || 'Failed to start checkout. Please try again.', 'error')
        setIsUpdating(false)
      }
      return
    }

    // Pro to Free: Allow downgrade (but log it)
    if (plan === 'free' && currentPlan === 'pro') {
      setIsUpdating(true)
      try {
        const response = await fetch('/api/user/plan/downgrade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            reason: 'User requested downgrade',
          }),
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to downgrade plan')
        }

        showToast('Successfully downgraded to Free plan', 'success')
        setCurrentPlan('free')
        setSubscription(null)
        
        // Refresh auth to get updated plan
        await checkAuth()
        await fetchSubscription()
        
        // Close modal after a brief delay
        setTimeout(() => {
          onClose()
        }, 1000)
      } catch (error: any) {
        console.error('Plan downgrade error:', error)
        showToast(error.message || 'Failed to downgrade plan', 'error')
      } finally {
        setIsUpdating(false)
      }
      return
    }

    // This shouldn't happen, but handle it
    showToast('Invalid plan change request', 'error')
  }

  const handleManageSubscription = async () => {
    if (!user) {
      showToast('Please log in to manage your subscription', 'error')
      return
    }

    setIsUpdating(true)
    try {
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create portal session')
      }

      // Redirect to Stripe Customer Portal
      if (result.url) {
        window.location.href = result.url
      } else {
        throw new Error('No portal URL received')
      }
    } catch (error: any) {
      console.error('Portal error:', error)
      showToast(error.message || 'Failed to open subscription management. Please try again.', 'error')
      setIsUpdating(false)
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
        className="bg-dark-bg border border-gray-700/30 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl shadow-black/70"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-700/30">
          <div>
            <h2 className="text-2xl font-bold text-white">Choose Your Plan</h2>
            <p className="text-sm text-gray-400 mt-1">Select the plan that works best for you</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800/50 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!user ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">Please log in to select a plan</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Free Plan */}
              <div
                className={`relative p-6 rounded-lg border-2 transition-all ${
                  currentPlan === 'free'
                    ? 'border-gold-primary bg-gold-primary/10'
                    : 'border-gray-700/50 bg-dark-bg/50 hover:border-gray-600'
                }`}
              >
                {currentPlan === 'free' && (
                  <div className="absolute top-4 right-4 px-2 py-1 bg-gold-primary text-white text-xs font-semibold rounded">
                    current
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white mb-2">Free</h3>
                  <p className="text-3xl font-bold text-gold-primary mb-1">$0</p>
                  <p className="text-sm text-gray-400">Forever</p>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-300 text-sm">Trading Terminal</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-300 text-sm">Analytics Page</span>
                  </li>
                </ul>
                <button
                  onClick={() => handlePlanSelect('free')}
                  disabled={isUpdating || currentPlan === 'free'}
                  className={`w-full px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                    currentPlan === 'free'
                      ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-800/50 text-white hover:bg-gray-700/50'
                  }`}
                >
                  {currentPlan === 'free' ? 'Current Plan' : 'Select Free'}
                </button>
              </div>

              {/* Pro Plan */}
              <div
                className={`relative p-6 rounded-lg border-2 transition-all ${
                  currentPlan === 'pro'
                    ? 'border-gold-primary bg-gold-primary/10'
                    : 'border-gray-700/50 bg-dark-bg/50 hover:border-gray-600'
                }`}
              >
                {currentPlan === 'pro' && (
                  <div className="absolute top-4 right-4 px-2 py-1 bg-gold-primary text-white text-xs font-semibold rounded">
                    current
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
                  <p className="text-3xl font-bold text-gold-primary mb-1">$49</p>
                  <p className="text-sm text-gray-400">Per month</p>
                  {subscription && subscription.status === 'active' && subscription.currentPeriodEnd && (
                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                      {subscription.cancelAtPeriodEnd ? (
                        <p className="text-xs text-yellow-400">
                          Cancels on {formatDate(subscription.currentPeriodEnd)}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">
                          Renews on {formatDate(subscription.currentPeriodEnd)}
                        </p>
                      )}
                    </div>
                  )}
                  {subscription && subscription.status === 'past_due' && (
                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                      <p className="text-xs text-red-400 font-semibold">
                        ⚠️ Payment failed - Please update your payment method
                      </p>
                    </div>
                  )}
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-300 text-sm">Trading Terminal</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-300 text-sm">Analytics Page</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-gold-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <span className="text-gray-300 text-sm font-semibold">Automated Trading Strategies</span>
                      <p className="text-gray-400 text-xs mt-1">Create bots that trade 24/7 using TradingView signals, technical indicators, and custom rules</p>
                    </div>
                  </li>
                </ul>
                <button
                  onClick={() => handlePlanSelect('pro')}
                  disabled={isUpdating || currentPlan === 'pro'}
                  className={`w-full px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                    currentPlan === 'pro'
                      ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
                      : isUpdating
                      ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
                      : 'bg-gold-primary hover:bg-gold-hover text-white shadow-lg shadow-gold-primary/20'
                  }`}
                >
                  {isUpdating ? 'Updating...' : currentPlan === 'pro' ? 'Current Plan' : 'Upgrade to Pro'}
                </button>
                {currentPlan === 'pro' && (
                  <button
                    onClick={handleManageSubscription}
                    disabled={isUpdating}
                    className="w-full mt-3 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all bg-gray-800/50 text-white hover:bg-gray-700/50 border border-gray-700/50"
                  >
                    Manage Subscription
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700/30">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-800/50 hover:bg-gray-700/50 text-white font-medium rounded-lg transition-all duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

