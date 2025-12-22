'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function TestEmailPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string; email?: string } | null>(null)

  const sendTestEmail = async (emailType: string) => {
    if (!user) {
      setResult({ success: false, message: 'Please log in to test emails' })
      return
    }

    setLoading(emailType)
    setResult(null)

    try {
      const response = await fetch('/api/test/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailType }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult({ success: true, message: data.message, email: data.email })
      } else {
        setResult({ success: false, message: data.error || 'Failed to send email' })
      }
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Failed to send email' })
    } finally {
      setLoading(null)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
        <div className="bg-dark-bg border border-gray-700/50 rounded-lg p-6 max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-4">Test Email System</h1>
          <p className="text-gray-400">Please log in to test emails.</p>
        </div>
      </div>
    )
  }

  const emailTypes = [
    { id: 'welcome-pro', label: 'Welcome to Pro', description: 'Sent when user upgrades to Pro' },
    { id: 'payment-confirmation', label: 'Payment Confirmation', description: 'Sent after successful payment' },
    { id: 'payment-failed', label: 'Payment Failed', description: 'Sent when payment fails' },
    { id: 'subscription-cancelled', label: 'Subscription Cancelled', description: 'Sent when subscription is cancelled' },
    { id: 'renewal-reminder', label: 'Renewal Reminder', description: 'Sent before subscription renewal' },
  ]

  return (
    <div className="min-h-screen bg-dark-bg p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-dark-bg border border-gray-700/50 rounded-lg p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Test Email System</h1>
            <p className="text-gray-400 text-sm">
              TEMPORARY: This page is for testing email templates. Emails will be sent to: <strong className="text-gold-primary">{user.email}</strong>
            </p>
          </div>

          {result && (
            <div
              className={`mb-6 p-4 rounded-lg border ${
                result.success
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <p className="font-semibold">{result.success ? '✅ Success' : '❌ Error'}</p>
              <p className="text-sm mt-1">{result.message}</p>
              {result.email && (
                <p className="text-xs mt-2 opacity-75">Sent to: {result.email}</p>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {emailTypes.map((emailType) => (
              <div
                key={emailType.id}
                className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4"
              >
                <h3 className="text-lg font-semibold text-white mb-1">{emailType.label}</h3>
                <p className="text-sm text-gray-400 mb-3">{emailType.description}</p>
                <button
                  onClick={() => sendTestEmail(emailType.id)}
                  disabled={loading === emailType.id}
                  className="w-full px-4 py-2 bg-gold-primary hover:bg-gold-primary/90 text-black font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading === emailType.id ? 'Sending...' : 'Send Test Email'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-700/50">
            <p className="text-xs text-gray-500">
              Note: Check your email inbox ({user.email}) for the test emails. Make sure to check spam folder if emails don't arrive.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

