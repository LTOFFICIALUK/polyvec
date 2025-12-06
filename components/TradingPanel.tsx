'use client'

import { useState, useRef, useEffect, useMemo, useCallback, KeyboardEvent, MouseEvent } from 'react'
import StrategyAnalytics from './StrategyAnalytics'
import AnimatedPrice from './AnimatedPrice'
import usePolymarketPrices from '@/hooks/usePolymarketPrices'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'
import { useWallet } from '@/contexts/WalletContext'
import { useToast } from '@/contexts/ToastContext'
import { createSignedOrder, OrderSide, OrderType, SignatureType } from '@/lib/polymarket-order-signing'
import { getBrowserProvider, ensurePolygonNetwork } from '@/lib/polymarket-auth'
import { 
  checkUsdcAllowance, 
  approveUsdc, 
  syncAllowanceWithPolymarket, 
  AllowanceStatus, 
  CTF_EXCHANGE, 
  NEG_RISK_CTF_EXCHANGE,
  checkConditionalTokenApproval,
  approveConditionalTokens,
  syncConditionalTokenAllowance,
  ConditionalTokenApprovalStatus,
} from '@/lib/usdc-approval'

// Position interface for tracking user's shares
interface MarketPosition {
  upShares: number
  downShares: number
  upAvgPrice: number
  downAvgPrice: number
}


const TradingPanel = () => {
  const { selectedPair, selectedTimeframe, activeTokenId, setActiveTokenId, marketOffset } = useTradingContext()
  const { walletAddress, polymarketCredentials, isPolymarketAuthenticated } = useWallet()
  const { showToast } = useToast()
  const [orderType, setOrderType] = useState<'market' | 'strategy' | 'analytics'>('market')
  const [executionType, setExecutionType] = useState<'market' | 'limit'>('market')
  const [amount, setAmount] = useState('')
  const [isBuy, setIsBuy] = useState(true)
  // Single shared state for UP/DOWN selection - applies to both Buy and Sell
  const [selectedOutcome, setSelectedOutcome] = useState<'up' | 'down'>('up')
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [isApprovingUsdc, setIsApprovingUsdc] = useState(false)
  const [allowanceStatus, setAllowanceStatus] = useState<AllowanceStatus | null>(null)
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false)
  // Conditional token approval status (needed for SELL orders)
  const [ctfApprovalStatus, setCtfApprovalStatus] = useState<ConditionalTokenApprovalStatus | null>(null)
  const [isApprovingCtf, setIsApprovingCtf] = useState(false)
  // Track user's position in current market for selling
  const [currentPosition, setCurrentPosition] = useState<MarketPosition>({ upShares: 0, downShares: 0, upAvgPrice: 0, downAvgPrice: 0 })
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const [enabledStrategies, setEnabledStrategies] = useState<Record<string, boolean>>({
    'Momentum Breakout': false,
    'RSI Reversal': false,
    'MACD Crossover': false,
    'Bollinger Squeeze': false,
  })
  const [limitPrice, setLimitPrice] = useState('')
  const [quickTradeOptions, setQuickTradeOptions] = useState([
    { quantity: 5, price: 0 },
    { quantity: 10, price: 0 },
    { quantity: 25, price: 0 },
  ])
  const [showQuickTradePanel, setShowQuickTradePanel] = useState(false)
  const [quickTradeQuantity, setQuickTradeQuantity] = useState('100')
  const [quickTradePrice, setQuickTradePrice] = useState('38')
  const [isEditingQuickTrade, setIsEditingQuickTrade] = useState(false)
  const [quickTradeAmountPresets, setQuickTradeAmountPresets] = useState<string[]>([
    '25',
    '30',
    '50',
    '75',
    '100',
  ])
  const [quickTradePricePresets, setQuickTradePricePresets] = useState<string[]>([
    '50',
    '40',
    '30',
    '20',
    '10',
  ])
  const [shareQuickAddPresets, setShareQuickAddPresets] = useState<string[]>(['5', '10', '25', '100'])
  const [isEditingSharePresets, setIsEditingSharePresets] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ x: 100, y: 100 })
  const saveSharePresetEdits = () => {
    setShareQuickAddPresets((prev) => prev.map((value) => (value.trim().length ? value : '0')))
    setIsEditingSharePresets(false)
  }

  const handleSharePresetInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveSharePresetEdits()
    }
  }
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const popupRef = useRef<HTMLDivElement>(null)

  // Update limit price when switching to limit mode
  const handleExecutionTypeChange = (newType: 'market' | 'limit') => {
    setExecutionType(newType)
    if (newType === 'limit') {
      // Set initial limit price to current market price
      const currentPrice = isBuy ? yesPriceFormatted : noPriceFormatted
      if (currentPrice !== 'ERROR' && !limitPrice) {
        setLimitPrice(currentPrice)
      } else if (currentPrice !== 'ERROR' && parseFloat(limitPrice) === 0) {
        setLimitPrice(currentPrice)
      }
    }
  }

  const handleAmountClick = (value: string) => {
    setAmount(value)
  }

  // Drag handlers for Quick Limit popup
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!popupRef.current) return
    const rect = popupRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
    setIsDragging(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isDragging || !popupRef.current) return
      
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y
      
      // Constrain to viewport
      const popupWidth = popupRef.current.offsetWidth
      const popupHeight = popupRef.current.offsetHeight
      const maxX = window.innerWidth - popupWidth
      const maxY = window.innerHeight - popupHeight
      
      setPopupPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleBuy = () => {
    // Only switch to Buy mode, don't change UP/DOWN selection
    setIsBuy(true)
  }

  const handleSell = () => {
    // Only switch to Sell mode, don't change UP/DOWN selection
    setIsBuy(false)
  }

  const {
    market: currentMarket,
    loading: currentMarketLoading,
    error: currentMarketError,
  } = useCurrentMarket({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    offset: marketOffset,
  })

  // Get real-time Polymarket prices with minimal delay
  // Pass token IDs from currentMarket (fetched via Railway ws-service)
  const { prices, loading, error } = usePolymarketPrices({
    pair: selectedPair,
    timeframe: selectedTimeframe,
    interval: 5000, // Update every 5 seconds to reduce load
    useWebSocket: false, // Set to true once WebSocket is properly configured
    yesTokenId: currentMarket?.yesTokenId || undefined,
    noTokenId: currentMarket?.noTokenId || undefined,
  })

  // Fetch orderbook data for UP and DOWN tokens to get best bid/ask
  const [orderbookPrices, setOrderbookPrices] = useState<{
    upBestBid: number | null
    upBestAsk: number | null
    downBestBid: number | null
    downBestAsk: number | null
  }>({
    upBestBid: null,
    upBestAsk: null,
    downBestBid: null,
    downBestAsk: null,
  })

  useEffect(() => {
    const fetchOrderbookPrices = async () => {
      if (!currentMarket?.yesTokenId || !currentMarket?.noTokenId) return

      try {
        // Fetch orderbooks for both UP and DOWN tokens
        const [upResponse, downResponse] = await Promise.all([
          fetch(`/api/polymarket/orderbook?tokenId=${currentMarket.yesTokenId}`),
          fetch(`/api/polymarket/orderbook?tokenId=${currentMarket.noTokenId}`),
        ])

        if (upResponse.ok && downResponse.ok) {
          const upData = await upResponse.json()
          const downData = await downResponse.json()

          // Extract best bid (highest) and best ask (lowest)
          // Bids are sorted highest first, asks are sorted lowest first
          const upBestBid = upData.bids?.[0]?.price ? parseFloat(upData.bids[0].price) * 100 : null
          const upBestAsk = upData.asks?.[0]?.price ? parseFloat(upData.asks[0].price) * 100 : null
          const downBestBid = downData.bids?.[0]?.price ? parseFloat(downData.bids[0].price) * 100 : null
          const downBestAsk = downData.asks?.[0]?.price ? parseFloat(downData.asks[0].price) * 100 : null

          setOrderbookPrices({
            upBestBid,
            upBestAsk,
            downBestBid,
            downBestAsk,
          })
        }
      } catch (err) {
        console.error('Error fetching orderbook prices:', err)
      }
    }

    fetchOrderbookPrices()
    // Poll every 2 seconds to keep prices fresh
    const interval = setInterval(fetchOrderbookPrices, 2000)
    return () => clearInterval(interval)
  }, [currentMarket?.yesTokenId, currentMarket?.noTokenId])

  // Check if market is past (ended)
  const isMarketEnded = currentMarket.isPast === true || currentMarket.marketStatus === 'ended'

  // Use orderbook prices if available, fallback to pricing API
  // Format as whole cents (no decimals)
  // For ended markets, show "Ended" instead of prices
  const yesPriceFormatted = isMarketEnded 
    ? 'Ended'
    : orderbookPrices.upBestAsk !== null 
      ? Math.round(orderbookPrices.upBestAsk).toString()
      : (error || !prices ? 'ERROR' : Math.round(prices.yesPrice * 100).toString())
  
  const noPriceFormatted = isMarketEnded
    ? 'Ended'
    : orderbookPrices.downBestAsk !== null
      ? Math.round(orderbookPrices.downBestAsk).toString()
      : (error || !prices ? 'ERROR' : Math.round(prices.noPrice * 100).toString())

  // For sell buttons, use best bid (what you'd get when selling)
  const yesSellPriceFormatted = isMarketEnded
    ? 'Ended'
    : orderbookPrices.upBestBid !== null
      ? Math.round(orderbookPrices.upBestBid).toString()
      : (error || !prices ? 'ERROR' : Math.round(prices.yesPrice * 100).toString())
  
  const noSellPriceFormatted = isMarketEnded
    ? 'Ended'
    : orderbookPrices.downBestBid !== null
      ? Math.round(orderbookPrices.downBestBid).toString()
      : (error || !prices ? 'ERROR' : Math.round(prices.noPrice * 100).toString())

  // Determine if we're trading UP (green) or DOWN (red) - uses shared outcome
  const isTradingUp = selectedOutcome === 'up'
  const isTradingDown = selectedOutcome === 'down'

  const formattedMarketStart =
    currentMarket.startTime != null
      ? new Date(currentMarket.startTime).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null
  const formattedMarketEnd =
    currentMarket.endTime != null
      ? new Date(currentMarket.endTime).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null

  const handlePolymarketLinkClick = (event?: MouseEvent<HTMLAnchorElement>) => {
    event?.preventDefault()
    if (!currentMarket.polymarketUrl || typeof window === 'undefined') return
    window.open(currentMarket.polymarketUrl, '_blank', 'noopener,noreferrer')
  }

  const handlePolymarketLinkKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handlePolymarketLinkClick()
  }

  // Check USDC allowance when wallet connects or changes
  useEffect(() => {
    const checkAllowance = async () => {
      if (!walletAddress || typeof window === 'undefined') {
        setAllowanceStatus(null)
        return
      }

      setIsCheckingAllowance(true)
      try {
        const provider = await getBrowserProvider()
        if (!provider) {
          console.warn('[Allowance] No provider available')
          return
        }

        // Check both regular and neg-risk exchanges
        const [regularStatus, negRiskStatus] = await Promise.all([
          checkUsdcAllowance(provider, walletAddress, CTF_EXCHANGE),
          checkUsdcAllowance(provider, walletAddress, NEG_RISK_CTF_EXCHANGE),
        ])

        // Combine status - need approval for both exchanges
        const combinedStatus: AllowanceStatus = {
          ...regularStatus,
          needsAnyApproval: regularStatus.needsAnyApproval || negRiskStatus.needsAnyApproval,
        }

        setAllowanceStatus(combinedStatus)
        console.log('[Allowance] Status:', combinedStatus)
      } catch (error) {
        console.error('[Allowance] Error checking:', error)
      } finally {
        setIsCheckingAllowance(false)
      }
    }

    checkAllowance()
  }, [walletAddress])

  // Check conditional token approval when wallet connects (needed for SELL orders)
  useEffect(() => {
    const checkCtfAllowance = async () => {
      if (!walletAddress || typeof window === 'undefined') {
        setCtfApprovalStatus(null)
        return
      }

      console.log('[CTF Approval] Checking approval status for:', walletAddress)
      
      try {
        const provider = await getBrowserProvider()
        if (!provider) {
          console.warn('[CTF Approval] No provider available')
          return
        }

        const status = await checkConditionalTokenApproval(provider, walletAddress)
        setCtfApprovalStatus(status)
        console.log('[CTF Approval] Status loaded:', status)
        
        if (status.needsApproval) {
          console.log('[CTF Approval] Approval needed for selling')
        } else {
          console.log('[CTF Approval] ✓ Already approved for selling')
        }
      } catch (error) {
        console.error('[CTF Approval] Error checking:', error)
        // Set as needing approval on error so user can still try
        setCtfApprovalStatus({
          ctfApproved: false,
          negRiskApproved: false,
          needsApproval: true,
        })
      }
    }

    checkCtfAllowance()
  }, [walletAddress])

  // Handle conditional token approval (for selling)
  const handleApproveConditionalTokens = async () => {
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error')
      return
    }

    setIsApprovingCtf(true)
    console.log('[CTF Approval] Starting approval process...')

    try {
      const provider = await getBrowserProvider()
      if (!provider) throw new Error('No provider available')

      await ensurePolygonNetwork(provider)
      
      showToast('Approving tokens... Please confirm 2 transactions in your wallet', 'info')
      console.log('[CTF Approval] Calling approveConditionalTokens...')

      // Approve conditional tokens (2 transactions)
      const result = await approveConditionalTokens(provider)
      console.log('[CTF Approval] Approval complete, tx hashes:', result.txHashes)

      showToast('✓ On-chain approval complete!', 'success')

      // Sync with Polymarket API
      if (polymarketCredentials) {
        console.log('[CTF Approval] Syncing with Polymarket API...')
        showToast('Syncing with Polymarket...', 'info')
        const syncResult = await syncConditionalTokenAllowance(walletAddress, polymarketCredentials)
        console.log('[CTF Approval] Sync result:', syncResult)
      }

      // Refresh status
      console.log('[CTF Approval] Refreshing approval status...')
      const newStatus = await checkConditionalTokenApproval(provider, walletAddress)
      console.log('[CTF Approval] New status:', newStatus)
      setCtfApprovalStatus(newStatus)

      if (!newStatus.needsApproval) {
        showToast('🎉 Tokens approved! You can now sell your positions.', 'success')
      } else {
        showToast('Approval completed but status still shows pending. Try refreshing.', 'info')
      }
    } catch (error: any) {
      console.error('[CTF Approval] Error:', error)
      if (error.code === 4001 || error.message?.includes('rejected') || error.message?.includes('user rejected')) {
        showToast('Approval cancelled by user', 'error')
      } else {
        showToast(`Approval failed: ${error.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsApprovingCtf(false)
      console.log('[CTF Approval] Process finished')
    }
  }

  // Fetch user's position for current market (for selling)
  const fetchCurrentPosition = useCallback(async () => {
    if (!walletAddress || !currentMarket.yesTokenId || !currentMarket.noTokenId) {
      setCurrentPosition({ upShares: 0, downShares: 0, upAvgPrice: 0, downAvgPrice: 0 })
      return
    }

    setIsLoadingPosition(true)
    try {
      const response = await fetch(`/api/user/positions?address=${walletAddress}`)
      if (response.ok) {
        const data = await response.json()
        const positions = data.positions || []
        
        // Find positions matching the current market's token IDs
        let upShares = 0
        let downShares = 0
        let upAvgPrice = 0
        let downAvgPrice = 0
        
        for (const pos of positions) {
          const posAsset = pos.asset || pos.tokenId || ''
          if (posAsset === currentMarket.yesTokenId) {
            upShares = parseFloat(pos.size || '0')
            upAvgPrice = parseFloat(pos.avgPrice || '0')
          } else if (posAsset === currentMarket.noTokenId) {
            downShares = parseFloat(pos.size || '0')
            downAvgPrice = parseFloat(pos.avgPrice || '0')
          }
        }
        
        setCurrentPosition({ upShares, downShares, upAvgPrice, downAvgPrice })
        console.log('[Trading] Position loaded:', { upShares, downShares, upAvgPrice, downAvgPrice })
      }
    } catch (error) {
      console.error('[Trading] Error fetching position:', error)
      setCurrentPosition({ upShares: 0, downShares: 0, upAvgPrice: 0, downAvgPrice: 0 })
    } finally {
      setIsLoadingPosition(false)
    }
  }, [walletAddress, currentMarket.yesTokenId, currentMarket.noTokenId])

  // Refresh position when market or wallet changes
  useEffect(() => {
    fetchCurrentPosition()
  }, [fetchCurrentPosition])

  // Get available shares for selling based on selected outcome
  const availableShares = selectedOutcome === 'up' ? currentPosition.upShares : currentPosition.downShares
  const avgEntryPrice = selectedOutcome === 'up' ? currentPosition.upAvgPrice : currentPosition.downAvgPrice

  // Handle setting max shares for selling
  const handleMaxShares = () => {
    if (availableShares > 0) {
      setAmount(availableShares.toString())
    }
  }

  // Handle USDC approval
  const handleApproveUsdc = async () => {
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error')
      return
    }

    setIsApprovingUsdc(true)
    showToast('Approving USDC for trading... Please confirm in your wallet', 'info')

    try {
      const provider = await getBrowserProvider()
      if (!provider) {
        throw new Error('No provider available')
      }

      // Ensure we're on Polygon
      await ensurePolygonNetwork(provider)

      // Determine which USDC to approve (native has balance)
      const usdcType = allowanceStatus?.nativeUsdc.balance ? 'native' : 'bridged'

      // Approve for regular CTF Exchange
      showToast(`Approving ${usdcType} USDC for CTF Exchange...`, 'info')
      await approveUsdc(provider, usdcType, CTF_EXCHANGE)

      // Approve for Neg-Risk CTF Exchange
      showToast(`Approving ${usdcType} USDC for Neg-Risk Exchange...`, 'info')
      await approveUsdc(provider, usdcType, NEG_RISK_CTF_EXCHANGE)

      showToast('On-chain approval complete! Syncing with Polymarket...', 'info')

      // Sync with Polymarket's internal balance/allowance system
      // This is required for Polymarket to recognize the on-chain approval
      if (polymarketCredentials) {
        const syncResult = await syncAllowanceWithPolymarket(walletAddress, polymarketCredentials)
        console.log('[Approval] Sync result:', syncResult)
        
        if (syncResult.collateral) {
          showToast('USDC approved and synced! You can now trade on Polymarket.', 'success')
        } else {
          showToast('USDC approved on-chain. If trading fails, try again or refresh the page.', 'warning')
        }
      } else {
        showToast('USDC approved! Please authenticate with Polymarket if not already done.', 'success')
      }

      // Refresh allowance status
      const newStatus = await checkUsdcAllowance(provider, walletAddress, CTF_EXCHANGE)
      setAllowanceStatus(newStatus)
    } catch (error: any) {
      console.error('[Approval] Error:', error)
      if (error.code === 4001 || error.message?.includes('rejected')) {
        showToast('Approval cancelled by user', 'error')
      } else {
        showToast(`Approval failed: ${error.message || 'Unknown error'}`, 'error')
      }
    } finally {
      setIsApprovingUsdc(false)
    }
  }

  // Test credentials before placing order
  const testCredentials = async () => {
    if (!walletAddress || !polymarketCredentials) {
      showToast('No credentials to test', 'error')
      return
    }

    showToast('Testing credentials...', 'info')

    try {
      const response = await fetch('/api/polymarket/test-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          credentials: polymarketCredentials,
        }),
      })

      const result = await response.json()
      console.log('[Test Credentials] Result:', result)

      if (result.success) {
        showToast('Credentials are valid!', 'success')
      } else {
        showToast(`Credentials invalid: ${result.error || 'Unknown error'}`, 'error')
        console.error('[Test Credentials] Error details:', result)
      }
    } catch (error: any) {
      console.error('[Test Credentials] Error:', error)
      showToast(`Test failed: ${error.message}`, 'error')
    }
  }

  // Handle order placement
  const handlePlaceOrder = async () => {
    // Validation
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error')
      return
    }

    if (!isPolymarketAuthenticated || !polymarketCredentials) {
      showToast('Please authenticate with Polymarket first', 'error')
      return
    }

    if (!currentMarket.yesTokenId || !currentMarket.noTokenId) {
      showToast('Market token IDs not available. Please wait for market data to load.', 'error')
      return
    }

    const shares = parseFloat(amount)
    if (!shares || shares <= 0) {
      showToast('Please enter a valid number of shares', 'error')
      return
    }

    // Validate minimum order size (Polymarket requires minimum 5 shares)
    const MIN_ORDER_SIZE = 5
    if (shares < MIN_ORDER_SIZE) {
      showToast(
        `Order size too small: ${shares.toFixed(2)} shares. Polymarket requires a minimum of ${MIN_ORDER_SIZE} shares per order. Please increase your order size to at least ${MIN_ORDER_SIZE} shares.`,
        'error',
        6000
      )
      return
    }

    // For SELL orders, validate user has enough shares and check approval
    if (!isBuy) {
      const maxShares = selectedOutcome === 'up' ? currentPosition.upShares : currentPosition.downShares
      if (shares > maxShares) {
        showToast(`You only have ${maxShares.toFixed(2)} ${selectedOutcome === 'up' ? 'UP' : 'DOWN'} shares to sell`, 'error')
        return
      }
      if (maxShares <= 0) {
        showToast(`You don't have any ${selectedOutcome === 'up' ? 'UP' : 'DOWN'} shares to sell`, 'error')
        return
      }
      
      // Check if conditional tokens are approved (warn but don't block - let API error handle it)
      if (ctfApprovalStatus?.needsApproval) {
        showToast('Warning: Conditional tokens may not be approved. If the order fails, please approve your tokens for selling.', 'warning', 5000)
      }
    }

    // For limit orders, validate price
    if (executionType === 'limit') {
      const price = parseFloat(limitPrice)
      if (!price || price <= 0 || price > 100) {
        showToast('Please enter a valid limit price (0-100 cents)', 'error')
        return
      }
    }

    setIsPlacingOrder(true)

    try {
      // Get browser provider
      const provider = getBrowserProvider()
      if (!provider) {
        throw new Error('No wallet provider found. Please install MetaMask or Phantom.')
      }

      // Ensure we're on Polygon network
      await ensurePolygonNetwork(provider)

      // Determine token ID based on selected outcome
      const tokenId = selectedOutcome === 'up' ? currentMarket.yesTokenId! : currentMarket.noTokenId!

      // Determine order side
      const side = isBuy ? OrderSide.BUY : OrderSide.SELL

      // Convert price from cents to decimal (e.g., 50 -> 0.50)
      const priceDecimal = executionType === 'limit' 
        ? parseFloat(limitPrice) / 100 
        : selectedOutcome === 'up'
          ? parseFloat(yesPriceFormatted) / 100
          : parseFloat(noPriceFormatted) / 100

      // Determine order type
      let polymarketOrderType: OrderType
      if (executionType === 'limit') {
        // For limit orders, use GTC (Good-Til-Cancelled)
        // Could add GTD support later with expiration date
        polymarketOrderType = OrderType.GTC
      } else {
        // For market orders, use FOK (Fill-Or-Kill)
        // Could add FAK support later
        polymarketOrderType = OrderType.FOK
      }

      // Check if this is a neg-risk market (determines which exchange to use for signing)
      let isNegRiskMarket = false
      try {
        const negRiskResponse = await fetch(`/api/polymarket/neg-risk?tokenId=${tokenId}`)
        const negRiskData = await negRiskResponse.json()
        isNegRiskMarket = negRiskData.negRisk === true
        console.log(`[Trading] Token ${tokenId.substring(0, 20)}... negRisk: ${isNegRiskMarket}`)
      } catch (error) {
        console.warn('[Trading] Failed to check neg-risk status, defaulting to false:', error)
      }

      // Show info toast about signing requirement
      showToast('Please sign the order in your wallet...', 'info')

      // Create and sign the order (this will prompt user to sign)
      const signedOrder = await createSignedOrder(
        {
          tokenId: tokenId,
          side: side,
          price: priceDecimal,
          size: shares,
          maker: walletAddress,
          signer: walletAddress,
          negRisk: isNegRiskMarket,
        },
        provider,
        SignatureType.EOA
      )

      // Send order to our API
      const response = await fetch('/api/trade/place-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: walletAddress,
          credentials: polymarketCredentials,
          signedOrder: signedOrder,
          orderType: polymarketOrderType,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        console.error('[Trading] Order placement failed:', result)
        console.error('[Trading] Full error details:', JSON.stringify(result.details, null, 2))
        console.error('[Trading] Error code:', result.errorCode)
        
        // Show detailed error toast based on error code
        let errorMessage = result.error || result.details?.errorMsg || 'Failed to place order'
        
        // Provide user-friendly error messages based on error codes
        if (result.errorCode === 'FOK_ORDER_NOT_FILLED_ERROR' || errorMessage.includes('FOK')) {
          errorMessage = `Market order failed: Not enough liquidity to fill ${shares} shares. Try a smaller size or use a limit order.`
        } else if (result.errorCode === 'INVALID_ORDER_NOT_ENOUGH_BALANCE' || 
                   result.errorCode === 'not enough balance / allowance' ||
                   errorMessage.toLowerCase().includes('not enough balance') ||
                   errorMessage.toLowerCase().includes('allowance')) {
          // Different messages for BUY vs SELL orders
          if (!isBuy) {
            errorMessage = 'Sell order failed: Not enough conditional tokens or they are not approved. Please approve your tokens for selling or check your position.'
          } else {
            errorMessage = 'Buy order failed: Not enough USDC balance or allowance. Please approve USDC for trading or check your balance.'
          }
        } else if (result.errorCode === 'INVALID_ORDER_MIN_SIZE' || 
                   (errorMessage.toLowerCase().includes('size') && errorMessage.toLowerCase().includes('minimum'))) {
          // Extract minimum size from error message if available
          const minSizeMatch = errorMessage.match(/minimum[:\s]+(\d+)/i)
          const minSize = minSizeMatch ? minSizeMatch[1] : '5'
          const sizeMatch = errorMessage.match(/Size[:\s(]+([\d.]+)/i)
          const attemptedSize = sizeMatch ? sizeMatch[1] : shares.toFixed(2)
          errorMessage = `Order size too small: ${attemptedSize} shares. Polymarket requires a minimum of ${minSize} shares per order. Please increase your order size to at least ${minSize} shares.`
        } else if (result.errorCode === 'INVALID_ORDER_MIN_TICK_SIZE') {
          errorMessage = 'Order price breaks minimum tick size rules. Please adjust your price.'
        } else if (result.errorCode === 'AUTH_FAILED') {
          errorMessage = 'Authentication failed. Please re-authenticate with Polymarket.'
        } else if (result.errorCode === 'INVALID_ORDER_DUPLICATED') {
          errorMessage = 'This order has already been placed. Please check your open orders.'
        }
        
        showToast(errorMessage, 'error')
        throw new Error(errorMessage)
      }

      // Build success message with order details
      const orderTypeText = executionType === 'limit' ? 'Limit' : 'Market'
      const sideText = isBuy ? 'Buy' : 'Sell'
      const outcomeText = selectedOutcome === 'up' ? 'UP' : 'DOWN'
      const priceText = executionType === 'limit' 
        ? `@ ${limitPrice}¢` 
        : `@ ${(priceDecimal * 100).toFixed(0)}¢`
      
      const successMessage = `✓ Order placed! ${sideText} ${outcomeText} ${shares} shares ${priceText} (${orderTypeText})${result.orderId ? ` | ID: ${result.orderId}` : ''}`
      
      showToast(successMessage, 'success')
      
      // Dispatch event to refresh orders in the positions panel
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orderPlaced'))
      }
      
      // Clear form after successful order
      setAmount('')
      if (executionType === 'limit') {
        setLimitPrice('')
      }
    } catch (error: any) {
      console.error('Error placing order:', error)
      
      // Check if user rejected the signature
      if (error.message?.includes('rejected') || error.message?.includes('User rejected')) {
        showToast('Order cancelled - signature rejected by user', 'warning')
      } else if (!error.message?.includes('FOK') && !error.message?.includes('liquidity') && !error.message?.includes('balance')) {
        // Only show generic error if we haven't already shown a specific one
        showToast(error.message || 'Failed to place order. Please try again.', 'error')
      }
    } finally {
      setIsPlacingOrder(false)
    }
  }

  const selectableAmountPresets = useMemo(
    () =>
      quickTradeAmountPresets
        .map((value, index) => ({ value: value.trim(), index }))
        .filter(({ value }) => value.length > 0),
    [quickTradeAmountPresets],
  )

  const selectablePricePresets = useMemo(
    () =>
      quickTradePricePresets
        .map((value, index) => ({ value: value.trim(), index }))
        .filter(({ value }) => value.length > 0),
    [quickTradePricePresets],
  )

  useEffect(() => {
    if (!selectablePricePresets.length) return

    const selectedPrice = parseFloat(quickTradePrice)
    const normalizedSelected = Number.isNaN(selectedPrice) ? null : selectedPrice.toString()
    const hasSelection = normalizedSelected !== null && quickTradePricePresets.includes(normalizedSelected)

    if (!quickTradePrice || !hasSelection) {
      const defaultPrice = quickTradePricePresets[0]
      setQuickTradePrice(defaultPrice)
      if (executionType === 'limit') {
        setLimitPrice(defaultPrice)
      }
    }
  }, [selectablePricePresets, quickTradePrice, executionType, quickTradePricePresets])

  // Mock strategies list - would come from API
  const strategies = ['Momentum Breakout', 'RSI Reversal', 'MACD Crossover', 'Bollinger Squeeze']

  // Store orderType to avoid TypeScript narrowing issues
  const currentOrderType = orderType

  // Render tab buttons (reusable component)
  const renderTabButtons = () => (
    <div className="flex gap-2 items-center">
      <button
        onClick={() => setOrderType('market')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 flex items-center justify-center gap-2 ${
          currentOrderType === 'market'
            ? 'bg-purple-primary text-white shadow-lg shadow-purple-500/20'
            : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        <span>{executionType === 'limit' ? 'Limit' : 'Market'}</span>
        {currentOrderType === 'market' && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              handleExecutionTypeChange(executionType === 'market' ? 'limit' : 'market')
            }}
            className="p-1 rounded transition-all duration-200 hover:bg-white/10 focus:outline-none cursor-pointer"
            role="button"
            aria-label={`Switch to ${executionType === 'market' ? 'limit' : 'market'} order`}
            title={`Switch to ${executionType === 'market' ? 'limit' : 'market'} order`}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                executionType === 'limit' ? 'rotate-180' : ''
              }`}
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
          </span>
        )}
      </button>
      <button
        onClick={() => setOrderType('strategy')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 ${
          currentOrderType === 'strategy'
            ? 'bg-purple-primary text-white shadow-lg shadow-purple-500/20'
            : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        Strategies
      </button>
      <button
        onClick={() => setOrderType('analytics')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 ${
          currentOrderType === 'analytics'
            ? 'bg-purple-primary text-white shadow-lg shadow-purple-500/20'
            : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
      >
        Analytics
      </button>
    </div>
  )

  // Show analytics panel if Analytics tab is selected
  if (currentOrderType === 'analytics') {
    return (
      <div className="h-full flex flex-col bg-black max-h-[50vh] lg:max-h-none overflow-y-auto">
        {/* Order Type Selector */}
        <div className="border-b border-gray-800 p-3 sm:p-4 bg-gray-900/30 flex-shrink-0">
          {renderTabButtons()}
        </div>

        {/* Strategy Analytics Panel */}
        <div className="flex-1 overflow-y-auto">
          <StrategyAnalytics selectedStrategy={selectedStrategy} />
        </div>
      </div>
    )
  }

  // Show strategy selector if Strategy tab is selected
  if (currentOrderType === 'strategy') {
    return (
      <div className="h-full flex flex-col bg-black max-h-[50vh] lg:max-h-none overflow-y-auto">
        {/* Order Type Selector */}
        <div className="border-b border-gray-800 p-3 sm:p-4 bg-gray-900/30 flex-shrink-0">
          {renderTabButtons()}
        </div>

        {/* Strategy Selector */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <h3 className="text-white font-semibold text-sm mb-2">Manage Strategies</h3>
            <p className="text-gray-400 text-xs">Toggle strategies on/off or click to view analytics</p>
          </div>

          <div className="space-y-2">
            {strategies.map((strategy) => {
              const isEnabled = enabledStrategies[strategy] || false
              return (
                <div
                  key={strategy}
                  className={`w-full p-3 rounded-lg transition-all duration-200 border ${
                    selectedStrategy === strategy
                      ? 'bg-purple-primary/20 border-purple-primary'
                      : 'bg-gray-900/50 border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => {
                        setSelectedStrategy(strategy)
                        setOrderType('analytics')
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="font-medium text-sm text-white">{strategy}</div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEnabledStrategies((prev) => ({
                          ...prev,
                          [strategy]: !prev[strategy],
                        }))
                      }}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-primary focus:ring-offset-2 focus:ring-offset-black ${
                        isEnabled ? 'bg-purple-primary' : 'bg-gray-700'
                      }`}
                      role="switch"
                      aria-checked={isEnabled}
                      aria-label={`Toggle ${strategy} strategy`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Default Market view
  return (
    <div className="h-full flex flex-col bg-black max-h-[50vh] lg:max-h-none overflow-y-auto">
      {/* Order Type Selector */}
      <div className="border-b border-gray-800 p-3 sm:p-4 bg-gray-900/30 flex-shrink-0">
        {renderTabButtons()}
      </div>

      {/* Buy/Sell Tabs */}
      <div className="border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center">
          <div className="flex flex-1">
            <button
              onClick={handleBuy}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative ${
                isBuy
                  ? (isTradingUp ? 'text-green-400' : 'text-red-400')
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Buy
              {isBuy && (
                <div className={`absolute bottom-0 left-0 right-0 h-px ${
                  isTradingUp ? 'bg-green-500' : 'bg-red-500'
                }`} />
              )}
            </button>
            <button
              onClick={handleSell}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition-all duration-200 relative ${
                !isBuy
                  ? (isTradingUp ? 'text-green-400' : 'text-red-400')
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Sell
              {!isBuy && (
                <div className={`absolute bottom-0 left-0 right-0 h-px ${
                  isTradingUp ? 'bg-green-500' : 'bg-red-500'
                }`} />
              )}
            </button>
          </div>
          {/* Time Icon Button for Quick Limit */}
          <button
            onClick={() => setShowQuickTradePanel(!showQuickTradePanel)}
            className="px-3 py-3 text-gray-400 hover:text-white transition-colors"
            aria-label="Quick Limit"
            title="Quick Limit"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
      </div>


      {/* Limit Order Section - only shown when executionType is 'limit' */}
      {executionType === 'limit' && (
        <div className="border-b border-gray-800 p-4 flex-shrink-0 space-y-4">
          {/* Price Target Buttons */}
          <div className="flex gap-2">
            {isBuy ? (
              <>
                {/* Buy Up Button */}
                <button
                  onClick={() => {
                    setIsBuy(true)
                    setSelectedOutcome('up')
                    setActiveTokenId('up')
                    const upPrice = parseFloat(yesPriceFormatted) || 0
                    setLimitPrice(Math.round(upPrice).toString())
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    selectedOutcome === 'up' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                  }`}
                >
                  <span>Buy Up</span>
                  <span className={`text-xs font-semibold ${selectedOutcome === 'up' ? 'text-green-400' : 'text-gray-400'}`}>
                    {yesPriceFormatted === 'Ended' || yesPriceFormatted === 'ERROR' ? (
                      `${yesPriceFormatted}¢`
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(yesPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
                {/* Buy Down Button */}
                <button
                  onClick={() => {
                    setIsBuy(true)
                    setSelectedOutcome('down')
                    setActiveTokenId('down')
                    const downPrice = parseFloat(noPriceFormatted) || 0
                    setLimitPrice(Math.round(downPrice).toString())
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    selectedOutcome === 'down' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60'
                  }`}
                >
                  <span>Buy Down</span>
                  <span className={`text-xs font-semibold ${selectedOutcome === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                    {noPriceFormatted === 'Ended' || noPriceFormatted === 'ERROR' ? (
                      `${noPriceFormatted}¢`
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(noPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
              </>
            ) : (
              <>
                {/* Sell Up Button */}
                <button
                  onClick={() => {
                    setIsBuy(false)
                    setSelectedOutcome('up')
                    setActiveTokenId('up')
                    const upPrice = parseFloat(yesSellPriceFormatted) || 0
                    setLimitPrice(Math.round(upPrice).toString())
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    selectedOutcome === 'up' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                  }`}
                >
                  <span>Sell Up</span>
                  <span className={`text-xs font-semibold ${selectedOutcome === 'up' ? 'text-green-400' : 'text-gray-400'}`}>
                    {yesSellPriceFormatted === 'Ended' || yesSellPriceFormatted === 'ERROR' ? (
                      `${yesSellPriceFormatted}¢`
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(yesSellPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
                {/* Sell Down Button */}
                <button
                  onClick={() => {
                    setIsBuy(false)
                    setSelectedOutcome('down')
                    setActiveTokenId('down')
                    const downPrice = parseFloat(noSellPriceFormatted) || 0
                    setLimitPrice(Math.round(downPrice).toString())
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    selectedOutcome === 'down' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60'
                  }`}
                >
                  <span>Sell Down</span>
                  <span className={`text-xs font-semibold ${selectedOutcome === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                    {noSellPriceFormatted === 'Ended' || noSellPriceFormatted === 'ERROR' ? (
                      `${noSellPriceFormatted}¢`
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(noSellPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
              </>
            )}
          </div>

          {/* Limit Price Input with +/- buttons */}
          <div>
            <label className="block text-sm text-white mb-2">Limit Price</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const current = parseFloat(limitPrice) || 0
                  const newPrice = Math.max(0, current - 1)
                  setLimitPrice(Math.round(newPrice).toString())
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Decrease price"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={limitPrice}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '')
                    setLimitPrice(value)
                  }}
                  className="w-full bg-gray-900/50 border border-gray-800 rounded px-3 py-2 pr-8 text-white text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-purple-primary"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">¢</span>
              </div>
              <button
                onClick={() => {
                  const current = parseFloat(limitPrice) || 0
                  const newPrice = Math.min(100, current + 1)
                  setLimitPrice(Math.round(newPrice).toString())
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Increase price"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy/Sell Toggle - only shown when executionType is 'market' */}
      {executionType === 'market' && (
        <div className={`border-b border-gray-800 p-4 flex-shrink-0 ${isMarketEnded ? 'opacity-50' : ''}`}>
          <div className="flex gap-2">
            {isBuy ? (
              <>
                {/* Buy Up Button */}
                <button
                  disabled={isMarketEnded}
                  onClick={() => {
                    if (isMarketEnded) return
                    setIsBuy(true)
                    setSelectedOutcome('up')
                    setActiveTokenId('up')
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    isMarketEnded
                      ? 'bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed'
                      : selectedOutcome === 'up' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                  }`}
                >
                  <span>Buy Up</span>
                  <span className={`text-xs font-semibold ${isMarketEnded ? 'text-gray-500' : selectedOutcome === 'up' ? 'text-green-400' : 'text-gray-400'}`}>
                    {isMarketEnded || yesPriceFormatted === 'ERROR' ? (
                      isMarketEnded ? 'Ended' : 'ERROR'
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(yesPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
                {/* Buy Down Button */}
                <button
                  disabled={isMarketEnded}
                  onClick={() => {
                    if (isMarketEnded) return
                    setIsBuy(true)
                    setSelectedOutcome('down')
                    setActiveTokenId('down')
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    isMarketEnded
                      ? 'bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed'
                      : selectedOutcome === 'down' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60'
                  }`}
                >
                  <span>Buy Down</span>
                  <span className={`text-xs font-semibold ${isMarketEnded ? 'text-gray-500' : selectedOutcome === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                    {isMarketEnded || noPriceFormatted === 'ERROR' ? (
                      isMarketEnded ? 'Ended' : 'ERROR'
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(noPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
              </>
            ) : (
              <>
                {/* Sell Up Button */}
                <button
                  disabled={isMarketEnded}
                  onClick={() => {
                    if (isMarketEnded) return
                    setIsBuy(false)
                    setSelectedOutcome('up')
                    setActiveTokenId('up')
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    isMarketEnded
                      ? 'bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed'
                      : selectedOutcome === 'up' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                  }`}
                >
                  <span>Sell Up</span>
                  <span className={`text-xs font-semibold ${isMarketEnded ? 'text-gray-500' : selectedOutcome === 'up' ? 'text-green-400' : 'text-gray-400'}`}>
                    {isMarketEnded || yesSellPriceFormatted === 'ERROR' ? (
                      isMarketEnded ? 'Ended' : 'ERROR'
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(yesSellPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
                {/* Sell Down Button */}
                <button
                  disabled={isMarketEnded}
                  onClick={() => {
                    if (isMarketEnded) return
                    setIsBuy(false)
                    setSelectedOutcome('down')
                    setActiveTokenId('down')
                  }}
                  className={`flex-1 px-3 sm:px-4 py-2.5 sm:py-3.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 uppercase flex items-center justify-between border ${
                    isMarketEnded
                      ? 'bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed'
                      : selectedOutcome === 'down' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60'
                  }`}
                >
                  <span>Sell Down</span>
                  <span className={`text-xs font-semibold ${isMarketEnded ? 'text-gray-500' : selectedOutcome === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                    {isMarketEnded || noSellPriceFormatted === 'ERROR' ? (
                      isMarketEnded ? 'Ended' : 'ERROR'
                    ) : (
                      <>
                        <AnimatedPrice
                          value={parseFloat(noSellPriceFormatted)}
                          format={(val) => Math.round(val).toString()}
                        />
                        ¢
                      </>
                    )}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Shares/Amount Input */}
      <div className="border-b border-gray-800 p-4 flex-shrink-0">
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-white">Shares</label>
              <div className="flex items-center gap-2">
                {/* Show available shares for Sell mode */}
                {!isBuy && (
                  <span className="text-xs text-gray-400">
                    {isLoadingPosition ? 'Loading...' : `Available: ${availableShares.toFixed(2)}`}
                  </span>
                )}
                {/* Max button for Sell mode */}
                {!isBuy && availableShares > 0 && (
                  <button
                    onClick={handleMaxShares}
                    className="text-purple-400 hover:text-purple-300 transition-colors text-xs font-medium"
                    aria-label="Use max shares"
                    title="Sell all shares"
                  >
                    Max
                  </button>
                )}
                <button
                  onClick={() => setAmount('0')}
                  className="text-gray-400 hover:text-white transition-colors text-xs"
                  aria-label="Reset shares"
                  title="Reset"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const current = parseFloat(amount) || 0
                  const newAmount = Math.max(0, current - 1)
                  setAmount(newAmount.toString())
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Decrease shares"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-800 rounded px-3 py-2 text-white text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-purple-primary"
                  placeholder="0"
                />
              </div>
              <button
                onClick={() => {
                  const current = parseFloat(amount) || 0
                  const newAmount = current + 1
                  setAmount(newAmount.toString())
                }}
                className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                aria-label="Increase shares"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            {executionType === 'limit' ? (
              <div className="flex gap-2 mt-3">
                  {shareQuickAddPresets.map((value, index) => {
                    if (isEditingSharePresets) {
                      return (
                        <div
                          key={index}
                          className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-800 bg-gray-900/50 flex items-center justify-center"
                        >
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => {
                              const sanitized = e.target.value.replace(/[^0-9.]/g, '')
                              setShareQuickAddPresets((prev) => {
                                const next = [...prev]
                                next[index] = sanitized
                                return next
                              })
                            }}
                            onKeyDown={handleSharePresetInputKeyDown}
                            className="w-full bg-transparent text-center text-white focus:outline-none focus:ring-0"
                            placeholder="0"
                          />
                        </div>
                      )
                    }

                    const increment = parseFloat(value) || 0
                    return (
                      <button
                        key={index}
                        onClick={() => {
                          const current = parseFloat(amount) || 0
                          const newAmount = current + increment
                          setAmount(newAmount.toString())
                        }}
                        className="flex-1 px-2 py-1.5 text-xs bg-gray-900/50 text-gray-300 rounded border border-gray-800 hover:bg-gray-900/70 hover:border-gray-700 transition-colors"
                      >
                        +{value || 0}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => {
                      if (isEditingSharePresets) {
                        saveSharePresetEdits()
                      } else {
                        setIsEditingSharePresets(true)
                      }
                    }}
                    className={`px-2 py-1.5 rounded border border-gray-800 transition-colors ${
                      isEditingSharePresets
                        ? 'text-white bg-purple-primary hover:bg-purple-hover'
                        : 'text-gray-400 hover:text-white bg-gray-900/50 hover:bg-gray-900/70 hover:border-gray-700'
                    }`}
                    aria-label={isEditingSharePresets ? 'Save quick add options' : 'Edit quick add options'}
                    title={isEditingSharePresets ? 'Save' : 'Edit quick add options'}
                  >
                    {isEditingSharePresets ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
            ) : (
              <div className="flex gap-2 mt-3">
                {['0.001', '0.1', '0.15', '10'].map((value) => (
                  <button
                    key={value}
                    onClick={() => handleAmountClick(value)}
                    className="flex-1 px-2 py-1.5 text-xs bg-gray-900/50 text-gray-300 rounded border border-gray-800 hover:bg-gray-900/70 hover:border-gray-700 transition-colors"
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Action Button */}
      <div className="p-4 flex-shrink-0 space-y-3">

        <button
          disabled={
            isMarketEnded || 
            isPlacingOrder || 
            !isPolymarketAuthenticated || 
            (isBuy && allowanceStatus?.needsAnyApproval && allowanceStatus?.hasAnyBalance) ||
            (!isBuy && availableShares <= 0) ||
            (!isBuy && ctfApprovalStatus?.needsApproval)
          }
          onClick={handlePlaceOrder}
          className={`w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 border ${
            isMarketEnded || isPlacingOrder || !isPolymarketAuthenticated || (isBuy && allowanceStatus?.needsAnyApproval && allowanceStatus?.hasAnyBalance) || (!isBuy && availableShares <= 0) || (!isBuy && ctfApprovalStatus?.needsApproval)
              ? 'bg-gray-800/50 border-gray-700 text-gray-500 cursor-not-allowed'
              : isTradingUp
              ? 'bg-green-500/10 border-green-500 text-green-400 hover:bg-green-500/20'
              : 'bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20'
          }`}
        >
          {isPlacingOrder
            ? 'PLACING ORDER...'
            : !isPolymarketAuthenticated
            ? 'AUTHENTICATE WITH POLYMARKET'
            : (isBuy && allowanceStatus?.needsAnyApproval && allowanceStatus?.hasAnyBalance)
            ? 'APPROVE USDC FIRST'
            : isMarketEnded
            ? 'MARKET ENDED'
            : (!isBuy && availableShares <= 0)
            ? `NO ${selectedOutcome === 'up' ? 'UP' : 'DOWN'} SHARES TO SELL`
            : (!isBuy && ctfApprovalStatus?.needsApproval)
            ? 'APPROVE TOKENS FIRST'
            : executionType === 'limit'
            ? `${isBuy ? 'BUY' : 'SELL'} ${selectedOutcome === 'up' ? 'UP' : 'DOWN'} @ LIMIT`
            : `${isBuy ? 'BUY' : 'SELL'} ${selectedOutcome === 'up' ? 'UP' : 'DOWN'}`}
        </button>

        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 text-xs text-gray-400 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-gray-200">
              {currentMarket.marketId ? `Market ID: ${currentMarket.marketId}` : 'Market metadata unavailable'}
            </span>
            {currentMarket.polymarketUrl && (
              <a
                href={currentMarket.polymarketUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                tabIndex={0}
                aria-label="Open current market on Polymarket"
                onClick={handlePolymarketLinkClick}
                onKeyDown={handlePolymarketLinkKeyDown}
              >
                View on Polymarket
              </a>
            )}
          </div>
          {currentMarket.question ? (
            <p className="text-gray-400">{currentMarket.question}</p>
          ) : (
            <p className="text-gray-500">
              {currentMarketLoading
                ? 'Loading current market details...'
                : currentMarketError || 'Waiting for websocket service to return the active market.'}
            </p>
          )}
          {(formattedMarketStart || formattedMarketEnd) && (
            <p className="text-gray-400">
              Window: {formattedMarketStart || '—'}
              {formattedMarketEnd ? ` → ${formattedMarketEnd}` : ''}{' '}
              <span className="text-gray-500">(ET)</span>
            </p>
          )}
          {/* Debug: Test credentials button */}
          {isPolymarketAuthenticated && (
            <button
              onClick={testCredentials}
              className="mt-2 text-xs text-purple-400 hover:text-purple-300 underline"
            >
              Test API Credentials
            </button>
          )}
        </div>
      </div>


      {/* Quick Limit Popup - Draggable */}
      {showQuickTradePanel && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-black border border-gray-800 rounded-lg shadow-2xl w-[280px]"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            cursor: isDragging ? 'grabbing' : 'default',
          }}
        >
            {/* Draggable Header */}
            <div
              onMouseDown={handleMouseDown}
              className="flex items-center justify-between px-3 py-2 border-b border-gray-800 cursor-grab active:cursor-grabbing bg-black rounded-t-lg"
            >
              <span className="text-xs text-white font-semibold">Quick Limit</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsEditingQuickTrade(!isEditingQuickTrade)}
                  className="text-gray-400 hover:text-white transition-colors p-0.5"
                  aria-label="Edit Quick Limit"
                  title="Edit Quick Limit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setShowQuickTradePanel(false)}
                  className="text-gray-400 hover:text-white transition-colors p-0.5"
                  aria-label="Close"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-2.5">
              {isEditingQuickTrade ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">
                        Limit Price
                      </div>
                      <div className="space-y-1">
                        {quickTradePricePresets.map((preset, index) => {
                          return (
                            <input
                              key={index}
                              type="text"
                              value={preset}
                              onChange={(e) => {
                                const sanitized = e.target.value.replace(/[^0-9.]/g, '')
                                setQuickTradePricePresets((prev) => {
                                  const next = [...prev]
                                  next[index] = sanitized
                                  return next
                                })
                              }}
                              className={`w-full px-2 py-1 rounded text-[10px] font-semibold bg-gray-900/50 border text-white text-center focus:outline-none focus:ring-1 ${
                                isTradingUp
                                  ? 'border-green-500/50 focus:ring-green-500 focus:border-green-500'
                                  : 'border-red-500/50 focus:ring-red-500 focus:border-red-500'
                              }`}
                              placeholder="50"
                            />
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">Shares</div>
                      <div className="space-y-1">
                        {quickTradeAmountPresets.map((preset, index) => (
                          <input
                            key={index}
                            type="text"
                            value={preset}
                            onChange={(e) => {
                              const sanitized = e.target.value.replace(/[^0-9.]/g, '')
                              setQuickTradeAmountPresets((prev) => {
                                const next = [...prev]
                                next[index] = sanitized
                                return next
                              })
                            }}
                            className="w-full px-2 py-1 rounded text-[10px] font-semibold bg-gray-900/50 border border-purple-primary/50 text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-primary focus:border-purple-primary"
                            placeholder="100"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-800">
                    <p className="text-[9px] text-gray-500">
                      Edit prices & amounts
                    </p>
                    <button
                      onClick={() => setIsEditingQuickTrade(false)}
                      className="px-2.5 py-0.5 bg-purple-primary hover:bg-purple-hover text-white text-[9px] font-semibold rounded transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">
                        Limit Price
                      </div>
                      <div className="space-y-1">
                        {selectablePricePresets.map(({ value, index }) => {
                          const isSelected = quickTradePrice === value
                          return (
                            <button
                              key={`${value}-${index}`}
                              onClick={() => {
                                setQuickTradePrice(value)
                                if (executionType === 'limit') {
                                  setLimitPrice(value)
                                }
                              }}
                              className={`w-full px-2 py-1 rounded text-[10px] font-semibold transition-all duration-200 border ${
                                isSelected
                                  ? isTradingUp
                                    ? 'bg-green-500/10 border-green-500 text-green-400'
                                    : 'bg-red-500/10 border-red-500 text-red-400'
                                  : isTradingUp
                                    ? 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                                    : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-red-500/60'
                              }`}
                            >
                              {value}¢
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase text-gray-400 font-semibold tracking-wider mb-1.5">Shares</div>
                      <div className="space-y-1">
                        {selectableAmountPresets.map(({ value, index }) => {
                          const isSelected = quickTradeQuantity === value
                          return (
                            <button
                              key={`${value}-${index}`}
                              onClick={() => {
                                setQuickTradeQuantity(value)
                                setAmount(value)
                              }}
                              className={`w-full px-2 py-1 rounded text-[10px] font-semibold transition-all duration-200 border ${
                                isSelected
                                  ? 'bg-purple-primary/20 border-purple-primary text-white'
                                  : 'bg-gray-900/50 border-gray-700 text-gray-200 hover:border-purple-primary/60'
                              }`}
                            >
                              {value}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-gray-500">
                        ¢: <span className="text-white font-semibold text-[10px]">{quickTradePrice ? `${quickTradePrice}` : '--'}</span>
                      </span>
                      <span className="text-[9px] text-gray-500">
                        Q: <span className="text-white font-semibold text-[10px]">{quickTradeQuantity || '--'}</span>
                      </span>
                      <span className="text-[9px] text-gray-500">
                        Cost: <span className="text-white font-semibold text-[10px]">
                          {quickTradePrice && quickTradeQuantity 
                            ? `$${((parseFloat(quickTradePrice) * parseFloat(quickTradeQuantity)) / 100).toFixed(2)}`
                            : '--'
                          }
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setAmount(quickTradeQuantity)
                        if (executionType === 'limit' && quickTradePrice) {
                          setLimitPrice(quickTradePrice)
                        }
                      }}
                      className={`px-2.5 py-0.5 text-white text-[9px] font-semibold rounded transition-colors ${
                        isTradingUp
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {isBuy 
                        ? `Buy ${selectedOutcome === 'up' ? 'Up' : 'Down'}`
                        : `Sell ${selectedOutcome === 'up' ? 'Up' : 'Down'}`
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  )
}

export default TradingPanel

