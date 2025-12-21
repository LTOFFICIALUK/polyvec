'use client'

import { TradingProvider } from '@/contexts/TradingContext'
import PolyLineChart from '@/components/PolyLineChart'
import TradingViewChart from '@/components/TradingViewChart'
import ChartControls from '@/components/ChartControls'
import TradingPanelDemo from '@/components/TradingPanelDemo'

/**
 * TerminalDemo - Shows the actual terminal interface in preview mode
 * This component renders the real terminal components but in a read-only/preview state
 */
const TerminalDemoContent = () => {
  return (
    <div className="bg-dark-bg text-white h-[600px] overflow-hidden relative">
      {/* Full Screen Chart */}
      <div className="absolute inset-0 flex flex-col">
        <ChartControls />
        <div className="flex-1 min-h-0 relative">
          {/* Side-by-Side View (Poly Orderbook + TradingView) */}
          <div className="w-full h-full flex">
            {/* Left: Poly Orderbook Chart */}
            <div className="flex-1 border-r border-gray-700/50">
              <PolyLineChart />
            </div>
            {/* Right: TradingView Chart */}
            <div className="flex-1">
              <TradingViewChart />
            </div>
          </div>
        </div>
      </div>
      
      {/* Trading Panel - Positioned to not cover URL bar */}
      <div className="absolute left-4 top-16 z-40 w-80 max-h-[500px] overflow-y-auto">
        <div className="bg-dark-bg border border-gray-700/50 rounded-lg backdrop-blur-sm">
          <div className="px-4 py-2.5 border-b border-gray-700/50 flex items-center justify-between bg-dark-bg/40">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gold-primary/60"></div>
              <span className="text-xs font-medium text-gray-300 tracking-wider uppercase" style={{ fontFamily: 'monospace' }}>
                TRADE INTERFACE
              </span>
            </div>
          </div>
          <div className="p-4">
            <TradingPanelDemo />
          </div>
        </div>
      </div>
    </div>
  )
}

const TerminalDemo = () => {
  return (
    <TradingProvider>
      <TerminalDemoContent />
    </TradingProvider>
  )
}

export default TerminalDemo

