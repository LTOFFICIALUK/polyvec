'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePlanModal } from '@/contexts/PlanModalContext'

interface SubscriptionStatus {
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  cancelledAt: string | null
}

export default function PaymentWarningBanner() {
  const { user } = useAuth()
  const { openModal } = usePlanModal()
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    console.log('[PaymentWarningBanner] Effect running, user:', user)
    
    if (!user || user.plan_tier !== 'pro') {
      console.log('[PaymentWarningBanner] User not Pro or not logged in:', { 
        hasUser: !!user, 
        planTier: user?.plan_tier 
      })
      setIsVisible(false)
      return
    }

    const fetchSubscription = async () => {
      try {
        console.log('[PaymentWarningBanner] Fetching subscription...')
        const response = await fetch('/api/user/subscription')
        if (response.ok) {
          const data = await response.json()
          console.log('[PaymentWarningBanner] Subscription data:', data)
          if (data.subscription && data.subscription.status === 'past_due') {
            setSubscription(data.subscription)
            // Check if user has dismissed this warning in this session
            const dismissed = sessionStorage.getItem('payment-warning-dismissed')
            console.log('[PaymentWarningBanner] Dismissed status:', dismissed)
            if (!dismissed) {
              setIsVisible(true)
              console.log('[PaymentWarningBanner] Banner should be visible!')
            } else {
              console.log('[PaymentWarningBanner] Banner dismissed in this session')
            }
          } else {
            console.log('[PaymentWarningBanner] Subscription status is not past_due:', data.subscription?.status)
          }
        } else {
          console.error('[PaymentWarningBanner] Failed to fetch subscription:', response.status, response.statusText)
        }
      } catch (error) {
        console.error('[PaymentWarningBanner] Failed to fetch subscription status:', error)
      }
    }

    fetchSubscription()
  }, [user])

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    // Remember dismissal for this session only
    sessionStorage.setItem('payment-warning-dismissed', 'true')
  }

  const handleUpdatePayment = () => {
    // Open the plan modal directly
    openModal()
  }

  if (!isVisible || !subscription || isDismissed) {
    return null
  }

  return (
    <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3 relative z-[10000]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex-shrink-0">
            <svg
              className="w-5 h-5 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-400">
              Payment Failed
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Your subscription payment could not be processed. Please update your payment method to continue your Pro access.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleUpdatePayment}
            className="px-4 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
          >
            Update Payment
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
            aria-label="Dismiss"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

