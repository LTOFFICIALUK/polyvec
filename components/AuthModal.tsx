'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'login' | 'signup'
}

const AuthModal = ({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { login, signup } = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    setMounted(true)
  }, [])

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

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  if (!isOpen || !mounted) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (mode === 'login') {
        await login(email, password)
        showToast('Successfully logged in!', 'success')
      } else {
        await signup(email, password)
        showToast('Account created successfully!', 'success')
      }
      onClose()
    } catch (error: any) {
      showToast(error.message || 'Authentication failed', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="bg-dark-bg border border-gray-700/30 rounded-xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/70"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-700/30">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {mode === 'login' 
                ? 'Welcome back to PolyVec' 
                : 'Start trading smarter today'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800/50 rounded-lg"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-900/30 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary/50 focus:border-gold-primary/50 transition-all"
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 bg-gray-900/30 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary/50 focus:border-gold-primary/50 transition-all"
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'signup' && (
                <p className="mt-2 text-xs text-gray-500">
                  Password must be at least 8 characters long
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-3.5 bg-gold-primary hover:bg-gold-hover text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider shadow-lg shadow-gold-primary/20 hover:shadow-gold-primary/30 disabled:hover:shadow-none"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
                </span>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700/30">
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="w-full text-center text-gold-primary hover:text-gold-hover text-sm font-medium transition-colors"
            >
              {mode === 'login' 
                ? "Don't have an account? " : 'Already have an account? '}
              <span className="underline">
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
