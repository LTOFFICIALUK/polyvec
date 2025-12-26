'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import CustomSelect from './CustomSelect'
import { useAuth } from '@/contexts/AuthContext'

interface EmailAnalytics {
  summary: Array<{
    email_type: string
    total_sent: number
    total_opened: number
    total_clicked: number
    total_bounced: number
    open_rate: number
    click_rate: number
  }>
  campaigns: Array<{
    campaign_id: string
    name: string
    subject: string
    status: string
    total_recipients: number
    total_sent: number
    total_opened: number
    total_clicked: number
    sent_at: string | null
    created_at: string
  }>
  performanceOverTime: Array<{
    date: string
    email_type: string
    sent: number
    opened: number
    clicked: number
  }>
}

interface EmailSubscriptions {
  subscriptions: Array<{
    id: number
    email: string
    source: string
    created_at: string
  }>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  sourceBreakdown: Array<{
    source: string
    count: number
  }>
}

export default function EmailsTab({ preloaded = false }: { preloaded?: boolean }) {
  const { user } = useAuth()
  const [period, setPeriod] = useState('30d')
  const [emailType, setEmailType] = useState('')
  const [data, setData] = useState<EmailAnalytics | null>(null)
  const [loading, setLoading] = useState(!preloaded)
  const [initialLoad, setInitialLoad] = useState(false)
  const [testEmailLoading, setTestEmailLoading] = useState<string | null>(null)
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string; email?: string } | null>(null)
  const [subscriptions, setSubscriptions] = useState<EmailSubscriptions | null>(null)
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)
  const [subscriptionsPage, setSubscriptionsPage] = useState(1)
  const [subscriptionsSource, setSubscriptionsSource] = useState('')

  // Pre-load data on mount
  useEffect(() => {
    if (!initialLoad) {
      setInitialLoad(true)
      fetchData()
      fetchSubscriptions()
    }
  }, [initialLoad])

  // Fetch when filters change
  useEffect(() => {
    if (initialLoad) {
      fetchData()
    }
  }, [period, emailType, initialLoad])

  // Fetch subscriptions when page or source changes
  useEffect(() => {
    if (initialLoad) {
      fetchSubscriptions()
    }
  }, [subscriptionsPage, subscriptionsSource, initialLoad])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (emailType) params.append('emailType', emailType)

      const response = await fetch(`/api/admin/analytics/emails?${params}`)
      const data = await response.json()

      if (response.ok) {
        setData(data)
      }
    } catch (error) {
      console.error('[Email Analytics] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSubscriptions = async () => {
    setSubscriptionsLoading(true)
    try {
      const params = new URLSearchParams({
        page: subscriptionsPage.toString(),
        limit: '50',
      })
      if (subscriptionsSource) {
        params.append('source', subscriptionsSource)
      }

      const response = await fetch(`/api/admin/emails/subscriptions?${params}`)
      const data = await response.json()

      if (response.ok) {
        setSubscriptions(data)
      }
    } catch (error) {
      console.error('[Email Subscriptions] Error:', error)
    } finally {
      setSubscriptionsLoading(false)
    }
  }

  const sendTestEmail = async (emailType: string) => {
    if (!user) {
      setTestEmailResult({ success: false, message: 'Please log in to test emails' })
      return
    }

    setTestEmailLoading(emailType)
    setTestEmailResult(null)

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
        setTestEmailResult({ success: true, message: data.message, email: data.email })
      } else {
        setTestEmailResult({ success: false, message: data.error || 'Failed to send email' })
      }
    } catch (error: any) {
      setTestEmailResult({ success: false, message: error.message || 'Failed to send email' })
    } finally {
      setTestEmailLoading(null)
    }
  }

  if (loading) {
    return <div className="text-white">Loading email analytics...</div>
  }

  if (!data) {
    return <div className="text-white">No data available</div>
  }

  const performanceData = data.performanceOverTime.map((p) => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sent: p.sent,
    opened: p.opened,
    clicked: p.clicked,
  }))

  const emailTypes = [
    { id: 'welcome-pro', label: 'Welcome to Pro', description: 'Sent when user upgrades to Pro' },
    { id: 'payment-confirmation', label: 'Payment Confirmation', description: 'Sent after successful payment' },
    { id: 'payment-failed', label: 'Payment Failed', description: 'Sent when payment fails' },
    { id: 'subscription-cancelled', label: 'Subscription Cancelled', description: 'Sent when subscription is cancelled' },
    { id: 'renewal-reminder', label: 'Renewal Reminder', description: 'Sent before subscription renewal' },
  ]

  return (
    <div className="space-y-6">
      {/* Test Email Section */}
      <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white mb-2">Test Email Templates</h3>
          <p className="text-gray-400 text-sm">
            Test email templates will be sent to: <strong className="text-gold-primary">{user?.email}</strong>
          </p>
        </div>

        {testEmailResult && (
          <div
            className={`mb-4 p-4 rounded-lg border ${
              testEmailResult.success
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <p className="font-semibold">{testEmailResult.success ? '✅ Success' : '❌ Error'}</p>
            <p className="text-sm mt-1">{testEmailResult.message}</p>
            {testEmailResult.email && (
              <p className="text-xs mt-2 opacity-75">Sent to: {testEmailResult.email}</p>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {emailTypes.map((emailType) => (
            <div
              key={emailType.id}
              className="bg-dark-bg/40 border border-gray-700/50 rounded-lg p-4"
            >
              <h4 className="text-sm font-semibold text-white mb-1">{emailType.label}</h4>
              <p className="text-xs text-gray-400 mb-3">{emailType.description}</p>
              <button
                onClick={() => sendTestEmail(emailType.id)}
                disabled={testEmailLoading === emailType.id}
                className="w-full px-4 py-2 bg-gold-primary hover:bg-gold-primary/90 text-black font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {testEmailLoading === emailType.id ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Email Analytics</h2>
        <div className="flex gap-4">
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
          <CustomSelect
            value={emailType}
            onChange={(value) => setEmailType(value)}
            options={[
              { value: '', label: 'All Email Types' },
              { value: 'welcome-pro', label: 'Welcome Pro' },
              { value: 'payment-confirmation', label: 'Payment Confirmation' },
              { value: 'payment-failed', label: 'Payment Failed' },
              { value: 'subscription-cancelled', label: 'Subscription Cancelled' },
              { value: 'campaign', label: 'Campaign' },
            ]}
            placeholder="All Email Types"
            className="w-56"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {data.summary.map((email, idx) => (
          <div key={idx} className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
            <p className="text-gray-400 text-sm mb-2 capitalize">{email.email_type.replace(/-/g, ' ')}</p>
            <p className="text-2xl font-bold text-white mb-4">{email.total_sent}</p>
            <div className="space-y-1">
              <p className="text-sm text-gray-400">
                Open Rate: <span className="text-green-500">{email.open_rate?.toFixed(1)}%</span>
              </p>
              <p className="text-sm text-gray-400">
                Click Rate: <span className="text-gold-primary">{email.click_rate?.toFixed(1)}%</span>
              </p>
              <p className="text-sm text-gray-400">
                Opened: {email.total_opened} | Clicked: {email.total_clicked}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Performance Over Time */}
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Email Performance Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={performanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#fff' }} />
            <Legend />
            <Line type="monotone" dataKey="sent" stroke="#3B82F6" strokeWidth={2} name="Sent" />
            <Line type="monotone" dataKey="opened" stroke="#10B981" strokeWidth={2} name="Opened" />
            <Line type="monotone" dataKey="clicked" stroke="#FBBF24" strokeWidth={2} name="Clicked" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Campaigns List */}
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Campaigns</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700/50">
                <th className="text-left py-3 px-4 text-sm text-gray-400">Campaign</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Status</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Recipients</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Sent</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Opened</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Clicked</th>
                <th className="text-left py-3 px-4 text-sm text-gray-400">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((campaign) => (
                <tr key={campaign.campaign_id} className="border-b border-gray-700/30">
                  <td className="py-3 px-4 text-white">{campaign.name}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 text-xs rounded ${
                      campaign.status === 'sent' ? 'bg-green-500/20 text-green-500 border border-green-500/30' :
                      campaign.status === 'sending' ? 'bg-blue-500/20 text-blue-500 border border-blue-500/30' :
                      'bg-dark-bg/40 text-gray-300 border border-gray-700/50'
                    }`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-white">{campaign.total_recipients}</td>
                  <td className="py-3 px-4 text-white">{campaign.total_sent}</td>
                  <td className="py-3 px-4 text-white">{campaign.total_opened}</td>
                  <td className="py-3 px-4 text-white">{campaign.total_clicked}</td>
                  <td className="py-3 px-4 text-gray-400 text-sm">
                    {campaign.sent_at 
                      ? new Date(campaign.sent_at).toLocaleDateString()
                      : new Date(campaign.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Email List Subscriptions */}
      <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Email List Subscriptions</h3>
            <p className="text-gray-400 text-sm">
              {subscriptions ? `${subscriptions.pagination.total.toLocaleString()} total subscribers` : 'Loading...'}
            </p>
          </div>
          <div className="flex gap-4">
            <CustomSelect
              value={subscriptionsSource}
              onChange={(value) => {
                setSubscriptionsSource(value)
                setSubscriptionsPage(1)
              }}
              options={[
                { value: '', label: 'All Sources' },
                ...(subscriptions?.sourceBreakdown.map((s) => ({
                  value: s.source,
                  label: `${s.source} (${s.count})`,
                })) || []),
              ]}
              placeholder="Filter by Source"
              className="w-48"
            />
          </div>
        </div>

        {subscriptionsLoading ? (
          <div className="text-white py-8 text-center">Loading subscriptions...</div>
        ) : subscriptions && subscriptions.subscriptions.length > 0 ? (
          <>
            <div className="overflow-x-auto mb-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    <th className="text-left py-3 px-4 text-sm text-gray-400">Email</th>
                    <th className="text-left py-3 px-4 text-sm text-gray-400">Source</th>
                    <th className="text-left py-3 px-4 text-sm text-gray-400">Subscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.subscriptions.map((sub) => (
                    <tr key={sub.id} className="border-b border-gray-700/30">
                      <td className="py-3 px-4 text-white">{sub.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 text-xs rounded bg-gray-700/50 text-gray-300 border border-gray-700/50">
                          {sub.source || 'landing_page'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {new Date(sub.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {subscriptions.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
                <p className="text-gray-400 text-sm">
                  Page {subscriptions.pagination.page} of {subscriptions.pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSubscriptionsPage((p) => Math.max(1, p - 1))}
                    disabled={subscriptions.pagination.page === 1}
                    className="px-4 py-2 bg-dark-bg/60 border border-gray-700/50 text-white rounded-md hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setSubscriptionsPage((p) => Math.min(subscriptions.pagination.totalPages, p + 1))}
                    disabled={subscriptions.pagination.page === subscriptions.pagination.totalPages}
                    className="px-4 py-2 bg-dark-bg/60 border border-gray-700/50 text-white rounded-md hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Source Breakdown */}
            {subscriptions.sourceBreakdown.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-700/50">
                <h4 className="text-sm font-semibold text-white mb-3">Subscriptions by Source</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {subscriptions.sourceBreakdown.map((source) => (
                    <div key={source.source} className="bg-dark-bg/40 border border-gray-700/50 rounded-lg p-4">
                      <p className="text-gray-400 text-xs mb-1">{source.source || 'Unknown'}</p>
                      <p className="text-2xl font-bold text-white">{source.count.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-400 py-8 text-center">No subscriptions found</div>
        )}
      </div>
    </div>
  )
}

