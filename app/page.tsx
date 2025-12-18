'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import PolyLineChart from '@/components/PolyLineChart'
import TradingViewChart from '@/components/TradingViewChart'
import TradingPanel from '@/components/TradingPanel'
import DraggableTradingPanel from '@/components/DraggableTradingPanel'
import ChartControls from '@/components/ChartControls'
import OrderBook, { OrderBookHandle } from '@/components/OrderBook'
import AnimatedPrice from '@/components/AnimatedPrice'
import { TradingProvider, useTradingContext } from '@/contexts/TradingContext'
import { useWallet } from '@/contexts/WalletContext'
import { useToast } from '@/contexts/ToastContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'
import { redeemPosition } from '@/lib/redeem-positions'
import { getBrowserProvider } from '@/lib/polymarket-auth'

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
  redeemable?: boolean
  outcomeIndex?: number
  slug?: string
  resolved?: boolean  // Market has resolved
  isLoss?: boolean    // Position lost (curPrice near 0 after resolution)
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
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'position' | 'orders' | 'history'>('position')
  const [isClaimingPosition, setIsClaimingPosition] = useState<string | null>(null)
  const [showSideBySide, setShowSideBySide] = useState(true) // Default to side-by-side view
  
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
  

  // Fetch positions from Polymarket
  const fetchPositions = useCallback(async () => {
    if (!walletAddress) return
    try {
      const response = await fetch(`/api/user/positions?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        const formattedPositions: Position[] = (data.positions || []).map((pos: any) => {
          const curPrice = parseFloat(pos.curPrice || pos.currentPrice || '0')
          const isRedeemable = pos.redeemable === true
          
          // A position is a "loss" if:
          // - Market is resolved (redeemable is true) AND
          // - Current price is 0 or near 0 (meaning this outcome lost)
          const isLoss = isRedeemable && curPrice < 0.01
          
          // Only truly redeemable (winner) if redeemable=true AND curPrice > 0
          const isWinner = isRedeemable && curPrice > 0.01
          
          return {
            market: pos.title || pos.market || 'Unknown Market',
            outcome: pos.outcome || 'Yes',
            side: pos.side || 'BUY',
            size: parseFloat(pos.size || '0'),
            avgPrice: parseFloat(pos.avgPrice || '0'),
            currentPrice: curPrice,
            pnl: parseFloat(pos.cashPnl || pos.pnl || '0'),
            tokenId: pos.asset || pos.tokenId || pos.token_id || '',
            conditionId: pos.conditionId || pos.condition_id || '',
            redeemable: isWinner, // Only show Claim for actual winners
            outcomeIndex: pos.outcomeIndex ?? 0,
            slug: pos.slug || pos.eventSlug || '',
            isLoss: isLoss, // Show Close for resolved losers
          }
        })
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
      const hasCredentials = !!polymarketCredentials
      if (polymarketCredentials) {
        url += `&credentials=${encodeURIComponent(JSON.stringify(polymarketCredentials))}`
      }
      
      
      const response = await fetch(url)
      const data = await response.json()
      
      // Log detailed error if API failed
      if (data.source !== 'polymarket-api' && data.source !== 'websocket') {
        console.error('[Home] Orders API Error:', data.error, data.errorDetails)
      }
      
      if (response.ok) {
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

  // Handle claiming a winning position
  const handleClaimPosition = useCallback(async (position: Position) => {
    if (!position.conditionId || isClaimingPosition) return
    
    setIsClaimingPosition(position.conditionId)
    showToast('Preparing to claim position...', 'info')
    
    try {
      const provider = await getBrowserProvider()
      if (!provider) {
        throw new Error('No wallet provider found')
      }
      
      showToast('Please confirm the transaction in your wallet...', 'info')
      
      const txHash = await redeemPosition(
        provider,
        position.conditionId,
        position.outcomeIndex ?? 0
      )
      
      showToast(`✓ Position claimed! TX: ${txHash.slice(0, 10)}...`, 'success')
      
      // Refresh positions after claim
      setTimeout(() => {
        fetchPositions()
      }, 2000)
    } catch (error: any) {
      console.error('[Claim] Error:', error)
      if (error.message?.includes('rejected') || error.code === 4001) {
        showToast('Claim cancelled', 'warning')
      } else {
        showToast(`Failed to claim: ${error.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsClaimingPosition(null)
    }
  }, [isClaimingPosition, showToast, fetchPositions])

  // Handle closing a losing position (same mechanism, just removes from portfolio)
  const handleClosePosition = useCallback(async (position: Position) => {
    if (!position.conditionId || isClaimingPosition) return
    
    setIsClaimingPosition(position.conditionId)
    showToast('Preparing to close position...', 'info')
    
    try {
      const provider = await getBrowserProvider()
      if (!provider) {
        throw new Error('No wallet provider found')
      }
      
      showToast('Please confirm the transaction in your wallet...', 'info')
      
      // Same function as claim - for losing positions, you get $0 back
      const txHash = await redeemPosition(
        provider,
        position.conditionId,
        position.outcomeIndex ?? 0
      )
      
      showToast(`✓ Position closed! TX: ${txHash.slice(0, 10)}...`, 'success')
      
      // Refresh positions after close
      setTimeout(() => {
        fetchPositions()
      }, 2000)
    } catch (error: any) {
      console.error('[Close] Error:', error)
      if (error.message?.includes('rejected') || error.code === 4001) {
        showToast('Close cancelled', 'warning')
      } else if (error.message?.includes('condition not resolved')) {
        showToast('Market not yet resolved. Please wait for resolution.', 'error')
      } else {
        showToast(`Failed to close: ${error.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsClaimingPosition(null)
    }
  }, [isClaimingPosition, showToast, fetchPositions])

  // State for cancelling orders
  const [isCancellingOrder, setIsCancellingOrder] = useState<string | null>(null)

  // Handle cancelling an open order
  const handleCancelOrder = useCallback(async (order: Order) => {
    if (!order.id || isCancellingOrder) return
    if (!walletAddress || !polymarketCredentials) {
      showToast('Please connect wallet and authenticate with Polymarket', 'error')
      return
    }
    
    setIsCancellingOrder(order.id)
    showToast('Cancelling order...', 'info')
    
    try {
      const response = await fetch('/api/trade/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          walletAddress,
          credentials: polymarketCredentials,
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to cancel order')
      }
      
      showToast('✓ Order cancelled!', 'success')
      
      // Refresh orders after cancel
      setTimeout(() => {
        fetchOrders()
      }, 1000)
    } catch (error: any) {
      console.error('[Cancel] Error:', error)
      showToast(`Failed to cancel: ${error.message || 'Unknown error'}`, 'error')
    } finally {
      setIsCancellingOrder(null)
    }
  }, [isCancellingOrder, walletAddress, polymarketCredentials, showToast, fetchOrders])

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

  // Listen for order placement events to refresh orders and positions
  useEffect(() => {
    const handleOrderPlaced = () => {
      // Wait a moment for the order to be processed by Polymarket
      // For market orders (FOK/FAK), positions should update immediately after fill
      // For limit orders (GTC), position won't update until order is filled
      setTimeout(() => {
        fetchOrders()
        fetchPositions() // Refresh positions after order placement
      }, 1500)
      
      // Second refresh after a longer delay for positions to propagate in Polymarket's system
      setTimeout(() => {
        fetchPositions()
      }, 5000)
    }

    window.addEventListener('orderPlaced', handleOrderPlaced)
    return () => window.removeEventListener('orderPlaced', handleOrderPlaced)
  }, [fetchOrders, fetchPositions])

  return (
    <div className="bg-dark-bg text-white h-[calc(100vh-73px)] overflow-hidden relative">
      {/* Full Screen Chart */}
      <div className="absolute inset-0 flex flex-col">
            <ChartControls />
            <div className="flex-1 min-h-0 relative">
          {/* Default: Side-by-Side View (Poly Orderbook + TradingView) */}
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

          {/* Side-by-Side Toggle Button - Commented out, side-by-side is now default */}
          {/*
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setShowSideBySide(!showSideBySide)}
              className={`px-3 py-2 rounded transition-all duration-200 flex items-center gap-1.5 ${
                showSideBySide
                  ? 'bg-gold-primary text-white shadow-lg shadow-gold-primary/20'
                  : 'bg-gray-900/90 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-700/50 backdrop-blur-sm'
              }`}
              title={showSideBySide ? 'Show single chart' : 'Show charts side by side'}
            >
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
                  d="M3 6h8v16H3V6z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 10h8M3 14h6"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 6h8v16h-8V6z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 10h8M13 14h6"
                />
              </svg>
            </button>
          </div>
          */}
          
          {/* Fallback to single chart view - Commented out, side-by-side is now default */}
          {/*
          {showSideBySide ? (
            <div className="w-full h-full flex">
              <div className="flex-1 border-r border-gray-700/50">
                <PolyLineChart />
              </div>
              <div className="flex-1">
                <TradingViewChart />
              </div>
            </div>
          ) : (
            showTradingView ? <TradingViewChart /> : <PolyLineChart />
          )}
          */}
      </div>

        {/* Bottom Section - Tabs and Orderbook */}
        <div className="h-64 border-t border-gray-700/50 flex">
          {/* Left: Position/Orders/History Tabs */}
          <div className="flex-1 flex flex-col">
            <div className="flex border-b border-gray-700/50 flex-shrink-0">
          <button
            onClick={() => setActiveTab('position')}
            className={`px-4 py-3 text-xs font-medium transition-colors relative h-[49px] uppercase tracking-wider ${
              activeTab === 'position'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            style={{ fontFamily: 'monospace' }}
          >
            Positions
            {activeTab === 'position' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-3 text-xs font-medium transition-colors relative h-[49px] uppercase tracking-wider ${
              activeTab === 'orders'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            style={{ fontFamily: 'monospace' }}
          >
            Orders
            {activeTab === 'orders' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-xs font-medium transition-colors relative h-[49px] uppercase tracking-wider ${
              activeTab === 'history'
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            style={{ fontFamily: 'monospace' }}
          >
            History
            {activeTab === 'history' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-primary" />
            )}
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-49px)]">
          {activeTab === 'position' && (
            <div className="w-full">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-700/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Market</th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Outcome</th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Side</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Size</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Avg Price</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Current</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>PnL</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!walletAddress ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-gray-500 text-sm">
                        Connect wallet to view positions
                      </td>
                    </tr>
                  ) : positions.length > 0 ? (
                    positions.map((position, idx) => {
                      // For resolved positions (redeemable or loss), use the position's actual price
                      // Don't override with live orderbook prices for settled markets
                      const isResolved = position.redeemable || position.isLoss
                      
                      // Check if position matches current market by tokenId or outcome
                      const positionIsUp = position.outcome?.toLowerCase().includes('yes') || 
                                          position.outcome?.toLowerCase().includes('up') ||
                                          position.tokenId === currentMarket?.yesTokenId
                      const positionIsDown = position.outcome?.toLowerCase().includes('no') || 
                                            position.outcome?.toLowerCase().includes('down') ||
                                            position.tokenId === currentMarket?.noTokenId
                      
                      const matchesCurrentMarket = !isResolved && currentMarket?.yesTokenId && currentMarket?.noTokenId && 
                        (position.tokenId === currentMarket.yesTokenId || 
                         position.tokenId === currentMarket.noTokenId ||
                         (positionIsUp && currentMarket.yesTokenId) ||
                         (positionIsDown && currentMarket.noTokenId))
                      
                      // Use live price ONLY for active (non-resolved) positions matching current market
                      let livePriceCents: number | null = null
                      if (matchesCurrentMarket && !isResolved) {
                        if (position.tokenId === currentMarket?.yesTokenId || positionIsUp) {
                          livePriceCents = livePrices.upBidPrice
                        } else if (position.tokenId === currentMarket?.noTokenId || positionIsDown) {
                          livePriceCents = livePrices.downBidPrice
                        }
                      }
                      
                      // For resolved positions, always use the position's curPrice from API
                      const currentPrice = isResolved 
                        ? position.currentPrice 
                        : (livePriceCents !== null ? livePriceCents / 100 : position.currentPrice)
                      
                      // Use API PnL for resolved positions, calculate for active ones
                      const calculatedPnl = isResolved
                        ? position.pnl
                        : (matchesCurrentMarket && livePriceCents !== null
                            ? (currentPrice - position.avgPrice) * position.size
                            : position.pnl)
                      
                      return (
                        <tr key={idx} className="border-b border-gray-700/30 hover:bg-gray-900/20">
                          <td className="py-3 px-4 max-w-xs truncate" title={position.market}>
                            {position.slug ? (
                              <a
                                href={`https://polymarket.com/event/${position.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white hover:text-gold-hover hover:underline transition-colors cursor-pointer"
                              >
                                {position.market}
                              </a>
                            ) : (
                              <span className="text-white">{position.market}</span>
                            )}
                          </td>
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
                          <td className="py-3 px-4 text-right">
                            {position.redeemable ? (
                              <button
                                onClick={() => handleClaimPosition(position)}
                                disabled={isClaimingPosition === position.conditionId}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                  isClaimingPosition === position.conditionId
                                    ? 'bg-gray-600 text-gray-300 cursor-wait'
                                    : 'bg-green-600 hover:bg-green-500 text-white'
                                }`}
                              >
                                {isClaimingPosition === position.conditionId ? 'Claiming...' : 'Claim'}
                              </button>
                            ) : position.isLoss ? (
                              <button
                                onClick={() => handleClosePosition(position)}
                                disabled={isClaimingPosition === position.conditionId}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                  isClaimingPosition === position.conditionId
                                    ? 'bg-gray-600 text-gray-300 cursor-wait'
                                    : 'bg-red-900/60 hover:bg-red-800/60 text-red-300 border border-red-700/50'
                                }`}
                                title="Close losing position (removes from portfolio)"
                              >
                                {isClaimingPosition === position.conditionId ? 'Closing...' : 'Close'}
                              </button>
                            ) : (
                              <span className="text-gray-600 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-gray-500 text-sm">
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
                <thead className="text-gray-400 border-b border-gray-700/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Market</th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Type</th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Side</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Size</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Price</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Status</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Actions</th>
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
                          <button 
                            onClick={() => handleCancelOrder(order)}
                            disabled={isCancellingOrder === order.id}
                            className={`text-xs transition-colors ${
                              isCancellingOrder === order.id
                                ? 'text-gray-500 cursor-wait'
                                : 'text-red-400 hover:text-red-300'
                            }`}
                          >
                            {isCancellingOrder === order.id ? 'Cancelling...' : 'Cancel'}
                          </button>
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
                <thead className="text-gray-400 border-b border-gray-700/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Time</th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Market</th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Side</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Size</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Price</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Total</th>
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
            </div>
          </div>
          
          {/* Right: Orderbook */}
          <div className="w-80 border-l border-gray-700/50 h-full overflow-hidden">
            <OrderBook />
          </div>
        </div>
      </div>
      
      {/* Draggable Floating Trading Panel */}
      <DraggableTradingPanel>
        <TradingPanel />
      </DraggableTradingPanel>
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

