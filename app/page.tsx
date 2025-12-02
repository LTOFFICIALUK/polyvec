'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import PolyLineChart from '@/components/PolyLineChart'
import TradingViewChart from '@/components/TradingViewChart'
import TradingPanel from '@/components/TradingPanel'
import ChartControls from '@/components/ChartControls'
import OrderBook, { OrderBookHandle } from '@/components/OrderBook'
import AnimatedPrice from '@/components/AnimatedPrice'
import { TradingProvider, useTradingContext } from '@/contexts/TradingContext'
import { useWallet } from '@/contexts/WalletContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'

interface Position {
  market: string
  outcome: string
  side: string
  size: number
  avgPrice: number
  currentPrice: number
  pnl: number
  tokenId?: string
  conditionId?: string
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
  const { selectedPair, showTradingView, selectedTimeframe, marketOffset } = useTradingContext()
  const { walletAddress, polymarketCredentials } = useWallet()
  const [activeTab, setActiveTab] = useState<'position' | 'orders' | 'history' | 'orderbook'>('position')
  const [, forceUpdate] = useState({})
  const orderBookRef = useRef<OrderBookHandle>(null)
  
  // Get current market for live price matching
  const { market: currentMarket } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    offset: marketOffset,
  })
  
  // Real data from Polymarket
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  
  // Live orderbook prices for current market (same as TradingPanel)
  // For positions, we need bid prices (what you can sell for) and ask prices (what you can buy at)
  const [livePrices, setLivePrices] = useState<{
    upBidPrice: number | null  // Best bid (sell price for UP)
    upAskPrice: number | null  // Best ask (buy price for UP)
    downBidPrice: number | null  // Best bid (sell price for DOWN)
    downAskPrice: number | null  // Best ask (buy price for DOWN)
  }>({ 
    upBidPrice: null,
    upAskPrice: null,
    downBidPrice: null,
    downAskPrice: null,
  })
  
  // Helper to get current auto-centering state
  const isAutoCentering = orderBookRef.current?.isAutoCentering() ?? true

  // Fetch positions from Polymarket
  const fetchPositions = useCallback(async () => {
    if (!walletAddress) return
    try {
      const response = await fetch(`/api/user/positions?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        const formattedPositions: Position[] = (data.positions || []).map((pos: any) => ({
          market: pos.title || pos.market || 'Unknown Market',
          outcome: pos.outcome || 'Yes',
          side: pos.side || 'BUY',
          size: parseFloat(pos.size || '0'),
          avgPrice: parseFloat(pos.avgPrice || '0'),
          currentPrice: parseFloat(pos.curPrice || pos.currentPrice || '0'),
          pnl: parseFloat(pos.cashPnl || pos.pnl || '0'),
          tokenId: pos.asset || pos.tokenId || pos.token_id || '',
          conditionId: pos.conditionId || pos.condition_id || '',
        }))
        setPositions(formattedPositions)
      }
    } catch (error) {
      console.error('[Home] Error fetching positions:', error)
    }
  }, [walletAddress])

  // Fetch open orders
  const fetchOrders = useCallback(async () => {
    if (!walletAddress) return
    try {
      // Build URL with credentials if available (required for Polymarket API)
      let url = `/api/user/orders?address=${walletAddress}`
      if (polymarketCredentials) {
        url += `&credentials=${encodeURIComponent(JSON.stringify(polymarketCredentials))}`
      }
      
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        console.log('[Home] Orders API response:', { 
          orderCount: Array.isArray(data.orders) ? data.orders.length : 0,
          orders: data.orders?.slice(0, 2) // Log first 2 orders for debugging
        })
        const formattedOrders: Order[] = (data.orders || []).map((order: any) => {
          // Parse size - could be in different formats
          let size = 0
          if (order.size) size = parseFloat(order.size)
          else if (order.original_size) size = parseFloat(order.original_size)
          else if (order.maker_amount) {
            // maker_amount is in base units, convert to shares
            size = parseFloat(order.maker_amount) / 1e6
          }
          
          // Parse price
          let price = 0
          if (order.price) price = parseFloat(order.price)
          else if (order.limit_price) price = parseFloat(order.limit_price)
          else if (order.maker_amount && order.taker_amount) {
            // Calculate price from maker/taker amounts
            price = parseFloat(order.taker_amount) / parseFloat(order.maker_amount)
          }
          
          return {
            id: order.id || order.order_id || order.hash || order.orderHash || '',
            market: order.market || order.title || order.market_title || order.question || 'Unknown Market',
            outcome: order.outcome || (order.side === 'BUY' ? 'Yes' : 'No'),
            type: order.orderType || order.type || order.order_type || 'Limit',
            side: order.side || 'BUY',
            size: size,
            price: price,
            status: order.status || order.order_status || 'live',
          }
        })
        setOrders(formattedOrders)
      }
    } catch (error) {
      console.error('[Home] Error fetching orders:', error)
    }
  }, [walletAddress, polymarketCredentials])

  // Fetch trade history
  const fetchTrades = useCallback(async () => {
    if (!walletAddress) return
    try {
      const response = await fetch(`/api/user/trades?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        const formattedTrades: Trade[] = (data.trades || []).map((trade: any) => ({
          id: trade.id || '',
          market: trade.title || trade.market || 'Unknown Market',
          outcome: trade.outcome || 'Yes',
          side: trade.side || 'BUY',
          size: parseFloat(trade.size || '0'),
          price: parseFloat(trade.price || '0'),
          total: parseFloat(trade.size || '0') * parseFloat(trade.price || '0'),
          timestamp: trade.match_time || trade.timestamp || new Date().toISOString(),
        }))
        setTrades(formattedTrades)
      }
    } catch (error) {
      console.error('[Home] Error fetching trades:', error)
    }
  }, [walletAddress])

  // Refresh all data
  const refreshData = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchPositions(), fetchOrders(), fetchTrades()])
    setLastRefresh(new Date())
    setIsLoading(false)
  }, [fetchPositions, fetchOrders, fetchTrades])

  // Fetch live orderbook prices for current market (same as TradingPanel)
  useEffect(() => {
    const fetchLivePrices = async () => {
      if (!currentMarket?.yesTokenId || !currentMarket?.noTokenId) {
        setLivePrices({ 
          upBidPrice: null,
          upAskPrice: null,
          downBidPrice: null,
          downAskPrice: null,
        })
        return
      }

      try {
        const [upResponse, downResponse] = await Promise.all([
          fetch(`/api/polymarket/orderbook?tokenId=${currentMarket.yesTokenId}`),
          fetch(`/api/polymarket/orderbook?tokenId=${currentMarket.noTokenId}`),
        ])

        if (upResponse.ok && downResponse.ok) {
          const upData = await upResponse.json()
          const downData = await downResponse.json()

          // Get best bid (sell price) and best ask (buy price) for both tokens
          const upBestBid = upData.bids?.[0]?.price ? parseFloat(upData.bids[0].price) * 100 : null
          const upBestAsk = upData.asks?.[0]?.price ? parseFloat(upData.asks[0].price) * 100 : null
          const downBestBid = downData.bids?.[0]?.price ? parseFloat(downData.bids[0].price) * 100 : null
          const downBestAsk = downData.asks?.[0]?.price ? parseFloat(downData.asks[0].price) * 100 : null

          setLivePrices({
            upBidPrice: upBestBid,
            upAskPrice: upBestAsk,
            downBidPrice: downBestBid,
            downAskPrice: downBestAsk,
          })
        }
      } catch (err) {
        console.error('[Home] Error fetching live prices:', err)
      }
    }

    fetchLivePrices()
    // Poll every 2 seconds to keep prices fresh (same as TradingPanel)
    const interval = setInterval(fetchLivePrices, 2000)
    return () => clearInterval(interval)
  }, [currentMarket?.yesTokenId, currentMarket?.noTokenId])

  // Auto-refresh on wallet connect
  useEffect(() => {
    if (walletAddress) {
      refreshData()
      const interval = setInterval(refreshData, 30000)
      return () => clearInterval(interval)
    }
  }, [walletAddress, refreshData])

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
            className={`px-4 py-3 text-sm font-semibold transition-colors relative h-[49px] ${
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
            className={`px-4 py-3 text-sm font-semibold transition-colors relative h-[49px] ${
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
            className={`px-4 py-3 text-sm font-semibold transition-colors relative h-[49px] ${
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
            className={`px-4 py-3 text-sm font-semibold transition-colors relative flex items-center gap-2 h-[49px] ${
              activeTab === 'orderbook'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>Order Book</span>
            {activeTab === 'orderbook' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    orderBookRef.current?.toggleAutoCenter()
                    // Force re-render to update button appearance
                    forceUpdate({})
                  }}
                  className="text-gray-400 hover:text-white transition-colors p-0.5 flex items-center justify-center"
                  aria-label="Toggle auto-center orderbook"
                  title={isAutoCentering ? "Disable auto-center (allow manual scroll)" : "Enable auto-center (lock to spread)"}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-opacity rotate-90 ${isAutoCentering ? '' : 'opacity-50'}`}
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
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-primary" />
              </>
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
                    positions.map((position, idx) => {
                      // Check if position matches current market by tokenId or outcome
                      const positionIsUp = position.outcome?.toLowerCase().includes('yes') || 
                                          position.outcome?.toLowerCase().includes('up') ||
                                          position.tokenId === currentMarket?.yesTokenId
                      const positionIsDown = position.outcome?.toLowerCase().includes('no') || 
                                            position.outcome?.toLowerCase().includes('down') ||
                                            position.tokenId === currentMarket?.noTokenId
                      
                      const matchesCurrentMarket = currentMarket?.yesTokenId && currentMarket?.noTokenId && 
                        (position.tokenId === currentMarket.yesTokenId || 
                         position.tokenId === currentMarket.noTokenId ||
                         (positionIsUp && currentMarket.yesTokenId) ||
                         (positionIsDown && currentMarket.noTokenId))
                      
                      // Use live price if position matches current market
                      // For positions, use bid price (what you can sell for) - this is the market value
                      let livePriceCents: number | null = null
                      if (matchesCurrentMarket) {
                        if (position.tokenId === currentMarket?.yesTokenId || positionIsUp) {
                          livePriceCents = livePrices.upBidPrice
                        } else if (position.tokenId === currentMarket?.noTokenId || positionIsDown) {
                          livePriceCents = livePrices.downBidPrice
                        }
                      }
                      
                      const currentPrice = livePriceCents !== null 
                        ? livePriceCents / 100 
                        : position.currentPrice
                      
                      // Recalculate PnL based on live price if available
                      const calculatedPnl = matchesCurrentMarket && livePriceCents !== null
                        ? (currentPrice - position.avgPrice) * position.size
                        : position.pnl
                      
                      return (
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
                            <>
                              <AnimatedPrice
                                value={currentPrice * 100}
                                format={(val) => val.toFixed(1)}
                              />
                              ¢
                            </>
                          </td>
                          <td className={`py-3 px-4 text-right ${calculatedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {calculatedPnl >= 0 ? '+' : ''}${calculatedPnl.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })
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
                          <>
                            <AnimatedPrice
                              value={order.price * 100}
                              format={(val) => val.toFixed(1)}
                            />
                            ¢
                          </>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            order.status === 'live' ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-400'
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
                          <>
                            <AnimatedPrice
                              value={trade.price * 100}
                              format={(val) => val.toFixed(1)}
                            />
                            ¢
                          </>
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
          {activeTab === 'orderbook' && (
            <div className="w-full h-full">
              <OrderBook ref={orderBookRef} />
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

