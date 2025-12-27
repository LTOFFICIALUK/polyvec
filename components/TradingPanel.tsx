'use client'

import { useState, useRef, useEffect, useMemo, useCallback, KeyboardEvent, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import AnimatedPrice from './AnimatedPrice'
import usePolymarketPrices from '@/hooks/usePolymarketPrices'
import { useTradingContext } from '@/contexts/TradingContext'
import useCurrentMarket from '@/hooks/useCurrentMarket'
import { useWallet } from '@/contexts/WalletContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { OrderSide, OrderType } from '@/lib/polymarket-order-signing'
import PolymarketAuthModal from './PolymarketAuthModal'
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
  const { polymarketCredentials, isPolymarketAuthenticated, setPolymarketCredentials } = useWallet()
  const { custodialWallet, refreshCustodialWallet } = useAuth()
  const { showToast } = useToast()
  
  // Use custodial wallet address
  const walletAddress = custodialWallet?.walletAddress || null
  // Removed orderType - only market trading now
  const [executionType, setExecutionType] = useState<'market' | 'limit'>('market')
  const [amount, setAmount] = useState('')
  const [isBuy, setIsBuy] = useState(true)
  // Single shared state for UP/DOWN selection - applies to both Buy and Sell
  const [selectedOutcome, setSelectedOutcome] = useState<'up' | 'down'>('up')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [isApprovingUsdc, setIsApprovingUsdc] = useState(false)
  const [allowanceStatus, setAllowanceStatus] = useState<AllowanceStatus | null>(null)
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false)
  // Conditional token approval status (needed for SELL orders)
  const [ctfApprovalStatus, setCtfApprovalStatus] = useState<ConditionalTokenApprovalStatus | null>(null)
  const [isApprovingCtf, setIsApprovingCtf] = useState(false)
  // Modal state for API key mismatch error
  const [showAuthModal, setShowAuthModal] = useState(false)
  // Track user's position in current market for selling
  const [currentPosition, setCurrentPosition] = useState<MarketPosition>({ upShares: 0, downShares: 0, upAvgPrice: 0, downAvgPrice: 0 })
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
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
    // Don't drag if another panel is already being dragged (check for dragging-panel class)
    if (document.body.classList.contains('dragging-panel') && !isDragging) {
      return
    }
    // Don't drag if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) return
    // Only drag from the quick limit panel's drag-handle
    const dragHandle = (e.target as HTMLElement).closest('.quick-limit-drag-handle')
    if (!dragHandle || !popupRef.current || !popupRef.current.contains(dragHandle)) return
    
    e.stopPropagation() // Prevent event from bubbling to other panels
    e.preventDefault() // Prevent default behavior
    
    setDragOffset({
      x: e.clientX - popupPosition.x,
      y: e.clientY - popupPosition.y,
    })
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) {
      // Remove drag class when not dragging
      document.body.classList.remove('dragging-panel')
      return
    }

    // Add class to body to disable chart interactions
    document.body.classList.add('dragging-panel')

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!popupRef.current) return
      
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
      document.body.classList.remove('dragging-panel')
    }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.classList.remove('dragging-panel')
    }
  }, [isDragging, dragOffset, popupPosition])

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
    const interval = setInterval(() => {
      fetchOrderbookPrices()
    }, 2000)
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

  // Check USDC allowance when wallet connects or changes (server-side for custodial wallet)
  useEffect(() => {
    const checkAllowance = async () => {
      if (!walletAddress || typeof window === 'undefined') {
        setAllowanceStatus(null)
        return
      }

      setIsCheckingAllowance(true)
      try {
        // Check allowance server-side for custodial wallet
        const response = await fetch('/api/user/allowance')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.allowance) {
            setAllowanceStatus(data.allowance)
          }
        }
      } catch (error) {
        console.error('[Allowance] Error checking:', error)
      } finally {
        setIsCheckingAllowance(false)
      }
    }

    checkAllowance()
  }, [walletAddress])

  // Check conditional token approval when wallet connects (needed for SELL orders) - server-side
  useEffect(() => {
    const checkCtfAllowance = async () => {
      if (!walletAddress || typeof window === 'undefined') {
        setCtfApprovalStatus(null)
        return
      }

      try {
        // Check approval server-side for custodial wallet
        const response = await fetch('/api/user/allowance')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.conditionalTokens) {
            setCtfApprovalStatus(data.conditionalTokens)
          }
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

  // Handle conditional token approval (for selling) - server-side
  const handleApproveConditionalTokens = async () => {
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error')
      return
    }

    setIsApprovingCtf(true)

    try {
      showToast('Approving tokens...', 'info')

      // Approve conditional tokens server-side using custodial wallet
      const response = await fetch('/api/user/approve-conditional-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to approve conditional tokens')
      }

      showToast('✓ On-chain approval complete!', 'success')

      // Sync with Polymarket API
      if (polymarketCredentials) {
        showToast('Syncing with Polymarket...', 'info')
        const syncResult = await syncConditionalTokenAllowance(walletAddress, polymarketCredentials)
      }

      // Refresh status
      const allowanceResponse = await fetch('/api/user/allowance')
      if (allowanceResponse.ok) {
        const allowanceData = await allowanceResponse.json()
        if (allowanceData.success && allowanceData.conditionalTokens) {
          setCtfApprovalStatus(allowanceData.conditionalTokens)

          if (!allowanceData.conditionalTokens.needsApproval) {
        showToast('🎉 Tokens approved! You can now sell your positions.', 'success')
      } else {
        showToast('Approval completed but status still shows pending. Try refreshing.', 'info')
          }
        }
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

  // Handle USDC approval (server-side for custodial wallet)
  const handleApproveUsdc = async () => {
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error')
      return
    }

    setIsApprovingUsdc(true)
    showToast('Approving USDC for trading...', 'info')

    try {
      // Approve USDC server-side using custodial wallet
      const response = await fetch('/api/user/approve-usdc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to approve USDC')
      }

      // Always poll for confirmation (transactions are sent immediately, confirmation happens async)
      showToast('Approval transactions sent! Waiting for confirmation...', 'info', 5000)
      
      // Poll for confirmation
      let attempts = 0
      const maxAttempts = 60 // 60 attempts = 60 seconds (blockchain can be slow)
      const checkInterval = setInterval(async () => {
        attempts++
        try {
          const allowanceResponse = await fetch('/api/user/allowance')
          if (allowanceResponse.ok) {
            const allowanceData = await allowanceResponse.json()
            if (allowanceData.success && allowanceData.allowance) {
              const hasAllowance = allowanceData.allowance.usdce.allowance > 0 || 
                                   allowanceData.allowance.needsAnyApproval === false
              if (hasAllowance) {
                clearInterval(checkInterval)
                setAllowanceStatus(allowanceData.allowance)

      // Sync with Polymarket's internal balance/allowance system
      if (polymarketCredentials) {
                  try {
        const syncResult = await syncAllowanceWithPolymarket(walletAddress, polymarketCredentials)
        if (syncResult.collateral) {
          showToast('USDC approved and synced! You can now trade on Polymarket.', 'success')
        } else {
                      showToast('USDC approved on-chain. You can now trade.', 'success')
                    }
                  } catch (syncError) {
                    console.error('[Approval] Sync error:', syncError)
                    showToast('USDC approved on-chain. You can now trade.', 'success')
        }
      } else {
                  showToast('USDC approved successfully! You can now trade.', 'success')
      }

                setIsApprovingUsdc(false)
                return
              }
            }
          }
        } catch (error) {
          console.error('[Approval] Error checking status:', error)
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval)
          showToast('Approval is taking longer than expected. The transactions may still be processing. Please refresh the page in a moment.', 'warning', 8000)
          setIsApprovingUsdc(false)
        }
      }, 1000) // Check every second
      
      // Note: We don't return here because the interval continues running
      // The cleanup will happen in the finally block or when the component unmounts
    } catch (error: any) {
      console.error('[Approval] Error:', error)
        showToast(`Approval failed: ${error.message || 'Unknown error'}`, 'error')
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
      showToast('Custodial wallet not available. Please contact support.', 'error')
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
      // Determine token ID based on selected outcome
      const tokenId = selectedOutcome === 'up' ? currentMarket.yesTokenId! : currentMarket.noTokenId!

      // Determine order side
      const side = isBuy ? OrderSide.BUY : OrderSide.SELL

      // Convert price from cents to decimal (e.g., 50 -> 0.50)
      let priceDecimal: number
      if (executionType === 'limit') {
        priceDecimal = parseFloat(limitPrice) / 100
      } else {
        const priceString = selectedOutcome === 'up' ? yesPriceFormatted : noPriceFormatted
        const priceCents = parseFloat(priceString)
        if (isNaN(priceCents) || priceString === 'ERROR' || priceString === 'Ended') {
          throw new Error(`Cannot place market order: price is ${priceString}. Please try a limit order instead.`)
        }
        priceDecimal = priceCents / 100
      }

      // Determine order type
      const orderType = executionType === 'limit' ? OrderType.GTC : OrderType.FOK

      // Check if this is a neg-risk market
      let isNegRiskMarket = false
      try {
        const negRiskResponse = await fetch(`/api/polymarket/neg-risk?tokenId=${tokenId}`)
        const negRiskData = await negRiskResponse.json()
        isNegRiskMarket = negRiskData.negRisk === true
      } catch (error) {
        console.warn('[Trading] Failed to check neg-risk status, defaulting to false:', error)
      }

      // Calculate amounts for display
      const displayPriceCents = executionType === 'limit' 
        ? parseFloat(limitPrice)
        : priceDecimal * 100
      const displayDollarAmount = (shares * displayPriceCents) / 100
      
      // Show order summary
      const orderSummary = isBuy
        ? `Placing BUY order: ${shares} shares @ ${displayPriceCents.toFixed(0)}¢ = $${displayDollarAmount.toFixed(2)} USDC.e`
        : `Placing SELL order: ${shares} shares @ ${displayPriceCents.toFixed(0)}¢`
      showToast(orderSummary, 'info', 3000)

      // Sign order using VPS (secure - keys never leave VPS)
      const signResponse = await fetch('/api/trade/sign-order-vps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenId,
          side,
          price: priceDecimal,
          size: shares,
          negRisk: isNegRiskMarket,
        }),
      })

      if (!signResponse.ok) {
        const errorData = await signResponse.json()
        throw new Error(errorData.error || 'Failed to sign order')
      }

      const signData = await signResponse.json()
      const signedOrder = signData.signedOrder

      // Post signed order through our API/VPS proxy to bypass CORS/Cloudflare
      const response = await fetch('/api/trade/place-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: walletAddress,
          credentials: polymarketCredentials,
          signedOrder: signedOrder,
          orderType: orderType,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        console.error('[Trading] Order placement failed:', result)
        
        // Show detailed error toast based on error message from API
        let errorMessage = result.error || 'Failed to place order'
        
        // Check for specific error codes first
        if (result.errorCode === 'API_KEY_OWNER_MISMATCH') {
          // Show modal to re-authenticate - don't show error toast, just modal
          setShowAuthModal(true)
          showToast('Please reauthenticate', 'warning')
          // Don't throw error, just return - modal is shown
          setIsPlacingOrder(false)
          return
        } else if (result.errorCode === 'AUTH_FAILED' || result.errorCode === 'INVALID_CREDENTIALS') {
          errorMessage = 'Authentication failed. Please re-authenticate with Polymarket.'
        } else if (errorMessage.toLowerCase().includes('fok') || errorMessage.toLowerCase().includes('fill')) {
          errorMessage = `Market order failed: Not enough liquidity to fill ${shares} shares. Try a smaller size or use a limit order.`
        } else if (errorMessage.toLowerCase().includes('not enough balance') ||
                   errorMessage.toLowerCase().includes('allowance') ||
                   errorMessage.toLowerCase().includes('insufficient')) {
          // Different messages for BUY vs SELL orders
          if (!isBuy) {
            errorMessage = 'Sell order failed: Not enough conditional tokens or they are not approved. Please approve your tokens for selling or check your position.'
          } else {
            errorMessage = 'Buy order failed: Not enough USDC balance or allowance. Please approve USDC for trading or check your balance.'
          }
        } else if (errorMessage.toLowerCase().includes('size') && errorMessage.toLowerCase().includes('minimum')) {
          // Extract minimum size from error message if available
          const minSizeMatch = errorMessage.match(/minimum[:\s]+(\d+)/i)
          const minSize = minSizeMatch ? minSizeMatch[1] : '5'
          const sizeMatch = errorMessage.match(/size[:\s(]+([\d.]+)/i)
          const attemptedSize = sizeMatch ? sizeMatch[1] : shares.toFixed(2)
          errorMessage = `Order size too small: ${attemptedSize} shares. Polymarket requires a minimum of ${minSize} shares per order. Please increase your order size to at least ${minSize} shares.`
        } else if (errorMessage.toLowerCase().includes('tick size') || errorMessage.toLowerCase().includes('price')) {
          errorMessage = 'Order price breaks minimum tick size rules. Please adjust your price.'
        } else if (errorMessage.toLowerCase().includes('auth') || errorMessage.toLowerCase().includes('credential') || errorMessage.toLowerCase().includes('api key')) {
          errorMessage = 'Authentication failed. Please re-authenticate with Polymarket.'
        } else if (errorMessage.toLowerCase().includes('duplicate')) {
          errorMessage = 'This order has already been placed. Please check your open orders.'
        }
        
        showToast(errorMessage, 'error')
        throw new Error(errorMessage)
      }

      // Calculate priceInCents and dollarAmount for both limit and market orders
      const priceInCents = executionType === 'limit' 
        ? parseFloat(limitPrice)
        : priceDecimal * 100
      const dollarAmount = (shares * priceInCents) / 100
      
      // Build success message with order details
      let successMessage: string
      let sideTextForEvent: string
      
      if (executionType === 'limit') {
        // For limit orders, just confirm the order was placed
        const sideText = isBuy ? 'BUY' : 'SELL'
        sideTextForEvent = isBuy ? 'buy' : 'sell'
        successMessage = `Placed limit ${sideText} order for ${shares.toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })} shares`
      } else {
        // For market orders, show execution details
        const sideText = isBuy ? 'You bought' : 'You sold'
        sideTextForEvent = isBuy ? 'bought' : 'sold'
        const outcomeText = selectedOutcome === 'up' ? 'UP' : 'DOWN'
        
        // Format the message similar to screenshot: "You bought X shares at Y¢ per share | $Z total"
        successMessage = `${sideText} ${shares.toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })} ${outcomeText} shares at ${priceInCents.toFixed(0)}¢ per share\n$${dollarAmount.toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })} total`
      }
      
      showToast(successMessage, 'success', 5000)
      
      // Instant refresh: Update balances and positions immediately
      await Promise.all([
        refreshCustodialWallet(true), // Sync from blockchain
        fetchCurrentPosition(), // Refresh current market position
      ])
      
      // Dispatch event to refresh orders in the positions panel and show trade bubble on chart
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orderPlaced', {
          detail: {
            shares,
            price: priceInCents,
            dollarAmount,
            side: sideTextForEvent,
            outcome: selectedOutcome,
            timestamp: Date.now(),
          }
        }))
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

  // Market/Limit toggle button
  const renderOrderTypeToggle = () => (
    <div className="flex gap-2 items-center">
      <button
        onClick={() => handleExecutionTypeChange(executionType === 'market' ? 'limit' : 'market')}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-all duration-200 flex items-center justify-center gap-2 ${
          'bg-dark-bg/60 text-gray-300 hover:text-white hover:bg-dark-bg/80 border border-gray-700/50'
        }`}
      >
        <span className="uppercase tracking-wide" style={{ fontFamily: 'monospace' }}>
          {executionType === 'limit' ? 'Limit' : 'Market'}
        </span>
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
      </button>
    </div>
  )

  // Market trading view
    return (
    <div className="flex flex-col bg-dark-bg overflow-y-auto">
      {/* Order Type Toggle */}
      <div className="border-b border-gray-700/50 p-3 flex-shrink-0">
        {renderOrderTypeToggle()}
      </div>

      {/* Buy/Sell Tabs */}
      <div className="border-b border-gray-700/50 flex-shrink-0">
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
        <div className="border-b border-gray-700/50 p-4 flex-shrink-0 space-y-4">
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
                    selectedOutcome === 'up' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-green-500/60'
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
                    selectedOutcome === 'down' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-red-500/60'
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
                    selectedOutcome === 'up' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-green-500/60'
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
                    selectedOutcome === 'down' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-red-500/60'
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
                  className="w-full border border-gray-700/50 rounded px-3 py-2 pr-8 text-white text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-gold-primary"
                  style={{ backgroundColor: 'rgba(20, 18, 16, 0.5)' }}
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

      {/* UP/DOWN Selection - only shown when executionType is 'market' */}
      {executionType === 'market' && (
        <div className={`border-b border-gray-700/50 p-4 flex-shrink-0 ${isMarketEnded ? 'opacity-50' : ''}`}>
          <div className="flex gap-2">
            {/* UP/DOWN Selection Buttons */}
                <button
                  disabled={isMarketEnded}
                  onClick={() => {
                    if (isMarketEnded) return
                    setSelectedOutcome('up')
                    setActiveTokenId('up')
                  }}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded transition-all duration-200 uppercase border flex items-center justify-between ${
                    isMarketEnded
                  ? 'bg-dark-bg/50 border-gray-700 text-gray-500 cursor-not-allowed'
                  : selectedOutcome === 'up' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                  }`}
                >
              <span>UP</span>
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
                <button
                  disabled={isMarketEnded}
                  onClick={() => {
                    if (isMarketEnded) return
                    setSelectedOutcome('down')
                    setActiveTokenId('down')
                  }}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded transition-all duration-200 uppercase border flex items-center justify-between ${
                    isMarketEnded
                  ? 'bg-dark-bg/50 border-gray-700 text-gray-500 cursor-not-allowed'
                  : selectedOutcome === 'down' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-red-500/60'
                  }`}
                >
              <span>DOWN</span>
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
          </div>
        </div>
      )}

      {/* Shares/Amount Input */}
      <div className="border-b border-gray-700/50 p-4 flex-shrink-0">
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
                    className="text-gold-hover hover:text-gold-primary transition-colors text-xs font-medium"
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
                  className="w-full border border-gray-700/50 rounded px-3 py-2 text-white text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-gold-primary"
                  style={{ backgroundColor: 'rgba(20, 18, 16, 0.5)' }}
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
                          className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-700/50 bg-dark-bg/50 flex items-center justify-center"
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
                        className="flex-1 px-2 py-1.5 text-xs bg-dark-bg/50 text-gray-300 rounded border border-gray-700/50 hover:bg-dark-bg/70 hover:border-gray-700 transition-colors"
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
                    className={`px-2 py-1.5 rounded border border-gray-700/50 transition-colors ${
                      isEditingSharePresets
                        ? 'text-white bg-gold-primary hover:bg-gold-hover'
                        : 'text-gray-400 hover:text-white bg-dark-bg/50 hover:bg-dark-bg/70 hover:border-gray-700'
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
                    className="flex-1 px-2 py-1.5 text-xs bg-dark-bg/50 text-gray-300 rounded border border-gray-700/50 hover:bg-dark-bg/70 hover:border-gray-700 transition-colors"
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
            isApprovingUsdc ||
            (!isPolymarketAuthenticated ? false : (!isBuy && availableShares <= 0) || (!isBuy && ctfApprovalStatus?.needsApproval))
          }
          onClick={() => {
            if (!isPolymarketAuthenticated) {
              setShowAuthModal(true)
            } else if (isBuy && allowanceStatus?.needsAnyApproval && allowanceStatus?.hasAnyBalance) {
              handleApproveUsdc()
            } else {
              handlePlaceOrder()
            }
          }}
          className={`w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 border ${
            !isPolymarketAuthenticated
              ? 'bg-gold-primary/10 border-gold-primary text-gold-primary hover:bg-gold-primary/20 cursor-pointer'
              : isMarketEnded || isPlacingOrder || isApprovingUsdc || (!isBuy && availableShares <= 0) || (!isBuy && ctfApprovalStatus?.needsApproval)
              ? 'bg-dark-bg/50 border-gray-700 text-gray-500 cursor-not-allowed'
              : (isBuy && allowanceStatus?.needsAnyApproval && allowanceStatus?.hasAnyBalance)
              ? 'bg-gold-primary/10 border-gold-primary text-gold-primary hover:bg-gold-primary/20 cursor-pointer'
              : isTradingUp
              ? 'bg-green-500/10 border-green-500 text-green-400 hover:bg-green-500/20'
              : 'bg-red-500/10 border-red-500 text-red-400 hover:bg-red-500/20'
          }`}
        >
          {isPlacingOrder
            ? 'PLACING ORDER...'
            : isApprovingUsdc
            ? 'APPROVING USDC...'
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

        {/* Market ID Panel - Commented out for now, might need it later */}
        {/*
        <div className="rounded-lg border border-gray-700/50 bg-dark-bg/40 px-3 py-2 text-xs text-gray-400 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-gray-200">
              {currentMarket.marketId ? `Market ID: ${currentMarket.marketId}` : 'Market metadata unavailable'}
            </span>
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
          {isPolymarketAuthenticated && (
            <button
              onClick={testCredentials}
              className="mt-2 text-xs text-gold-hover hover:text-gold-primary underline"
            >
              Test API Credentials
            </button>
          )}
        </div>
        */}
      </div>


      {/* Quick Limit Popup - Draggable - Rendered via Portal to avoid DOM hierarchy issues */}
      {showQuickTradePanel && typeof window !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          id="quick-limit-panel"
          className="fixed z-[60] bg-dark-bg border border-gray-700/50 rounded-lg w-[280px] select-none"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transform: 'translateZ(0)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Draggable Header */}
            <div
              onMouseDown={handleMouseDown}
              className="quick-limit-drag-handle drag-handle flex items-center justify-between px-3 py-2 border-b border-gray-700/50 cursor-grab active:cursor-grabbing bg-dark-bg/40 hover:bg-dark-bg/60 transition-colors rounded-t-lg"
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
                              className={`w-full px-2 py-1 rounded text-[10px] font-semibold bg-dark-bg/50 border text-white text-center focus:outline-none focus:ring-1 ${
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
                            className="w-full px-2 py-1 rounded text-[10px] font-semibold bg-dark-bg/50 border border-gold-primary/50 text-white text-center focus:outline-none focus:ring-1 focus:ring-gold-primary focus:border-gold-primary"
                            placeholder="100"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-700/50">
                    <p className="text-[9px] text-gray-500">
                      Edit prices & amounts
                    </p>
                    <button
                      onClick={() => setIsEditingQuickTrade(false)}
                      className="px-2.5 py-0.5 bg-gold-primary hover:bg-gold-hover text-white text-[9px] font-semibold rounded transition-colors"
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
                                    ? 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-green-500/60'
                                    : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-red-500/60'
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
                                  ? 'bg-gold-primary/20 border-gold-primary text-white'
                                  : 'bg-dark-bg/50 border-gray-700 text-gray-200 hover:border-gold-primary/60'
                              }`}
                            >
                              {value}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-700/50">
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
        </div>,
        document.body
          )}

      {/* Re-authentication Modal - shown when API key doesn't match wallet */}
      <PolymarketAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={async () => {
          setShowAuthModal(false)
          showToast('Authentication successful! You can now place orders.', 'success')
          // Reload credentials from database
          try {
            const response = await fetch('/api/user/polymarket-credentials')
            if (response.ok) {
              const data = await response.json()
              if (data.credentials) {
                setPolymarketCredentials(data.credentials)
              }
            }
          } catch (error) {
            console.error('[TradingPanel] Failed to reload credentials:', error)
          }
        }}
      />
    </div>
  )
}

export default TradingPanel

