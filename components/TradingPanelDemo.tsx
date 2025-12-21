'use client'

/**
 * TradingPanelDemo - Simplified version of TradingPanel for landing page demo
 * Shows the buy button instead of authenticate button
 */
const TradingPanelDemo = () => {
  return (
    <div className="flex flex-col bg-dark-bg">
      {/* Order Type Toggle */}
      <div className="border-b border-gray-700/50 p-3 flex-shrink-0">
        <div className="flex gap-2 items-center">
          <button
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 flex items-center justify-center gap-2 bg-dark-bg/60 text-gray-300 border border-gray-700/50"
          >
            <span className="uppercase tracking-wide" style={{ fontFamily: 'monospace' }}>
              Market
            </span>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Buy/Sell Tabs */}
      <div className="border-b border-gray-700/50 flex-shrink-0">
        <div className="flex items-center">
          <div className="flex flex-1">
            <button
              className="flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative text-green-400"
            >
              Buy
              <div className="absolute bottom-0 left-0 right-0 h-px bg-green-500" />
            </button>
            <button
              className="flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative text-gray-400"
            >
              Sell
            </button>
          </div>
        </div>
      </div>

      {/* UP/DOWN Selection */}
      <div className="p-4 border-b border-gray-700/50 space-y-3">
        <div className="flex gap-2">
          <button className="flex-1 px-4 py-3 bg-green-500/10 border border-green-500 text-green-400 rounded-lg text-sm font-semibold">
            UP
            <div className="text-xs text-gray-400 mt-1">59¢</div>
          </button>
          <button className="flex-1 px-4 py-3 bg-dark-bg/50 border border-gray-700/50 text-gray-400 rounded-lg text-sm font-semibold">
            DOWN
            <div className="text-xs text-gray-400 mt-1">43¢</div>
          </button>
        </div>
      </div>

      {/* Shares Input */}
      <div className="p-4 border-b border-gray-700/50 space-y-3">
        <div className="text-xs uppercase text-gray-400 font-semibold tracking-wider mb-2">Shares</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 bg-dark-bg/50 border border-gray-700/50 rounded text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <input
            type="text"
            value="0"
            readOnly
            className="flex-1 px-4 py-2 bg-dark-bg/50 border border-gray-700/50 rounded text-white text-center text-sm"
          />
          <button className="px-3 py-2 bg-dark-bg/50 border border-gray-700/50 rounded text-gray-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button className="px-3 py-2 bg-dark-bg/50 border border-gray-700/50 rounded text-gray-400 hover:text-white transition-colors text-xs">
            Reset
          </button>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-dark-bg/50 border border-gray-700/50 rounded text-xs text-gray-400 hover:text-white transition-colors">0.001</button>
          <button className="px-3 py-1.5 bg-dark-bg/50 border border-gray-700/50 rounded text-xs text-gray-400 hover:text-white transition-colors">0.1</button>
          <button className="px-3 py-1.5 bg-dark-bg/50 border border-gray-700/50 rounded text-xs text-gray-400 hover:text-white transition-colors">0.15</button>
          <button className="px-3 py-1.5 bg-dark-bg/50 border border-gray-700/50 rounded text-xs text-gray-400 hover:text-white transition-colors">10</button>
        </div>
      </div>

      {/* Main Action Button - BUY instead of AUTHENTICATE */}
      <div className="p-4 flex-shrink-0">
        <button
          className="w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 border bg-green-500/10 border-green-500 text-green-400 hover:bg-green-500/20"
        >
          BUY UP
        </button>
      </div>
    </div>
  )
}

export default TradingPanelDemo

