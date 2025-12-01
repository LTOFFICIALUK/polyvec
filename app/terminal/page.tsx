'use client'

import { useState, useEffect, useCallback } from 'react'
import PolyLineChart from '@/components/PolyLineChart'
import TradingViewChart from '@/components/TradingViewChart'
import TradingPanel from '@/components/TradingPanel'
import ChartControls from '@/components/ChartControls'
import AnimatedPrice from '@/components/AnimatedPrice'
import { TradingProvider, useTradingContext } from '@/contexts/TradingContext'
import { useWallet } from '@/contexts/WalletContext'

interface Position {
  market: string
  outcome: string
  side: string
  size: number
  avgPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  tokenId: string
  conditionId: string
}

interface Order {
  id: string
  market: string
  outcome: string
  type: string
  side: string
  size: number
  price: number
  status: string
  createdAt: string
}

interface Trade {
  id: string
  market: string
  outcome: string
  side: string
  size: number
  price: number
  total: number
  timestamp: string
}

function TerminalContent() {
  const { selectedPair, showTradingView } = useTradingContext()
  const { walletAddress, polymarketCredentials } = useWallet()
  const [activeTab, setActiveTab] = useState<'position' | 'orders' | 'history'>('position')
  
  // Real data from Polymarket
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Fetch positions from Polymarket
  const fetchPositions = useCallback(async () => {
    if (!walletAddress) return
    
    try {
      const response = await fetch(`/api/user/positions?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        const formattedPositions: Position[] = (data.positions || []).map((pos: any) => ({
          market: pos.title || pos.market || pos.question || 'Unknown Market',
          outcome: pos.outcome || (pos.side === 'BUY' ? 'Yes' : 'No'),
          side: pos.side || 'BUY',
          size: parseFloat(pos.size || pos.shares || '0'),
          avgPrice: parseFloat(pos.avgPrice || pos.average_price || pos.entry_price || '0'),
          currentPrice: parseFloat(pos.currentPrice || pos.current_price || pos.price || '0'),
          pnl: parseFloat(pos.pnl || pos.profit_loss || '0'),
          pnlPercent: parseFloat(pos.pnlPercent || pos.profit_loss_percent || '0'),
          tokenId: pos.tokenId || pos.token_id || pos.asset || '',
          conditionId: pos.conditionId || pos.condition_id || '',
        }))
        setPositions(formattedPositions)
      }
    } catch (error) {
      console.error('[Terminal] Error fetching positions:', error)
    }
  }, [walletAddress])

  // Fetch open orders from Polymarket
  const fetchOrders = useCallback(async () => {
    if (!walletAddress) return
    
    try {
      const response = await fetch(`/api/user/orders?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        const formattedOrders: Order[] = (data.orders || []).map((order: any) => ({
          id: order.id || order.order_id || '',
          market: order.market || order.title || 'Unknown Market',
          outcome: order.outcome || (order.side === 'BUY' ? 'Yes' : 'No'),
          type: order.type || order.order_type || 'Limit',
          side: order.side || 'BUY',
          size: parseFloat(order.size || order.original_size || '0'),
          price: parseFloat(order.price || '0'),
          status: order.status || 'live',
          createdAt: order.created_at || order.createdAt || new Date().toISOString(),
        }))
        setOrders(formattedOrders)
      }
    } catch (error) {
      console.error('[Terminal] Error fetching orders:', error)
    }
  }, [walletAddress])

  // Fetch trade history from Polymarket
  const fetchTrades = useCallback(async () => {
    if (!walletAddress) return
    
    try {
      const response = await fetch(`/api/user/trades?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        const formattedTrades: Trade[] = (data.trades || []).map((trade: any) => ({
          id: trade.id || trade.trade_id || '',
          market: trade.market || trade.title || 'Unknown Market',
          outcome: trade.outcome || (trade.side === 'BUY' ? 'Yes' : 'No'),
          side: trade.side || 'BUY',
          size: parseFloat(trade.size || trade.shares || '0'),
          price: parseFloat(trade.price || '0'),
          total: parseFloat(trade.size || '0') * parseFloat(trade.price || '0'),
          timestamp: trade.timestamp || trade.match_time || trade.created_at || new Date().toISOString(),
        }))
        setTrades(formattedTrades)
      }
    } catch (error) {
      console.error('[Terminal] Error fetching trades:', error)
    }
  }, [walletAddress])

  // Fetch all data
  const refreshData = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchPositions(), fetchOrders(), fetchTrades()])
    setLastRefresh(new Date())
    setIsLoading(false)
  }, [fetchPositions, fetchOrders, fetchTrades])

  // Auto-refresh on wallet connect and periodically
  useEffect(() => {
    if (walletAddress) {
      refreshData()
      // Refresh every 30 seconds
      const interval = setInterval(refreshData, 30000)
      return () => clearInterval(interval)
    }
  }, [walletAddress, refreshData])

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

      {/* Bottom Section - Position, Orders, History */}
      <div className="bg-black h-72">
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
        </div>
        <div className="overflow-y-auto h-[calc(100%-49px)]">
          {activeTab === 'position' && (
            <div className="w-full">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Market</th>
                    <th className="text-left py-3 px-4 font-medium">Outcome</th>
                    <th className="text-left py-3 px-4 font-medium">Side</th>
                    <th className="text-right py-3 px-4 font-medium">Size</th>
                    <th className="text-right py-3 px-4 font-medium">Avg Price</th>
                    <th className="text-right py-3 px-4 font-medium">Current</th>
                    <th className="text-right py-3 px-4 font-medium">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {!walletAddress ? (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                        Connect wallet to view positions
                      </td>
                    </tr>
                  ) : positions.length > 0 ? (
                    positions.map((position, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-white max-w-xs truncate" title={position.market}>{position.market}</td>
                        <td className="py-3 px-4 text-gray-300">{position.outcome}</td>
                        <td className="py-3 px-4">
                          <span className={position.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                            {position.side}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{position.size.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-400">{(position.avgPrice * 100).toFixed(1)}¢</td>
                        <td className="py-3 px-4 text-right text-white">
                          <AnimatedPrice
                            value={position.currentPrice * 100}
                            format={(val) => val.toFixed(1)}
                            suffix="¢"
                            duration={0.6}
                            speed={0.03}
                          />
                        </td>
                        <td className={`py-3 px-4 text-right ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                        {isLoading ? 'Loading positions...' : 'No open positions'}
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
                    <th className="text-right py-3 px-4 font-medium">Size</th>
                    <th className="text-right py-3 px-4 font-medium">Price</th>
                    <th className="text-right py-3 px-4 font-medium">Status</th>
                    <th className="text-right py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!walletAddress ? (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                        Connect wallet to view orders
                      </td>
                    </tr>
                  ) : orders.length > 0 ? (
                    orders.map((order, idx) => (
                      <tr key={order.id || idx} className="border-b border-gray-800 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-white max-w-xs truncate" title={order.market}>{order.market}</td>
                        <td className="py-3 px-4 text-gray-400">{order.type}</td>
                        <td className="py-3 px-4">
                          <span className={order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                            {order.side} {order.outcome}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{order.size.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-white">
                          <AnimatedPrice
                            value={order.price * 100}
                            format={(val) => val.toFixed(1)}
                            suffix="¢"
                            duration={0.6}
                            speed={0.03}
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            order.status === 'live' ? 'bg-green-900/50 text-green-400' :
                            order.status === 'matched' ? 'bg-blue-900/50 text-blue-400' :
                            'bg-gray-800 text-gray-400'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button className="text-red-400 hover:text-red-300 text-xs">Cancel</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                        {isLoading ? 'Loading orders...' : 'No open orders'}
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
                    <th className="text-right py-3 px-4 font-medium">Size</th>
                    <th className="text-right py-3 px-4 font-medium">Price</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {!walletAddress ? (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-gray-500 text-sm">
                        Connect wallet to view trade history
                      </td>
                    </tr>
                  ) : trades.length > 0 ? (
                    trades.map((trade, idx) => (
                      <tr key={trade.id || idx} className="border-b border-gray-800 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-gray-400">
                          {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 text-white max-w-xs truncate" title={trade.market}>{trade.market}</td>
                        <td className="py-3 px-4">
                          <span className={trade.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                            {trade.side} {trade.outcome}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{trade.size.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-white">
                          <AnimatedPrice
                            value={trade.price * 100}
                            format={(val) => val.toFixed(1)}
                            suffix="¢"
                            duration={0.6}
                            speed={0.03}
                          />
                        </td>
                        <td className="py-3 px-4 text-right text-white">${trade.total.toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 px-4 text-center text-gray-500 text-sm">
                        {isLoading ? 'Loading trade history...' : 'No trade history'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TerminalPage() {
  return (
    <TradingProvider>
      <TerminalContent />
    </TradingProvider>
  )
}
