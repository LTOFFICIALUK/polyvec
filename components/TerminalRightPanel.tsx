'use client'

import { useState } from 'react'
import TradingPanel from './TradingPanel'
import MarketInsights from './MarketInsights'
import OrderBook from './OrderBook'

const TerminalRightPanel = () => {
  const [isOrderBookExpanded, setIsOrderBookExpanded] = useState(false)
  const [isMarketInsightsExpanded, setIsMarketInsightsExpanded] = useState(false)

  return (
    <div className="w-80 border-l border-gray-700/50 h-full flex flex-col overflow-y-auto">
      {/* Trade Interface */}
      <div className="flex-shrink-0 bg-dark-bg border-b border-gray-700/50">
        <div className="px-4 py-2.5 border-b border-gray-700/50 flex items-center justify-between bg-dark-bg/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gold-primary/60"></div>
            <span className="text-xs font-medium text-gray-300 tracking-wider uppercase" style={{ fontFamily: 'monospace' }}>
              TRADE INTERFACE
            </span>
          </div>
        </div>
        <div className="p-0">
          <TradingPanel />
        </div>
      </div>

      {/* OrderBook - Collapsible */}
      <div className={`flex flex-col border-t border-gray-700/50 flex-shrink-0`}>
        <button
          onClick={() => setIsOrderBookExpanded(!isOrderBookExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-dark-bg/40 transition-colors bg-dark-bg/40 border-b border-gray-700/50 flex-shrink-0"
          style={{ fontFamily: 'monospace' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gold-primary/60"></div>
            <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">
              Orderbook
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOrderBookExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOrderBookExpanded && (
          <div className="flex-shrink-0" style={{ height: '400px' }}>
            <OrderBook />
          </div>
        )}
      </div>

      {/* Market Insights - Collapsible */}
      <div className={`flex flex-col border-t border-gray-700/50 flex-shrink-0`}>
        <button
          onClick={() => setIsMarketInsightsExpanded(!isMarketInsightsExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-dark-bg/40 transition-colors bg-dark-bg/40 border-b border-gray-700/50 flex-shrink-0"
          style={{ fontFamily: 'monospace' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gold-primary/60"></div>
            <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">
              Market Insights
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isMarketInsightsExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isMarketInsightsExpanded && (
          <div className="flex-shrink-0">
            <MarketInsights />
          </div>
        )}
      </div>
    </div>
  )
}

export default TerminalRightPanel

