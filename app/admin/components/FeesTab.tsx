'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import CustomSelect from './CustomSelect'

interface FeeData {
  id: number
  userId: number
  walletAddress: string
  userEmail: string | null
  username: string | null
  tradeAmount: number
  feeAmount: number
  feeRate: number
  transactionHash: string | null
  orderId: string | null
  tokenId: string | null
  side: string
  shares: number | null
  price: number | null
  status: 'collected' | 'failed' | 'pending'
  createdAt: string
  collectedAt: string | null
}

interface FeesResponse {
  success: boolean
  summary: {
    totalFees: number
    collectedFees: number
    failedFees: number
    pendingFees: number
    totalCollected: number
    totalFailed: number
    totalTradeVolume: number
    avgFee: number
  }
  fees: FeeData[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  dailyData: Array<{
    date: string
    feeCount: number
    collectedAmount: number
    tradeVolume: number
  }>
}

export default function FeesTab({ preloaded = false }: { preloaded?: boolean }) {
  const [period, setPeriod] = useState('30d')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<FeesResponse | null>(null)
  const [loading, setLoading] = useState(!preloaded)

  useEffect(() => {
    fetchFees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, page])

  const fetchFees = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/fees?period=${period}&page=${page}&limit=50`)
      if (response.ok) {
        const feesData = await response.json()
        setData(feesData)
      } else {
        console.error('[FeesTab] Failed to fetch fees:', response.statusText)
      }
    } catch (error) {
      console.error('[FeesTab] Error fetching fees:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !data) {
    return <div className="text-white">Loading fees data...</div>
  }

  if (!data) {
    return <div className="text-white">No fees data available</div>
  }

  const { summary, fees, pagination, dailyData } = data

  // Format chart data
  const chartData = dailyData.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    collected: item.collectedAmount,
    volume: item.tradeVolume,
    count: item.feeCount,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Trading Fees</h2>
        <CustomSelect
          value={period}
          onChange={(value) => {
            setPeriod(value)
            setPage(1)
          }}
          options={[
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
            { value: 'all', label: 'All time' },
          ]}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-1">Total Fees Collected</p>
          <p className="text-2xl font-bold text-green-400">
            ${summary.totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">{summary.collectedFees} successful collections</p>
        </div>

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-1">Total Trade Volume</p>
          <p className="text-2xl font-bold text-white">
            ${summary.totalTradeVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Volume generating fees</p>
        </div>

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-1">Average Fee</p>
          <p className="text-2xl font-bold text-gold-primary">
            ${summary.avgFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Per transaction</p>
        </div>

        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-1">Failed Collections</p>
          <p className="text-2xl font-bold text-red-400">
            {summary.failedFees}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            ${summary.totalFailed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lost
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Fee Collection */}
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Fee Collection</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#F3F4F6' }}
              />
              <Legend />
              <Bar dataKey="collected" fill="#10B981" name="Fees Collected ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Trade Volume */}
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Trade Volume</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#F3F4F6' }}
              />
              <Legend />
              <Line type="monotone" dataKey="volume" stroke="#3B82F6" name="Trade Volume ($)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fees Table */}
      <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-700/50">
          <h3 className="text-lg font-semibold text-white">Fee Collection History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-bg/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Trade Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Fee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Transaction</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {fees.map((fee) => (
                <tr key={fee.id} className="hover:bg-dark-bg/40">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-white">
                      {fee.userEmail || fee.username || `User #${fee.userId}`}
                    </div>
                    <div className="text-xs text-gray-400">
                      {fee.walletAddress.substring(0, 10)}...
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-white">
                    ${fee.tradeAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gold-primary font-semibold">
                    ${fee.feeAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        fee.status === 'collected'
                          ? 'bg-green-500/20 text-green-400'
                          : fee.status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {fee.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {fee.transactionHash ? (
                      <a
                        href={`https://polygonscan.com/tx/${fee.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-xs"
                      >
                        {fee.transactionHash.substring(0, 10)}...
                      </a>
                    ) : (
                      <span className="text-gray-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                    {new Date(fee.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-700/50 flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Showing {((page - 1) * pagination.limit) + 1} to {Math.min(page * pagination.limit, pagination.total)} of {pagination.total} fees
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-dark-bg/60 border border-gray-700/50 rounded text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-dark-bg/80"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 text-sm bg-dark-bg/60 border border-gray-700/50 rounded text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-dark-bg/80"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

