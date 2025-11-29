'use client'

import { useState } from 'react'
import PolyLineChart from '@/components/PolyLineChart'
import TradingViewChart from '@/components/TradingViewChart'
import TradingPanel from '@/components/TradingPanel'
import ChartControls from '@/components/ChartControls'
import OrderBook from '@/components/OrderBook'
import { TradingProvider, useTradingContext } from '@/contexts/TradingContext'

function TerminalContent() {
  const { selectedPair, showTradingView } = useTradingContext()
  const [activeTab, setActiveTab] = useState<'position' | 'orders' | 'history' | 'orderbook'>('position')

  // Mock data for different assets
  const positionData = [
    { market: 'Trump 2024', asset: 'BTC', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'Momentum Breakout', size: 100, entryPrice: '45¢', currentPrice: '52¢', pnl: '+$7.00', pnlColor: 'text-green-400' },
    { market: 'BTC > $100k', asset: 'BTC', side: 'Sell No', sideColor: 'text-red-400', strategy: 'Manual', strategyColor: 'text-gray-500', size: 50, entryPrice: '38¢', currentPrice: '35¢', pnl: '-$1.50', pnlColor: 'text-red-400' },
    { market: 'SOL > $200', asset: 'SOL', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'RSI Reversal', size: 150, entryPrice: '28¢', currentPrice: '32¢', pnl: '+$6.00', pnlColor: 'text-green-400' },
    { market: 'ETH > $5k', asset: 'ETH', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'MACD Crossover', size: 200, entryPrice: '31¢', currentPrice: '35¢', pnl: '+$8.00', pnlColor: 'text-green-400' },
    { market: 'XRP > $2', asset: 'XRP', side: 'Sell No', sideColor: 'text-red-400', strategy: 'Bollinger Squeeze', size: 75, entryPrice: '42¢', currentPrice: '38¢', pnl: '+$3.00', pnlColor: 'text-green-400' },
  ]

  const ordersData = [
    { market: 'ETH > $5k', asset: 'ETH', type: 'Limit', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'RSI Reversal', size: 75, limitPrice: '42¢' },
    { market: 'SOL > $200', asset: 'SOL', type: 'Limit', side: 'Sell No', sideColor: 'text-red-400', strategy: 'Manual', strategyColor: 'text-gray-500', size: 150, limitPrice: '28¢' },
    { market: 'BTC > $100k', asset: 'BTC', type: 'Limit', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'Momentum Breakout', size: 100, limitPrice: '45¢' },
    { market: 'XRP > $2', asset: 'XRP', type: 'Limit', side: 'Sell No', sideColor: 'text-red-400', strategy: 'Manual', strategyColor: 'text-gray-500', size: 80, limitPrice: '40¢' },
  ]

  const historyData = [
    { time: '2:45 PM', market: 'Trump 2024', asset: 'BTC', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'Momentum Breakout', size: 100, price: '45¢', total: '$45.00' },
    { time: '1:30 PM', market: 'BTC > $100k', asset: 'BTC', side: 'Sell No', sideColor: 'text-red-400', strategy: 'Manual', strategyColor: 'text-gray-500', size: 50, price: '38¢', total: '$19.00' },
    { time: '12:15 PM', market: 'ETH > $5k', asset: 'ETH', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'MACD Crossover', size: 200, price: '31¢', total: '$62.00' },
    { time: '11:00 AM', market: 'SOL > $200', asset: 'SOL', side: 'Buy Yes', sideColor: 'text-green-400', strategy: 'RSI Reversal', size: 150, price: '28¢', total: '$42.00' },
    { time: '10:30 AM', market: 'XRP > $2', asset: 'XRP', side: 'Sell No', sideColor: 'text-red-400', strategy: 'Bollinger Squeeze', size: 75, price: '42¢', total: '$31.50' },
  ]

  // Filter data based on selected pair
  const filteredPositions = positionData.filter(pos => pos.asset === selectedPair)
  const filteredOrders = ordersData.filter(order => order.asset === selectedPair)
  const filteredHistory = historyData.filter(hist => hist.asset === selectedPair)

  const bottomSectionHeightClass =
    activeTab === 'orderbook' ? 'h-[23rem]' : 'h-72'

  return (
    <div className="bg-black text-white">
      {/* Main Section - Chart and Trading Panel */}
      <div className="flex flex-col h-[calc(100vh-73px)] overflow-hidden">
        <div className="flex-1 flex flex-col lg:flex-row relative">
          {/* Left Panel - Chart */}
          <div className="flex-1 flex flex-col min-h-0">
            <ChartControls />
            <div className="flex-1 min-h-0 relative">
              {showTradingView ? <TradingViewChart /> : <PolyLineChart />}
            </div>
          </div>

          {/* Right Panel - Trading */}
          <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-800 flex-shrink-0">
            <TradingPanel />
          </div>
        </div>
      </div>

      {/* Horizontal Divider Line */}
      <div className="h-px bg-gray-800 w-full" />

      {/* Bottom Section - Position, Orders, History, Order Book */}
      <div className={`bg-black ${bottomSectionHeightClass}`}>
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab('position')}
            className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'position'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Position
            {activeTab === 'position' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'orders'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Open Orders
            {activeTab === 'orders' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'history'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            History
            {activeTab === 'history' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('orderbook')}
            className={`px-4 py-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'orderbook'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Order Book
            {activeTab === 'orderbook' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-primary" />
            )}
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-49px)]">
          {activeTab === 'position' && (
            <div className="w-full">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Market</th>
                    <th className="text-left py-3 px-4 font-medium">Side</th>
                    <th className="text-left py-3 px-4 font-medium">Strategy</th>
                    <th className="text-right py-3 px-4 font-medium">Size</th>
                    <th className="text-right py-3 px-4 font-medium">Entry Price</th>
                    <th className="text-right py-3 px-4 font-medium">Current Price</th>
                    <th className="text-right py-3 px-4 font-medium">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.length > 0 ? (
                    filteredPositions.map((position, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-white">{position.market}</td>
                        <td className="py-3 px-4">
                          <span className={position.sideColor}>{position.side}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs ${position.strategyColor || 'text-gray-400'}`}>{position.strategy}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{position.size}</td>
                        <td className="py-3 px-4 text-right text-gray-400">{position.entryPrice}</td>
                        <td className="py-3 px-4 text-right text-white">{position.currentPrice}</td>
                        <td className={`py-3 px-4 text-right ${position.pnlColor}`}>{position.pnl}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                        No positions for {selectedPair}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'orders' && (
            <div className="w-full">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Market</th>
                    <th className="text-left py-3 px-4 font-medium">Type</th>
                    <th className="text-left py-3 px-4 font-medium">Side</th>
                    <th className="text-left py-3 px-4 font-medium">Strategy</th>
                    <th className="text-right py-3 px-4 font-medium">Size</th>
                    <th className="text-right py-3 px-4 font-medium">Limit Price</th>
                    <th className="text-right py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map((order, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-white">{order.market}</td>
                        <td className="py-3 px-4 text-gray-400">{order.type}</td>
                        <td className="py-3 px-4">
                          <span className={order.sideColor}>{order.side}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs ${order.strategyColor || 'text-gray-400'}`}>{order.strategy}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{order.size}</td>
                        <td className="py-3 px-4 text-right text-white">{order.limitPrice}</td>
                        <td className="py-3 px-4 text-right">
                          <button className="text-red-400 hover:text-red-300 text-xs">Cancel</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                        No open orders for {selectedPair}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'history' && (
            <div className="w-full">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Time</th>
                    <th className="text-left py-3 px-4 font-medium">Market</th>
                    <th className="text-left py-3 px-4 font-medium">Side</th>
                    <th className="text-left py-3 px-4 font-medium">Strategy</th>
                    <th className="text-right py-3 px-4 font-medium">Size</th>
                    <th className="text-right py-3 px-4 font-medium">Price</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((hist, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-gray-400">{hist.time}</td>
                        <td className="py-3 px-4 text-white">{hist.market}</td>
                        <td className="py-3 px-4">
                          <span className={hist.sideColor}>{hist.side}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs ${hist.strategyColor || 'text-gray-400'}`}>{hist.strategy}</span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{hist.size}</td>
                        <td className="py-3 px-4 text-right text-white">{hist.price}</td>
                        <td className="py-3 px-4 text-right text-white">{hist.total}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                        No history for {selectedPair}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'orderbook' && (
            <div className="w-full h-full">
              <OrderBook />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <TradingProvider>
      <TerminalContent />
    </TradingProvider>
  )
}

