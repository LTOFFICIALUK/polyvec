'use client'

import { useState } from 'react'

/**
 * AnalyticsDemo - Shows the actual analytics interface in preview mode
 */
const AnalyticsDemo = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'performance' | 'markets'>('overview')

  return (
    <div className="bg-dark-bg text-white h-[600px] overflow-hidden relative">
      <div className="h-full overflow-y-auto">
        <div className="px-4 sm:px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Analytics</h1>
                <p className="text-sm text-gray-400 mt-1">
                  Your trading performance insights
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                  activeTab === 'overview' ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Overview
                {activeTab === 'overview' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('trades')}
                className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                  activeTab === 'trades' ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Trade Details
                {activeTab === 'trades' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('performance')}
                className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                  activeTab === 'performance' ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Performance
                {activeTab === 'performance' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('markets')}
                className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
                  activeTab === 'markets' ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Markets
                {activeTab === 'markets' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
                )}
              </button>
            </div>
          </div>

          {/* Overview Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total PnL */}
                <div className="md:col-span-2 bg-gradient-to-br from-dark-bg/80 to-dark-bg/40 rounded-xl p-6 border border-gold-primary/20 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-gray-400 uppercase tracking-wider">Total Profit & Loss</div>
                    <div className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                      PROFITABLE
                    </div>
                  </div>
                  <div className="text-5xl font-bold mb-2 text-green-400">
                    +$1,234.56
                  </div>
                  <div className="text-xs text-gray-500">Across 45 closed positions</div>
                </div>

                {/* Win Rate */}
                <div className="bg-dark-bg/60 rounded-xl p-6 border border-gray-800">
                  <div className="text-sm text-gray-400 mb-4 uppercase tracking-wider">Win Rate</div>
                  <div className="flex items-end gap-3 mb-4">
                    <div className="text-4xl font-bold text-green-400">
                      68.5%
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex-1">
                      <div className="text-gray-500 text-xs mb-1">Wins</div>
                      <div className="text-green-400 font-semibold">31</div>
                    </div>
                    <div className="w-px h-8 bg-gray-800"></div>
                    <div className="flex-1">
                      <div className="text-gray-500 text-xs mb-1">Losses</div>
                      <div className="text-red-400 font-semibold">14</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trading Activity */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Total Trades</div>
                  <div className="text-3xl font-bold text-white mb-1">127</div>
                  <div className="text-xs text-gray-500">All-time activity</div>
                </div>

                <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Trading Frequency</div>
                  <div className="text-2xl font-bold text-white mb-1">12/month</div>
                  <div className="text-xs text-gray-500">Unique markets traded</div>
                </div>

                <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Avg Trade Size</div>
                  <div className="text-3xl font-bold text-white mb-1">$45.20</div>
                  <div className="text-xs text-gray-500">Per transaction</div>
                </div>

                <div className="bg-dark-bg/60 rounded-lg p-5 border border-gray-800">
                  <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Avg Price</div>
                  <div className="text-3xl font-bold text-white mb-1">52¢</div>
                  <div className="text-xs text-gray-500">Per share</div>
                </div>
              </div>
            </div>
          )}

          {/* Other tabs show placeholder */}
          {activeTab !== 'overview' && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500">Preview of {activeTab} tab</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnalyticsDemo

