'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import PolyLineChart from '@/components/PolyLineChart'
import TradingViewChart from '@/components/TradingViewChart'
import ChartControls from '@/components/ChartControls'
import TerminalRightPanel from '@/components/TerminalRightPanel'
import AnimatedPrice from '@/components/AnimatedPrice'
import ProtectedRoute from '@/components/ProtectedRoute'
import { TradingProvider, useTradingContext } from '@/contexts/TradingContext'
import { useWallet } from '@/contexts/WalletContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { usePlanModal } from '@/contexts/PlanModalContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'
import { createSignedOrder, OrderSide, OrderType } from '@/lib/polymarket-order-signing'

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
  marketEndDate?: string
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
  slug?: string
  tokenId?: string
  marketEndDate?: string
  resolved?: boolean
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
  const { polymarketCredentials } = useWallet()
  const { custodialWallet, refreshCustodialWallet, user, checkAuth } = useAuth()
  const searchParams = useSearchParams()
  const { openModal: openPlanModal } = usePlanModal()
  
  // Use custodial wallet address
  const walletAddress = custodialWallet?.walletAddress || null
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'position' | 'orders' | 'history'>('position')
  
  // Handle upgrade success/cancel redirects and plan modal opening
  useEffect(() => {
    const upgradeStatus = searchParams.get('upgrade')
    const openPlanModalParam = searchParams.get('openPlanModal')
    
    if (upgradeStatus === 'success') {
      showToast('🎉 Payment successful! Your Pro plan is now active.', 'success')
      // Refresh auth to get updated plan
      checkAuth()
      // Remove query param from URL
      window.history.replaceState({}, '', '/terminal')
    } else if (upgradeStatus === 'cancelled') {
      showToast('Payment was cancelled. You can try again anytime.', 'info')
      // Remove query param from URL
      window.history.replaceState({}, '', '/terminal')
    }
    
    // Open plan modal if query param is present
    if (openPlanModalParam === 'true') {
      openPlanModal()
      // Remove query param from URL
      window.history.replaceState({}, '', '/terminal')
    }
  }, [searchParams, showToast, checkAuth, openPlanModal])
  const [isClaimingPosition, setIsClaimingPosition] = useState<string | null>(null)
  const [showSideBySide, setShowSideBySide] = useState(true) // Default to side-by-side view
  const [hideEnded, setHideEnded] = useState(false) // Toggle to hide ended/closed markets
  
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
          // Use API's redeemable flag directly - don't calculate based on curPrice
          // as curPrice may be from wrong market
          const isRedeemable = pos.redeemable === true
          
          // Extract market end date from slug timestamp if available
          // Slug format: "sol-updown-15m-1764356400" or "sol-updown-1h-1764356400"
          let marketEndDate: string | undefined = undefined
          const slug = pos.slug || pos.eventSlug || ''
          if (slug) {
            // Try to extract timestamp from slug
            const timestampMatch = slug.match(/-(\d+)$/)
            if (timestampMatch) {
              const startTimestamp = parseInt(timestampMatch[1]) * 1000 // Convert to milliseconds
              // Determine timeframe from slug (15m or 1h)
              const timeframeMatch = slug.match(/updown-(\d+m|1h)/)
              let timeframeMinutes = 15 // default
              if (timeframeMatch) {
                const tf = timeframeMatch[1]
                if (tf === '1h') timeframeMinutes = 60
                else if (tf === '15m') timeframeMinutes = 15
                else if (tf === '5m') timeframeMinutes = 5
                else if (tf === '1m') timeframeMinutes = 1
              }
              // Calculate end time (start + timeframe)
              const endTimestamp = startTimestamp + (timeframeMinutes * 60 * 1000)
              marketEndDate = new Date(endTimestamp).toISOString()
            }
          }
          
          // Also check if API provides endDate directly
          if (!marketEndDate && (pos.endDate || pos.end_date || pos.endTime || pos.end_time)) {
            marketEndDate = pos.endDate || pos.end_date || pos.endTime || pos.end_time
          }
          
          // Determine if market is resolved (ended) - check multiple sources
          // Don't rely solely on redeemable flag, as losing positions aren't redeemable but markets can still be resolved
          let isResolved = false
          
          // Check if API explicitly says market is resolved
          if (pos.resolved === true || pos.is_resolved === true) {
            isResolved = true
          }
          
          // Check if market end date has passed
          if (!isResolved && marketEndDate) {
            const endDate = new Date(marketEndDate)
            if (!isNaN(endDate.getTime()) && endDate.getTime() <= Date.now()) {
              isResolved = true
            }
          }
          
          // If redeemable is true, market must be resolved (you can only redeem resolved markets)
          // But don't use this as the only check since losing positions aren't redeemable
          if (!isResolved && isRedeemable) {
            isResolved = true
          }
          
          // A position is a "loss" if market is resolved and redeemable is false
          const isLoss = isResolved && !isRedeemable
          
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
            redeemable: isRedeemable, // Only show Claim for actual winners (redeemable positions)
            outcomeIndex: pos.outcomeIndex ?? 0,
            slug: slug,
            isLoss: isLoss, // Show Close for resolved losers
            resolved: isResolved, // Market has resolved (ended) - independent of win/loss
            marketEndDate: marketEndDate,
          }
        })
        // Filter out positions that have been fully closed/redeemed (size = 0)
        // Keep all other positions - filtering by ended status is done at render time via hideEnded toggle
        const activePositions = formattedPositions.filter((pos) => {
          // Hide positions with zero size (fully closed/redeemed)
          if (pos.size <= 0) return false
          return true
        })
        setPositions(activePositions)
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
          
          // Extract market end date from slug timestamp if available
          // Slug format: "sol-updown-15m-1764356400" or "sol-updown-1h-1764356400"
          let marketEndDate: string | undefined = undefined
          const slug = order.slug || order.event_slug || order.eventSlug || ''
          if (slug) {
            // Try to extract timestamp from slug
            const timestampMatch = slug.match(/-(\d+)$/)
            if (timestampMatch) {
              const startTimestamp = parseInt(timestampMatch[1]) * 1000 // Convert to milliseconds
              // Determine timeframe from slug (15m or 1h)
              const timeframeMatch = slug.match(/updown-(\d+m|1h)/)
              let timeframeMinutes = 15 // default
              if (timeframeMatch) {
                const tf = timeframeMatch[1]
                if (tf === '1h') timeframeMinutes = 60
                else if (tf === '15m') timeframeMinutes = 15
                else if (tf === '5m') timeframeMinutes = 5
                else if (tf === '1m') timeframeMinutes = 1
              }
              // Calculate end time (start + timeframe)
              const endTimestamp = startTimestamp + (timeframeMinutes * 60 * 1000)
              marketEndDate = new Date(endTimestamp).toISOString()
            }
          }
          
          // Also check if API provides endDate directly
          if (!marketEndDate && (order.market_end_date || order.endDate || order.end_date || order.endTime || order.end_time)) {
            marketEndDate = order.market_end_date || order.endDate || order.end_date || order.endTime || order.end_time
          }
          
          // Get market name - try multiple sources, same logic as positions
          // Priority: title > market (if not token ID) > market_title > question > parsed from slug > fallback
          let marketName = order.title || order.market_title || order.question || ''
          
          // Only use order.market if it's not a token ID (token IDs start with 0x or are very long numbers)
          if (!marketName && order.market) {
            const marketVal = String(order.market)
            const isTokenId = marketVal.startsWith('0x') || (marketVal.length > 30 && /^\d+$/.test(marketVal))
            if (!isTokenId) {
              marketName = marketVal
            }
          }
          
          // If no market name but we have a slug, parse it to create a readable name
          // e.g., "sol-updown-15m-1764356400" -> "SOL Up/Down 15m"
          if (!marketName && slug) {
            const slugMatch = slug.match(/^([a-z]+)-updown-(\d+m|1h)-\d+$/i)
            if (slugMatch) {
              const crypto = slugMatch[1].toUpperCase()
              const timeframe = slugMatch[2]
              marketName = `${crypto} Up/Down ${timeframe}`
            }
          }
          
          // Final fallback - show truncated token ID if available
          if (!marketName) {
            const tokenId = order.asset_id || order.token_id || order.tokenId || ''
            if (tokenId) {
              marketName = `Market ${tokenId.slice(0, 8)}...${tokenId.slice(-6)}`
            } else {
              marketName = 'Unknown Market'
            }
          }
          
          // Store token ID for time-based lookup if slug isn't available
          const tokenId = order.asset_id || order.token_id || order.tokenId || ''
          
          return {
            id: order.id || order.order_id || order.hash || order.orderHash || '',
            market: marketName,
          outcome: order.outcome || (order.side === 'BUY' ? 'Yes' : 'No'),
            type: order.orderType || order.type || order.order_type || 'Limit',
          side: order.side || 'BUY',
            size: size,
            price: price,
            status: order.status || order.order_status || 'live',
            slug: slug,
            tokenId: tokenId,
            marketEndDate: marketEndDate || '',
            resolved: order.resolved || order.is_resolved || false,
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
      const provider = getBrowserProvider()
      if (!provider) {
        throw new Error('No wallet provider found. Please connect your wallet.')
      }
      
      // Request accounts to ensure wallet is connected and unlocked
      try {
        await provider.send('eth_requestAccounts', [])
      } catch (accountError: any) {
        if (accountError.code === 4001) {
          throw new Error('Please connect your wallet to continue')
        }
        // Continue anyway, wallet might already be connected
      }
      
      // Ensure we're on Polygon network
      await ensurePolygonNetwork(provider)
      
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
      if (error.message?.includes('rejected') || error.code === 4001 || error.message?.includes('ACTION_REJECTED')) {
        showToast('Claim cancelled', 'warning')
      } else if (error.message?.includes('connect your wallet')) {
        showToast(error.message, 'error')
      } else if (error.message?.includes('network')) {
        showToast('Please switch to Polygon network', 'error')
      } else {
        showToast(`Failed to claim: ${error.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsClaimingPosition(null)
    }
  }, [isClaimingPosition, showToast, fetchPositions])

  // Handle closing a losing position using custodial wallet
  const handleClosePosition = useCallback(async (position: Position) => {
    if (!position.conditionId || isClaimingPosition) return
    if (!user || !custodialWallet) {
      showToast('Please log in to close positions', 'error')
      return
    }
    
    setIsClaimingPosition(position.conditionId)
    showToast('Preparing to close position...', 'info')
    
    try {
      const response = await fetch('/api/user/close-position', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conditionId: position.conditionId,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to close position')
      }
      
      showToast(`✓ Position closed! TX: ${result.txHash.slice(0, 10)}...`, 'success')
      
      // Refresh positions and balances after close
      setTimeout(() => {
        fetchPositions()
        refreshCustodialWallet(true)
      }, 2000)
    } catch (error: any) {
      console.error('[Close] Error:', error)
      if (error.message?.includes('not yet resolved') || error.message?.includes('condition not resolved')) {
        showToast('Market not yet resolved on-chain. Please wait for the oracle to settle the market.', 'error', 8000)
      } else {
        showToast(`Failed to close: ${error.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsClaimingPosition(null)
    }
  }, [isClaimingPosition, user, custodialWallet, showToast, fetchPositions, refreshCustodialWallet])

  // State for cancelling orders
  const [isCancellingOrder, setIsCancellingOrder] = useState<string | null>(null)
  
  // State for selling positions
  const [isSellingPosition, setIsSellingPosition] = useState<string | null>(null)

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

  // Handle selling entire position
  const handleSellAllPosition = useCallback(async (position: Position) => {
    if (!position.tokenId || !position.size || isSellingPosition || !polymarketCredentials) {
      if (!polymarketCredentials) {
        showToast('Please authenticate with Polymarket first', 'error')
      }
      return
    }

    setIsSellingPosition(position.tokenId)
    showToast(`Preparing to sell ${position.size.toFixed(2)} shares...`, 'info')

    try {
      const provider = getBrowserProvider()
      if (!provider) {
        throw new Error('No wallet provider found')
      }

      await ensurePolygonNetwork(provider)

      // Get the actual signer address
      const walletSigner = await provider.getSigner()
      const actualSignerAddress = await walletSigner.getAddress()

      if (walletAddress && walletAddress.toLowerCase() !== actualSignerAddress.toLowerCase()) {
        showToast('Wallet address changed. Please reconnect your wallet.', 'warning')
        setIsSellingPosition(null)
        return
      }

      // Fetch current orderbook to get best bid price for market order
      // The orderbook API returns prices as decimals (0-1), same as how buy orders work
      // Initialize with position's current price as fallback
      let priceDecimal: number = position.currentPrice // Already in decimal format
      let bestBidPriceCents: number = priceDecimal * 100
      
      try {
        const orderbookResponse = await fetch(`/api/polymarket/orderbook?tokenId=${position.tokenId}`)
        if (orderbookResponse.ok) {
          const orderbookData = await orderbookResponse.json()
          if (orderbookData.bids && orderbookData.bids.length > 0) {
            // Best bid is the highest price someone is willing to pay (first in bids array)
            // Bids are objects with a 'price' property (decimal 0-1)
            const bestBid = orderbookData.bids[0]
            const bidPrice = typeof bestBid.price === 'string' ? parseFloat(bestBid.price) : bestBid.price
            if (!isNaN(bidPrice) && bidPrice > 0) {
              priceDecimal = bidPrice
              bestBidPriceCents = priceDecimal * 100
            }
          }
        }
      } catch (error) {
        console.warn('[Sell All] Failed to fetch orderbook, using position price:', error)
      }

      // Validate price
      if (isNaN(priceDecimal) || priceDecimal <= 0 || priceDecimal > 1) {
        throw new Error(`Cannot place market order: invalid price ${priceDecimal}. Please try again or use a limit order.`)
      }

      // Check if this is a neg-risk market
      let isNegRiskMarket = false
      try {
        const negRiskResponse = await fetch(`/api/polymarket/neg-risk?tokenId=${position.tokenId}`)
        const negRiskData = await negRiskResponse.json()
        isNegRiskMarket = negRiskData.negRisk === true
      } catch (error) {
        console.warn('[Sell All] Failed to check neg-risk status, defaulting to false:', error)
      }

      showToast(`Signing SELL order: ${position.size.toFixed(2)} shares @ ${bestBidPriceCents.toFixed(0)}¢`, 'info', 6000)

      // Create signed order (SELL market order - FAK for partial fills)
      // Use priceDecimal directly (already in 0-1 format, same as buy orders)
      const signedOrder = await createSignedOrder(
        {
          tokenId: position.tokenId,
          side: OrderSide.SELL,
          price: priceDecimal, // Already in decimal format (0-1)
          size: position.size,
          maker: actualSignerAddress,
          signer: actualSignerAddress,
          negRisk: isNegRiskMarket,
        },
        provider
      )

      // Place the order
      // Use FAK (Fill-And-Kill) for market orders - allows partial fills
      // This is better than FOK because it will fill as much as possible and cancel the rest
      const response = await fetch('/api/trade/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: actualSignerAddress,
          credentials: polymarketCredentials,
          signedOrder: signedOrder,
          orderType: OrderType.FAK, // Market order - Fill And Kill (partial fills ok)
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        // Check if this is a price change error (FAK/FOK fill errors indicate price moved)
        const errorCode = result.errorCode || ''
        const errorMsg = (result.error || result.errorMsg || '').toLowerCase()
        const details = result.details || {}
        const detailsErrorMsg = (details.error || details.errorMsg || '').toLowerCase()
        
        // Check for price change errors - these occur when orderbook moves between fetching price and placing order
        const isPriceChangeError = 
          errorCode === 'FOK_ORDER_NOT_FILLED_ERROR' ||
          errorCode === 'EXECUTION_ERROR' ||
          errorMsg.includes('fok order') ||
          errorMsg.includes('fak order') ||
          errorMsg.includes('couldn\'t be fully filled') ||
          errorMsg.includes('could not be fully filled') ||
          errorMsg.includes('order couldn\'t be fully filled') ||
          detailsErrorMsg.includes('fok order') ||
          detailsErrorMsg.includes('fak order') ||
          detailsErrorMsg.includes('couldn\'t be fully filled') ||
          detailsErrorMsg.includes('could not be fully filled')
        
        if (isPriceChangeError) {
          throw new Error('PRICE_CHANGED')
        }
        throw new Error(result.error || result.errorMsg || 'Failed to place sell order')
      }

      const dollarAmount = position.size * priceDecimal
      showToast(
        `✓ Sold ${position.size.toFixed(2)} shares @ ${bestBidPriceCents.toFixed(0)}¢ = $${dollarAmount.toFixed(2)}`,
        'success',
        5000
      )

      // Refresh positions after sell
      setTimeout(() => {
        fetchPositions()
        fetchOrders()
      }, 1500)
    } catch (error: any) {
      console.error('[Sell All] Error:', error)
      if (error.message?.includes('rejected') || error.code === 4001) {
        showToast('Sell order cancelled', 'warning')
      } else if (error.message === 'PRICE_CHANGED') {
        // Price moved during order placement - show professional message for 15 seconds
        showToast('The market price changed while placing your order. Please try again.', 'error', 15000)
      } else if (error.message?.includes('FOK') || error.message?.includes('FAK') || error.message?.includes('fill')) {
        // Other fill-related errors
        showToast('Market order failed: The order could not be filled. The price may have changed - please try again.', 'error', 15000)
      } else {
        showToast(`Failed to sell: ${error.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsSellingPosition(null)
    }
  }, [isSellingPosition, walletAddress, polymarketCredentials, showToast, fetchPositions, fetchOrders])

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
    if (!walletAddress) return // Don't set up listener if no wallet connected
    
    const handleOrderPlaced = async () => {
      // Instant refresh: Update positions, orders, and balances immediately after trade
      await Promise.all([
        fetchPositions(),
        fetchOrders(),
        refreshCustodialWallet(true), // Sync balances from blockchain
      ])
      
      // Second refresh after a short delay for positions to propagate in Polymarket's system
      setTimeout(() => {
        fetchPositions()
        fetchOrders()
      }, 2000)
    }

    window.addEventListener('orderPlaced', handleOrderPlaced)
    return () => window.removeEventListener('orderPlaced', handleOrderPlaced)
  }, [walletAddress, fetchOrders, fetchPositions, refreshCustodialWallet]) // Include walletAddress to ensure effect runs when wallet changes

  return (
    <div className="bg-dark-bg text-white h-[calc(100vh-73px)] overflow-hidden relative">
      {/* Main Layout: Charts on Left, Right Panel on Right */}
      <div className="absolute inset-0 flex flex-col">
        <ChartControls />
        <div className="flex-1 min-h-0 flex">
          {/* Left: Charts + Bottom Tabs */}
          <div className="flex-1 flex flex-col border-r border-gray-700/50 min-w-0">
            {/* Charts */}
            <div className="flex-1 min-h-0 flex">
              <div className="flex-1">
                <PolyLineChart />
              </div>
              <div className="flex-1 border-l border-gray-700/50">
                <TradingViewChart />
              </div>
            </div>

            {/* Bottom Section - Positions/Orders/History Tabs */}
            <div className="h-64 border-t border-gray-700/50 flex-shrink-0 flex">
          {/* Left: Position/Orders/History Tabs */}
          <div className="flex-1 flex flex-col">
            <div className="flex border-b border-gray-700/50 flex-shrink-0 justify-between">
              <div className="flex">
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
              {/* Hide Ended Toggle */}
              <div className="flex items-center px-4">
                <button
                  onClick={() => setHideEnded(!hideEnded)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                    hideEnded
                      ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/50'
                      : 'bg-dark-bg text-gray-400 hover:text-white border border-gray-700/50'
                  }`}
                  title={hideEnded ? 'Show ended markets' : 'Hide ended markets'}
                  aria-label={hideEnded ? 'Show ended markets' : 'Hide ended markets'}
                  tabIndex={0}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {hideEnded ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                  Hide Ended
                </button>
              </div>
        </div>
        <div className="overflow-y-auto h-[calc(100%-49px)]">
          {activeTab === 'position' && (
            <div className="w-full">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b border-gray-700/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Market</th>
                    <th className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Outcome</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Size</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Avg Price</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Current</th>
                    <th className="text-right py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Value</th>
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
                  ) : (() => {
                    // Filter positions based on hideEnded toggle using TIME LOGIC
                    const filteredPositions = positions.filter((pos) => {
                      if (!hideEnded) return true // Show all if toggle is off
                      
                      // Check if market has ended using time-based logic (parse slug)
                      let isEnded = false
                      
                      if (pos.slug) {
                        const timestampMatch = pos.slug.match(/-(\d+)$/)
                        if (timestampMatch) {
                          const startTimestamp = parseInt(timestampMatch[1]) * 1000
                          const timeframeMatch = pos.slug.match(/updown-(\d+m|1h)/)
                          let timeframeMinutes = 15
                          if (timeframeMatch) {
                            const tf = timeframeMatch[1]
                            if (tf === '1h') timeframeMinutes = 60
                            else if (tf === '15m') timeframeMinutes = 15
                            else if (tf === '5m') timeframeMinutes = 5
                            else if (tf === '1m') timeframeMinutes = 1
                          }
                          const endTimestamp = startTimestamp + (timeframeMinutes * 60 * 1000)
                          if (endTimestamp <= Date.now()) {
                            isEnded = true
                          }
                        }
                      }
                      
                      // Fallback to marketEndDate
                      if (!isEnded && pos.marketEndDate && pos.marketEndDate.trim() !== '') {
                        const endDate = new Date(pos.marketEndDate)
                        if (!isNaN(endDate.getTime()) && endDate.getTime() <= Date.now()) {
                          isEnded = true
                        }
                      }
                      
                      return !isEnded // Hide ended positions when toggle is on
                    })
                    
                    if (filteredPositions.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} className="py-8 px-4 text-center text-gray-500 text-sm">
                            {isLoading ? 'Loading positions...' : hideEnded ? 'No active positions (ended markets hidden)' : 'No open positions'}
                        </td>
                        </tr>
                      )
                    }
                    
                    return filteredPositions.map((position, idx) => {
                      // Check if position matches current market by tokenId ONLY (exact match required)
                      // Do NOT match by outcome direction - each position belongs to a specific market
                      const positionIsUp = position.outcome?.toLowerCase().includes('yes') || 
                                          position.outcome?.toLowerCase().includes('up')
                      const positionIsDown = position.outcome?.toLowerCase().includes('no') || 
                                            position.outcome?.toLowerCase().includes('down')
                      
                      // Only match if tokenId exactly matches current market's tokenIds
                      // This prevents all UP/DOWN positions from matching the current market
                      const matchesCurrentMarket = currentMarket?.yesTokenId && currentMarket?.noTokenId && 
                        position.tokenId && (
                          position.tokenId === currentMarket.yesTokenId || 
                          position.tokenId === currentMarket.noTokenId
                        )
                      
                      // For resolved/ended positions, use the position's actual price
                      // Don't override with live orderbook prices for settled markets
                      // Use TIME LOGIC to determine if market has ended
                      let isResolved = false
                      
                      // If position matches current market, use current market's end time (most accurate)
                      if (matchesCurrentMarket && currentMarket?.endTime) {
                        const marketEndTime = currentMarket.endTime
                        if (marketEndTime <= Date.now()) {
                          isResolved = true
                        }
                      } else {
                        // For other positions, parse slug to check if market has ended
                        if (position.slug) {
                          const timestampMatch = position.slug.match(/-(\d+)$/)
                          if (timestampMatch) {
                            const startTimestamp = parseInt(timestampMatch[1]) * 1000
                            const timeframeMatch = position.slug.match(/updown-(\d+m|1h)/)
                            let timeframeMinutes = 15
                            if (timeframeMatch) {
                              const tf = timeframeMatch[1]
                              if (tf === '1h') timeframeMinutes = 60
                              else if (tf === '15m') timeframeMinutes = 15
                              else if (tf === '5m') timeframeMinutes = 5
                              else if (tf === '1m') timeframeMinutes = 1
                            }
                            const endTimestamp = startTimestamp + (timeframeMinutes * 60 * 1000)
                            if (endTimestamp <= Date.now()) {
                              isResolved = true
                            }
                          }
                        }
                        
                        // Fallback to marketEndDate or API flags
                        if (!isResolved) {
                          if (position.marketEndDate && position.marketEndDate.trim() !== '') {
                            // Parse endDate - could be just a date string like "2025-12-26" or full ISO string
                            const endDateStr = position.marketEndDate
                            let endDate: Date
                            // If it's just a date (YYYY-MM-DD), add end of day time
                            if (/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
                              endDate = new Date(endDateStr + 'T23:59:59Z')
                            } else {
                              endDate = new Date(endDateStr)
                            }
                            if (!isNaN(endDate.getTime()) && endDate.getTime() <= Date.now()) {
                              isResolved = true
                            }
                          }
                          
                          // Final fallback: use position.resolved flag (set correctly in fetchPositions)
                          if (!isResolved && position.resolved) {
                            isResolved = true
                          }
                        }
                      }
                      
                      // Use live price ONLY for active (non-resolved) positions matching current market by tokenId
                      let livePriceCents: number | null = null
                      if (matchesCurrentMarket && !isResolved && position.tokenId) {
                        if (position.tokenId === currentMarket?.yesTokenId) {
                          livePriceCents = livePrices.upBidPrice
                        } else if (position.tokenId === currentMarket?.noTokenId) {
                          livePriceCents = livePrices.downBidPrice
                        }
                      }
                      
                      // For resolved positions (ended markets), determine WIN/LOSS based ONLY on redeemable flag
                      // Don't use currentPrice from API as it may be from wrong market
                      const isWinner = isResolved && position.redeemable === true
                      const isLoser = isResolved && !position.redeemable
                      
                      // For ended markets: WIN = $1, LOSS = $0
                      // For active markets: use live price if available, otherwise position's currentPrice from API
                      const currentPrice = isResolved 
                        ? (isWinner ? 1.0 : 0.0)
                        : (livePriceCents !== null ? livePriceCents / 100 : position.currentPrice)
                      
                      // Use API PnL for resolved positions, calculate for active ones
                      // For ended markets, use the actual PnL from API (cashPnl) which is the final realized PnL
                      const calculatedPnl = isResolved
                        ? position.pnl
                        : (matchesCurrentMarket && livePriceCents !== null
                            ? (currentPrice - position.avgPrice) * position.size
                            : position.pnl)
                      
                      // Calculate current value
                      // For ended markets: WIN = shares * $1, LOSS = $0
                      // For active markets: currentPrice * size
                      const currentValue = isResolved 
                        ? (isWinner ? position.size * 1.0 : 0.0)
                        : (currentPrice * position.size)
                      
                      // Determine outcome color based on trade side
                      // UP/YES positions that were bought = green, DOWN/NO positions that were bought = red
                      // For sell positions, reverse the logic
                      const outcomeIsUp = positionIsUp || position.outcome?.toLowerCase().includes('yes') || position.outcome?.toLowerCase().includes('up')
                      const outcomeColor = (position.side === 'BUY' && outcomeIsUp) || (position.side === 'SELL' && !outcomeIsUp)
                        ? 'text-green-400'
                        : 'text-red-400'
                      
                      return (
                        <tr key={idx} className={`border-b border-gray-700/30 hover:bg-gray-900/20 ${isResolved ? 'opacity-60' : ''}`}>
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
                          <td className={`py-3 px-4 ${outcomeColor} font-medium`}>
                            {(() => {
                              const outcomeLower = (position.outcome || '').toLowerCase()
                              if (outcomeLower.includes('yes') || outcomeLower.includes('up')) {
                                return 'UP'
                              } else if (outcomeLower.includes('no') || outcomeLower.includes('down')) {
                                return 'DOWN'
                              }
                              return (position.outcome || '').toUpperCase()
                            })()}
                          </td>
                        <td className="py-3 px-4 text-right text-white">{position.size.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-white">{(position.avgPrice * 100).toFixed(1)}¢</td>
                          <td className={`py-3 px-4 text-right ${isResolved ? (isWinner ? 'text-green-400' : 'text-red-400') : (currentPrice > position.avgPrice ? 'text-green-400' : currentPrice < position.avgPrice ? 'text-red-400' : 'text-white')}`}>
                            {isResolved ? (
                              <span className={isWinner ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                                {isWinner ? 'WIN' : 'LOSS'}
                              </span>
                            ) : (
                              <>
                          <AnimatedPrice
                                  value={currentPrice * 100}
                            format={(val) => val.toFixed(1)}
                          />
                                ¢
                              </>
                            )}
                        </td>
                          <td className="py-3 px-4 text-right text-white">
                            {isResolved ? (
                              <span className={isWinner ? 'text-green-400' : 'text-red-400'}>
                                ${currentValue.toFixed(2)}
                              </span>
                            ) : (
                              `$${currentValue.toFixed(2)}`
                            )}
                        </td>
                          <td className={`py-3 px-4 text-right ${calculatedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {calculatedPnl >= 0 ? '+' : ''}${calculatedPnl.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isResolved ? (
                              // For ended markets, show Claim for winners, Close for losers
                              <button
                                onClick={() => position.redeemable ? handleClaimPosition(position) : handleClosePosition(position)}
                                disabled={isClaimingPosition === position.conditionId}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors opacity-100 ${
                                  isClaimingPosition === position.conditionId
                                    ? 'bg-dark-bg text-gray-500 cursor-wait border border-gray-700/50'
                                    : position.redeemable
                                      ? 'bg-green-600 hover:bg-green-500 text-white'
                                      : 'bg-dark-bg hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-700/50'
                                }`}
                                title={position.redeemable ? 'Claim winning position and receive USDC' : 'Close losing position (removes from portfolio)'}
                              >
                                {isClaimingPosition === position.conditionId 
                                  ? (position.redeemable ? 'Claiming...' : 'Closing...')
                                  : position.redeemable ? 'Claim' : 'Close'
                                }
                              </button>
                            ) : position.tokenId && position.size > 0 ? (
                              <button
                                onClick={() => handleSellAllPosition(position)}
                                disabled={isSellingPosition === position.tokenId}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                  isSellingPosition === position.tokenId
                                    ? 'bg-gray-600 text-gray-300 cursor-wait'
                                    : 'bg-orange-600 hover:bg-orange-500 text-white'
                                }`}
                                title="Sell entire position at market price"
                              >
                                {isSellingPosition === position.tokenId ? 'Selling...' : 'Sell All'}
                              </button>
                            ) : (
                              <span className="text-gray-600 text-xs">-</span>
                            )}
                      </td>
                    </tr>
                      )
                    })
                  })()}
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
                  ) : (() => {
                    // Filter orders based on hideEnded toggle using TIME LOGIC
                    const activeOrders = orders.filter((order) => {
                      // Check if market has ended using time-based logic (parse slug)
                      let isEnded = false
                      
                      if (order.slug) {
                        const timestampMatch = order.slug.match(/-(\d+)$/)
                        if (timestampMatch) {
                          const startTimestamp = parseInt(timestampMatch[1]) * 1000
                          const timeframeMatch = order.slug.match(/updown-(\d+m|1h)/)
                          let timeframeMinutes = 15
                          if (timeframeMatch) {
                            const tf = timeframeMatch[1]
                            if (tf === '1h') timeframeMinutes = 60
                            else if (tf === '15m') timeframeMinutes = 15
                            else if (tf === '5m') timeframeMinutes = 5
                            else if (tf === '1m') timeframeMinutes = 1
                          }
                          const endTimestamp = startTimestamp + (timeframeMinutes * 60 * 1000)
                          if (endTimestamp <= Date.now()) {
                            isEnded = true
                          }
                        }
                      }
                      
                      // Fallback to marketEndDate
                      if (!isEnded && order.marketEndDate && order.marketEndDate.trim() !== '') {
                        const endDate = new Date(order.marketEndDate)
                        if (!isNaN(endDate.getTime()) && endDate.getTime() <= Date.now()) {
                          isEnded = true
                        }
                      }
                      
                      // When hideEnded is true, filter out ended markets
                      if (hideEnded && isEnded) return false
                      
                      return true
                    })
                    
                    if (activeOrders.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-8 px-4 text-center text-gray-500 text-sm">
                            {isLoading ? 'Loading orders...' : hideEnded ? 'No active orders (ended markets hidden)' : 'No open orders'}
                          </td>
                        </tr>
                      )
                    }
                    
                    return activeOrders.map((order, idx) => {
                      // Check if this order's market has ended using TIME LOGIC (not API flags)
                      // Parse the slug to determine market end time
                      let isOrderEnded = false
                      
                      // Parse slug to calculate end time
                      // Slug format: "sol-updown-15m-1764356400" or "btc-updown-1h-1764356400"
                      if (order.slug) {
                        const slug = order.slug
                        const timestampMatch = slug.match(/-(\d+)$/)
                        if (timestampMatch) {
                          const startTimestamp = parseInt(timestampMatch[1]) * 1000 // Convert to ms
                          const timeframeMatch = slug.match(/updown-(\d+m|1h)/)
                          let timeframeMinutes = 15 // default
                          if (timeframeMatch) {
                            const tf = timeframeMatch[1]
                            if (tf === '1h') timeframeMinutes = 60
                            else if (tf === '15m') timeframeMinutes = 15
                            else if (tf === '5m') timeframeMinutes = 5
                            else if (tf === '1m') timeframeMinutes = 1
                          }
                          const endTimestamp = startTimestamp + (timeframeMinutes * 60 * 1000)
                          const now = Date.now()
                          if (endTimestamp <= now) {
                            isOrderEnded = true
                          }
                        }
                      }
                      
                      // Fallback to marketEndDate if slug parsing didn't work
                      if (!isOrderEnded && order.marketEndDate && order.marketEndDate.trim() !== '') {
                        const endDate = new Date(order.marketEndDate)
                        if (!isNaN(endDate.getTime()) && endDate.getTime() <= Date.now()) {
                          isOrderEnded = true
                        }
                      }
                      
                      return (
                        <tr key={order.id || idx} className={`border-b border-gray-800 hover:bg-gray-900/30 ${isOrderEnded ? 'opacity-60' : ''}`}>
                          <td className="py-3 px-4 max-w-xs truncate" title={order.market}>
                            {order.slug ? (
                              <a
                                href={`https://polymarket.com/event/${order.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white hover:text-gold-hover hover:underline transition-colors cursor-pointer"
                              >
                                {order.market}
                              </a>
                            ) : (
                              <span className="text-white">{order.market}</span>
                            )}
                          </td>
                        <td className="py-3 px-4 text-gray-400">{order.type}</td>
                        <td className="py-3 px-4">
                          <span className={order.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                            {order.side} {order.outcome}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{order.size.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-white">
                            {isOrderEnded ? (
                              <span className="text-gray-500">-</span>
                            ) : (
                              <>
                          <AnimatedPrice
                            value={order.price * 100}
                            format={(val) => val.toFixed(1)}
                          />
                                ¢
                              </>
                            )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                              isOrderEnded 
                                ? 'bg-gray-700 text-gray-400' 
                                : order.status === 'live' 
                                  ? 'bg-green-900/50 text-green-400' 
                                  : 'bg-gray-800 text-gray-400'
                          }`}>
                              {isOrderEnded ? 'ENDED' : (order.status || 'unknown').toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                            <button 
                              onClick={() => handleCancelOrder(order)}
                              disabled={isCancellingOrder === order.id}
                              className={`text-xs transition-colors opacity-100 ${
                                isCancellingOrder === order.id
                                  ? 'text-gray-500 cursor-wait'
                                  : 'text-red-400 hover:text-red-300'
                              }`}
                            >
                              {isCancellingOrder === order.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                        </td>
                      </tr>
                      )
                    })
                  })()}
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
            </div>
          </div>
          
          {/* Right: Trade Interface + Market Insights + OrderBook */}
          <TerminalRightPanel />
        </div>
      </div>
    </div>
  )
}

export default function TerminalPage() {
  return (
    <ProtectedRoute>
    <TradingProvider>
      <TerminalContent />
    </TradingProvider>
    </ProtectedRoute>
  )
}
