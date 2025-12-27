'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [hasRedirected, setHasRedirected] = useState(false)

  useEffect(() => {
    // If we're not on the home page and auth check is complete and user is not logged in, redirect immediately
    if (!isLoading && !user && !hasRedirected && pathname !== '/') {
      setHasRedirected(true)
      router.replace('/')
    }
  }, [user, isLoading, router, pathname, hasRedirected])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-bg">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-primary"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // If not logged in, show nothing (redirect is happening)
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-bg">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-primary"></div>
          <p className="mt-4 text-gray-400">Redirecting...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default ProtectedRoute
