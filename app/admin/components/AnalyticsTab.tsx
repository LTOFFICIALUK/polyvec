'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import CustomSelect from './CustomSelect'

interface AnalyticsData {
  overview: {
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
  growth: {
    users: Array<{ date: string; count: number }>
    revenue: Array<{ date: string; revenue: number }>
  }
}

interface PageAnalytics {
  summary: Array<{
    page_path: string
    views: number
    unique_users: number
    unique_sessions: number
    avg_time_on_page: number
  }>
  topPages: Array<{ page_path: string; views: number }>
}

interface EmailAnalytics {
  summary: Array<{
    email_type: string
    total_sent: number
    total_opened: number
    total_clicked: number
    open_rate: number
    click_rate: number
  }>
}

interface MarketAnalytics {
  trading: {
    totalTransactions: number
    totalVolume: number
    subscriptionRevenue: number
  }
  popularMarkets: Array<{
    market: string
    transaction_count: number
    volume: number
  }>
  note?: string
}

export default function AnalyticsTab({ preloaded = false }: { preloaded?: boolean }) {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'pages' | 'emails' | 'markets'>('general')
  const [period, setPeriod] = useState('30d')
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [pageAnalytics, setPageAnalytics] = useState<PageAnalytics | null>(null)
  const [emailAnalytics, setEmailAnalytics] = useState<EmailAnalytics | null>(null)
  const [marketAnalytics, setMarketAnalytics] = useState<MarketAnalytics | null>(null)
  const [loading, setLoading] = useState(!preloaded)
  const [initialLoad, setInitialLoad] = useState(false)

  // Pre-load all analytics data on mount
  useEffect(() => {
    if (!initialLoad) {
      setInitialLoad(true)
      preloadAllAnalytics()
    }
  }, [initialLoad])

  // Fetch when period or sub-tab changes
  useEffect(() => {
    if (initialLoad) {
      fetchAnalytics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, activeSubTab, initialLoad])

  const preloadAllAnalytics = async () => {
    try {
      const [generalRes, pagesRes, emailsRes, marketsRes] = await Promise.allSettled([
        fetch(`/api/admin/analytics?period=${period}`),
        fetch(`/api/admin/analytics/pages?period=${period}`),
        fetch(`/api/admin/analytics/emails?period=${period}`),
        fetch(`/api/admin/analytics/markets?period=${period}`),
      ])

      if (generalRes.status === 'fulfilled' && generalRes.value.ok) {
        const data = await generalRes.value.json()
        setAnalytics(data)
      }
      if (pagesRes.status === 'fulfilled' && pagesRes.value.ok) {
        const data = await pagesRes.value.json()
        setPageAnalytics(data)
      }
      if (emailsRes.status === 'fulfilled' && emailsRes.value.ok) {
        const data = await emailsRes.value.json()
        setEmailAnalytics(data)
      }
      if (marketsRes.status === 'fulfilled' && marketsRes.value.ok) {
        const data = await marketsRes.value.json()
        setMarketAnalytics(data)
      }
      setLoading(false)
    } catch (error) {
      console.error('[Analytics] Error preloading:', error)
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      if (activeSubTab === 'general') {
        const response = await fetch(`/api/admin/analytics?period=${period}`)
        const data = await response.json()
        if (response.ok) setAnalytics(data)
      } else if (activeSubTab === 'pages') {
        const response = await fetch(`/api/admin/analytics/pages?period=${period}`)
        const data = await response.json()
        if (response.ok) setPageAnalytics(data)
      } else if (activeSubTab === 'emails') {
        const response = await fetch(`/api/admin/analytics/emails?period=${period}`)
        const data = await response.json()
        if (response.ok) setEmailAnalytics(data)
      } else if (activeSubTab === 'markets') {
        const response = await fetch(`/api/admin/analytics/markets?period=${period}`)
        const data = await response.json()
        if (response.ok) setMarketAnalytics(data)
      }
    } catch (error) {
      console.error('[Analytics] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Analytics</h2>
        <CustomSelect
          value={period}
          onChange={(value) => setPeriod(value)}
          options={[
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
            { value: 'all', label: 'All time' },
          ]}
          placeholder="Select Period"
          className="w-48"
        />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-700/50">
        {[
          { id: 'general', label: 'General' },
          { id: 'pages', label: 'Pages' },
          { id: 'emails', label: 'Emails' },
          { id: 'markets', label: 'Markets' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-4 py-2 border-b-2 transition-colors ${
              activeSubTab === tab.id
                ? 'border-gold-primary text-gold-primary'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-white">Loading analytics...</div>
      ) : (
        <>
          {activeSubTab === 'general' && analytics && <GeneralAnalytics data={analytics} />}
          {activeSubTab === 'pages' && pageAnalytics && <PageAnalyticsView data={pageAnalytics} />}
          {activeSubTab === 'emails' && emailAnalytics && <EmailAnalyticsView data={emailAnalytics} />}
          {activeSubTab === 'markets' && marketAnalytics && <MarketAnalyticsView data={marketAnalytics} />}
        </>
      )}
    </div>
  )
}

function GeneralAnalytics({ data }: { data: AnalyticsData }) {
  const userGrowthData = data.growth.users.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    users: d.count,
  }))

  const revenueGrowthData = data.growth.revenue.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: parseFloat(d.revenue.toString()),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm mb-2">User Growth</p>
          <p className="text-2xl font-bold text-white">{data.overview.newUsers}</p>
          <p className="text-xs text-gray-500 mt-1">New users in period</p>
        </div>
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm mb-2">Revenue</p>
          <p className="text-2xl font-bold text-white">
            ${data.overview.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Total revenue in period</p>
        </div>
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm mb-2">Active Subscriptions</p>
          <p className="text-2xl font-bold text-white">{data.overview.activeSubscriptions}</p>
          <p className="text-xs text-gray-500 mt-1">Currently active</p>
        </div>
      </div>

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">User Growth Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={userGrowthData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#fff' }} />
            <Legend />
            <Line type="monotone" dataKey="users" stroke="#3B82F6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Revenue Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={revenueGrowthData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#fff' }} />
            <Legend />
            <Bar dataKey="revenue" fill="#FBBF24" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function PageAnalyticsView({ data }: { data: PageAnalytics }) {
  const topPagesData = data.topPages.slice(0, 10).map((p) => ({
    page: p.page_path.replace('/', '') || 'Home',
    views: p.views,
  }))

  return (
    <div className="space-y-6">
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Top Pages</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={topPagesData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" stroke="#9CA3AF" />
            <YAxis dataKey="page" type="category" stroke="#9CA3AF" width={150} />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#fff' }} />
            <Bar dataKey="views" fill="#FBBF24" />
          </BarChart>
        </ResponsiveContainer>
      </div>

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Page Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700/50">
                <th className="text-left py-3 px-4 text-sm text-gray-400">Page</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Views</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Unique Users</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Avg Time</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.map((page, idx) => (
                <tr key={idx} className="border-b border-gray-700/30">
                  <td className="py-3 px-4 text-white">{page.page_path}</td>
                  <td className="py-3 px-4 text-white">{page.views}</td>
                  <td className="py-3 px-4 text-white">{page.unique_users}</td>
                  <td className="py-3 px-4 text-white">
                    {page.avg_time_on_page ? `${Math.round(page.avg_time_on_page)}s` : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EmailAnalyticsView({ data }: { data: EmailAnalytics }) {
  const emailData = data.summary.map((e) => ({
    type: e.email_type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    sent: e.total_sent,
    opened: e.total_opened,
    clicked: e.total_clicked,
    openRate: parseFloat(e.open_rate?.toString() || '0'),
    clickRate: parseFloat(e.click_rate?.toString() || '0'),
  }))

  return (
    <div className="space-y-6">
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Email Performance</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={emailData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="type" stroke="#9CA3AF" angle={-45} textAnchor="end" height={100} />
            <YAxis stroke="#9CA3AF" />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#fff' }} />
            <Legend />
            <Bar dataKey="sent" fill="#3B82F6" name="Sent" />
            <Bar dataKey="opened" fill="#10B981" name="Opened" />
            <Bar dataKey="clicked" fill="#FBBF24" name="Clicked" />
          </BarChart>
        </ResponsiveContainer>
      </div>

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Email Rates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {emailData.map((email, idx) => (
            <div key={idx} className="bg-dark-bg/40 p-4 rounded-lg border border-gray-700/30">
              <p className="text-white font-semibold mb-2">{email.type}</p>
              <div className="space-y-1">
                <p className="text-sm text-gray-400">
                  Open Rate: <span className="text-green-500">{email.openRate.toFixed(1)}%</span>
                </p>
                <p className="text-sm text-gray-400">
                  Click Rate: <span className="text-gold-primary">{email.clickRate.toFixed(1)}%</span>
                </p>
                <p className="text-sm text-gray-400">
                  Sent: {email.sent} | Opened: {email.opened} | Clicked: {email.clicked}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MarketAnalyticsView({ data }: { data: MarketAnalytics }) {
  const marketData = data.popularMarkets.slice(0, 10).map((m) => ({
    market: m.market || 'Unknown',
    transactions: m.transaction_count,
    volume: parseFloat(m.volume.toString()),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm mb-2">Total Transactions</p>
          <p className="text-2xl font-bold text-white">{data.trading.totalTransactions}</p>
        </div>
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm mb-2">Total Volume</p>
          <p className="text-2xl font-bold text-white">
            ${data.trading.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
          <p className="text-gray-400 text-sm mb-2">Subscription Revenue</p>
          <p className="text-2xl font-bold text-white">
            ${data.trading.subscriptionRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {data.note && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <p className="text-sm text-gray-400">{data.note}</p>
        </div>
      )}

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Popular Markets</h3>
        {marketData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={marketData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="market" stroke="#9CA3AF" angle={-45} textAnchor="end" height={100} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#fff' }} />
              <Legend />
              <Bar dataKey="transactions" fill="#3B82F6" name="Transactions" />
              <Bar dataKey="volume" fill="#FBBF24" name="Volume ($)" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400">No market data available yet</p>
        )}
      </div>
    </div>
  )
}

