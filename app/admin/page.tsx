'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import UsersTab from './components/UsersTab'
import AnalyticsTab from './components/AnalyticsTab'
import EmailsTab from './components/EmailsTab'
import CampaignsTab from './components/CampaignsTab'

interface DashboardStats {
  totalUsers: number
  newUsers: number
  activeUsers: number
  proUsers: number
  bannedUsers: number
  revenue: number
  totalPayments: number
  activeSubscriptions: number
  failedPayments: number
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'analytics' | 'emails' | 'campaigns'>('overview')
  const [dataLoaded, setDataLoaded] = useState(false)

  useEffect(() => {
    checkAdminAccess()
  }, [user])

  useEffect(() => {
    if (isAdmin) {
      // Pre-fetch all data in the background
      preloadAllData()
    }
  }, [isAdmin])

  const checkAdminAccess = async () => {
    try {
      const response = await fetch('/api/admin/auth')
      const data = await response.json()
      
      if (response.ok && data.isAdmin) {
        setIsAdmin(true)
      } else {
        setIsAdmin(false)
        router.push('/')
      }
    } catch (error) {
      console.error('[Admin] Error checking access:', error)
      setIsAdmin(false)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const preloadAllData = async () => {
    try {
      // Fetch all data in parallel
      const [
        statsResponse,
        usersResponse,
        analyticsResponse,
        pageAnalyticsResponse,
        emailAnalyticsResponse,
        marketAnalyticsResponse,
        campaignsResponse,
      ] = await Promise.allSettled([
        fetch('/api/admin/analytics?period=30d'),
        fetch('/api/admin/users?page=1&limit=50'),
        fetch('/api/admin/analytics?period=30d'),
        fetch('/api/admin/analytics/pages?period=30d'),
        fetch('/api/admin/analytics/emails?period=30d'),
        fetch('/api/admin/analytics/markets?period=30d'),
        fetch('/api/admin/emails/campaigns'),
      ])

      // Set overview stats
      if (statsResponse.status === 'fulfilled' && statsResponse.value.ok) {
        const statsData = await statsResponse.value.json()
        setStats(statsData.overview)
      }

      setDataLoaded(true)
    } catch (error) {
      console.error('[Admin] Error preloading data:', error)
      setDataLoaded(true) // Still mark as loaded to show UI
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/analytics?period=30d')
      const data = await response.json()
      setStats(data.overview)
    } catch (error) {
      console.error('[Admin] Error fetching stats:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (!isAdmin) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-bg/95 backdrop-blur-sm border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <Link
              href="/terminal"
              className="text-gold-primary hover:text-gold-hover transition-colors"
            >
              ← Back to Terminal
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-dark-bg/95 backdrop-blur-sm border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'users', label: 'Users' },
              { id: 'analytics', label: 'Analytics' },
              { id: 'emails', label: 'Emails' },
              { id: 'campaigns', label: 'Campaigns' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-gold-primary text-gold-primary'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && <OverviewTab stats={stats} />}
        {activeTab === 'users' && <UsersTab preloaded={dataLoaded} />}
        {activeTab === 'analytics' && <AnalyticsTab preloaded={dataLoaded} />}
        {activeTab === 'emails' && <EmailsTab preloaded={dataLoaded} />}
        {activeTab === 'campaigns' && <CampaignsTab preloaded={dataLoaded} />}
      </div>
    </div>
  )
}

// Overview Tab Component
function OverviewTab({ stats }: { stats: DashboardStats | null }) {
  if (!stats) {
    return <div className="text-white">Loading stats...</div>
  }

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), color: 'blue' },
    { label: 'New Users (30d)', value: stats.newUsers.toLocaleString(), color: 'green' },
    { label: 'Active Users', value: stats.activeUsers.toLocaleString(), color: 'purple' },
    { label: 'Pro Users', value: stats.proUsers.toLocaleString(), color: 'gold' },
    { label: 'Revenue (30d)', value: `$${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'green' },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions.toLocaleString(), color: 'blue' },
    { label: 'Failed Payments', value: stats.failedPayments.toLocaleString(), color: 'red' },
    { label: 'Banned Users', value: stats.bannedUsers.toLocaleString(), color: 'red' },
  ]

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Dashboard Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm"
          >
            <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}


