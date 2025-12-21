'use client'

import { useState } from 'react'
import { useToast } from '@/contexts/ToastContext'

const Footer = () => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { showToast } = useToast()

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch('/api/email-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'footer' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe')
      }

      showToast('Successfully subscribed to our email list!', 'success')
      setEmail('')
    } catch (error: any) {
      showToast(error.message || 'Failed to subscribe', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <footer className="bg-dark-bg border-t border-gray-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Email List Signup */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Stay Updated</h3>
            <p className="text-gray-400 mb-4 text-sm">
              Get the latest updates on new features and trading insights.
            </p>
            <form onSubmit={handleEmailSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="flex-1 px-4 py-2 bg-gray-900/30 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent text-sm"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:border-gold-primary/50 text-sm uppercase tracking-wider"
              >
                {isLoading ? '...' : 'Subscribe'}
              </button>
            </form>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <a href="/terminal" className="text-gray-400 hover:text-gold-primary transition-colors text-sm">
                  Trading Terminal
                </a>
              </li>
              <li>
                <a href="/analytics" className="text-gray-400 hover:text-gold-primary transition-colors text-sm">
                  Analytics
                </a>
              </li>
              <li>
                <a href="/strategies" className="text-gray-400 hover:text-gold-primary transition-colors text-sm">
                  Strategies
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700/50 pt-8 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} PolyVec. All rights reserved.
          </p>
          <p className="text-gray-500 text-xs mt-2 sm:mt-0">
            Designed for Polymarket crypto traders
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
