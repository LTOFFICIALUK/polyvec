import { useState, useEffect, useRef } from 'react'

interface PolymarketPrices {
  yesPrice: number
  noPrice: number
  liquidity?: number
  lastUpdated?: Date
}

interface UsePolymarketPricesOptions {
  pair: string // BTC, SOL, ETH, XRP
  timeframe: string // 15m, 1h
  interval?: number // Polling interval in ms (default: 500 for minimal delay)
  yesTokenId?: string // Token ID for YES outcome
  noTokenId?: string // Token ID for NO outcome
  useWebSocket?: boolean // Use WebSocket for real-time updates (default: false)
}

// Token ID mapping for "next candle" markets
// These will be auto-populated by searching Polymarkets API, or you can manually add them
const TOKEN_ID_MAP: Record<string, { yes: string; no: string }> = {
  'BTC-15m': {
    yes: '',
    no: '',
  },
  'BTC-1h': {
    yes: '',
    no: '',
  },
  'SOL-15m': {
    yes: '',
    no: '',
  },
  'SOL-1h': {
    yes: '',
    no: '',
  },
  'ETH-15m': {
    yes: '',
    no: '',
  },
  'ETH-1h': {
    yes: '',
    no: '',
  },
  'XRP-15m': {
    yes: '',
    no: '',
  },
  'XRP-1h': {
    yes: '',
    no: '',
  },
}

// Cache for market searches
const marketCache = new Map<string, { yes: string; no: string } | null>()

const searchMarket = async (pair: string, timeframe: string) => {
  const cacheKey = `${pair}-${timeframe}`
  if (marketCache.has(cacheKey)) {
    return marketCache.get(cacheKey)
  }

  try {
    const response = await fetch(`/api/polymarket/market-search?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`)
    if (!response.ok) {
      marketCache.set(cacheKey, null)
      return null
    }

    const data = await response.json()
    if (data?.yes && data?.no) {
      marketCache.set(cacheKey, { yes: data.yes, no: data.no })
      return { yes: data.yes, no: data.no }
    }
  } catch (err) {
    console.error('Market search failed:', err)
  }

  marketCache.set(cacheKey, null)
  return null
}

const usePolymarketPrices = ({
  pair,
  timeframe,
  interval = 5000, // Poll every 5 seconds to reduce load
  yesTokenId,
  noTokenId,
  useWebSocket = false,
}: UsePolymarketPricesOptions) => {
  const [prices, setPrices] = useState<PolymarketPrices | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let isMounted = true
    let previousMarketId: string | null = null

    const initializeTokens = async () => {
      // First, try to get current active market from WebSocket service
      try {
        const currentMarketResponse = await fetch(
          `/api/current-markets?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`
        )

        if (currentMarketResponse.ok) {
          const currentMarket = await currentMarketResponse.json()
          
          // Check if market changed
          const marketChanged = previousMarketId !== null && previousMarketId !== currentMarket?.marketId
          if (marketChanged && currentMarket?.marketId) {
            console.log(`[usePolymarketPrices] Market changed: ${previousMarketId} → ${currentMarket.marketId}, resetting prices`)
            // Reset prices when market changes
            if (isMounted) {
              setPrices(null)
              setLoading(true)
            }
          }
          previousMarketId = currentMarket?.marketId || null
          
          // Check if we have valid market data (not null/empty)
          if (currentMarket?.marketId && currentMarket?.bestBid !== null && currentMarket?.bestAsk !== null && 
              currentMarket.bestBid > 0 && currentMarket.bestAsk > 0) {
            // Prices from orderbook are typically in decimal format (0-1), but check if they're in cents (0-100)
            // If bestAsk > 1, it's in cents, otherwise it's already in decimal
            const bestAsk = currentMarket.bestAsk > 1 ? currentMarket.bestAsk / 100 : currentMarket.bestAsk
            const bestBid = currentMarket.bestBid > 1 ? currentMarket.bestBid / 100 : currentMarket.bestBid
            
            // bestAsk is the price to buy YES (UP), bestBid is the price to sell YES (UP)
            // For display, we use bestAsk as the YES price and (1 - bestAsk) as the NO price
            const yesPrice = Math.max(0.01, Math.min(0.99, bestAsk))
            const noPrice = Math.max(0.01, Math.min(0.99, 1 - bestAsk))
            
            if (isMounted) {
              setPrices({
                yesPrice: Math.max(0.01, Math.min(0.99, yesPrice)),
                noPrice: Math.max(0.01, Math.min(0.99, noPrice)),
                lastUpdated: new Date(),
              })
              setLoading(false)
              setError(null)
              
              // Set up polling to refresh prices
              if (intervalRef.current) {
                clearInterval(intervalRef.current)
              }
              intervalRef.current = setInterval(async () => {
                try {
                  const refreshResponse = await fetch(
                    `/api/current-markets?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`
                  )
                  if (refreshResponse.ok) {
                    const refreshed = await refreshResponse.json()
                    
                    // Check if market changed during refresh
                    if (refreshed?.marketId !== previousMarketId && refreshed?.marketId) {
                      console.log(`[usePolymarketPrices] Market changed during refresh: ${previousMarketId} → ${refreshed.marketId}`)
                      previousMarketId = refreshed.marketId
                      if (isMounted) {
                        setPrices(null)
                        setLoading(true)
                      }
                    }
                    
                    if (refreshed?.marketId && refreshed?.bestBid !== null && refreshed?.bestAsk !== null && 
                        refreshed.bestBid > 0 && refreshed.bestAsk > 0 && isMounted) {
                      const bestAsk = refreshed.bestAsk > 1 ? refreshed.bestAsk / 100 : refreshed.bestAsk
                      const yesPrice = Math.max(0.01, Math.min(0.99, bestAsk))
                      const noPrice = Math.max(0.01, Math.min(0.99, 1 - bestAsk))
                      setPrices({
                        yesPrice,
                        noPrice,
                        lastUpdated: new Date(),
                      })
                      setLoading(false)
                    }
                  }
                } catch (err) {
                  console.error('Error refreshing prices:', err)
                }
              }, interval)
            }
            return
          }
        }
      } catch (err) {
        console.warn('Could not fetch current market, falling back to market search:', err)
      }

      // Fallback to original market search logic
      const marketKey = `${pair}-${timeframe}`
      let tokens = yesTokenId && noTokenId 
        ? { yes: yesTokenId, no: noTokenId }
        : TOKEN_ID_MAP[marketKey]

      if (!isMounted) return

      if ((!tokens || !tokens.yes || !tokens.no) && !yesTokenId && !noTokenId) {
        const found = await searchMarket(pair, timeframe)
        if (found) {
          tokens = found
          TOKEN_ID_MAP[marketKey] = found
        }
      }

      if (!tokens || !tokens.yes || !tokens.no) {
        const errorMsg = `Token IDs not configured for ${marketKey}. Please add them to TOKEN_ID_MAP or pass yesTokenId/noTokenId.`
        console.error(errorMsg)
        setError(errorMsg)
        setPrices(null)
        setLoading(false)
        return
      }

      // Continue with price fetching using the tokens
      setupPriceFetching(tokens)
    }

    const setupPriceFetching = (tokens: { yes: string; no: string }) => {

      // Create a fetch function that uses the current tokens
      const fetchPricesWithTokens = async () => {
        if (!isMounted) return

        try {
          setError(null)

          // Option 1: Try POST /prices endpoint first (most efficient for specific tokens)
          try {
            const batchResponse = await fetch('https://clob.polymarket.com/prices', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify([
                { token_id: tokens.yes, side: 'BUY' },
                { token_id: tokens.yes, side: 'SELL' },
                { token_id: tokens.no, side: 'BUY' },
                { token_id: tokens.no, side: 'SELL' },
              ]),
            })

            if (batchResponse.ok) {
              const batchData = await batchResponse.json()
              
              // Check if our tokens are in the batch response
              if (batchData[tokens.yes] && batchData[tokens.no]) {
                const yesPrices = batchData[tokens.yes]
                const noPrices = batchData[tokens.no]
                
                const yesPrice = parseFloat(yesPrices.BUY || yesPrices.SELL || '0')
                const noPrice = parseFloat(noPrices.BUY || noPrices.SELL || '0')

                if (yesPrice > 0 && noPrice > 0) {
                  const normalizedYesPrice = yesPrice > 1 ? yesPrice / 100 : yesPrice
                  const normalizedNoPrice = noPrice > 1 ? noPrice / 100 : noPrice

                  if (isMounted) {
                    setPrices({
                      yesPrice: Math.max(0.01, Math.min(0.99, normalizedYesPrice)),
                      noPrice: Math.max(0.01, Math.min(0.99, normalizedNoPrice)),
                      lastUpdated: new Date(),
                    })
                    setLoading(false)
                  }
                  return
                }
              }
            }
          } catch (batchError) {
            console.warn('POST /prices endpoint failed, trying GET /prices:', batchError)
            
            // Fallback to GET /prices
            try {
              const getBatchResponse = await fetch('https://clob.polymarket.com/prices')
              if (getBatchResponse.ok) {
                const batchData = await getBatchResponse.json()
                
                if (batchData[tokens.yes] && batchData[tokens.no]) {
                  const yesPrices = batchData[tokens.yes]
                  const noPrices = batchData[tokens.no]
                  
                  const yesPrice = parseFloat(yesPrices.BUY || yesPrices.SELL || '0')
                  const noPrice = parseFloat(noPrices.BUY || noPrices.SELL || '0')

                  if (yesPrice > 0 && noPrice > 0) {
                    const normalizedYesPrice = yesPrice > 1 ? yesPrice / 100 : yesPrice
                    const normalizedNoPrice = noPrice > 1 ? noPrice / 100 : noPrice

                    if (isMounted) {
                      setPrices({
                        yesPrice: Math.max(0.01, Math.min(0.99, normalizedYesPrice)),
                        noPrice: Math.max(0.01, Math.min(0.99, normalizedNoPrice)),
                        lastUpdated: new Date(),
                      })
                      setLoading(false)
                    }
                    return
                  }
                }
              }
            } catch (getBatchError) {
              console.warn('GET /prices also failed, falling back to individual requests:', getBatchError)
            }
          }

          // Option 2: Fallback to individual price requests
          const yesBuyUrl = `https://clob.polymarket.com/price?token_id=${tokens.yes}&side=BUY`
          const yesSellUrl = `https://clob.polymarket.com/price?token_id=${tokens.yes}&side=SELL`
          const noBuyUrl = `https://clob.polymarket.com/price?token_id=${tokens.no}&side=BUY`
          const noSellUrl = `https://clob.polymarket.com/price?token_id=${tokens.no}&side=SELL`

          const [yesBuyResponse, yesSellResponse, noBuyResponse, noSellResponse] = await Promise.all([
            fetch(yesBuyUrl),
            fetch(yesSellUrl),
            fetch(noBuyUrl),
            fetch(noSellUrl),
          ])

          // Parse all responses in parallel
          const [yesBuyData, yesSellData, noBuyData, noSellData] = await Promise.all([
            yesBuyResponse.ok ? yesBuyResponse.json().catch((e) => { console.error('YES BUY parse error:', e); return null }) : null,
            yesSellResponse.ok ? yesSellResponse.json().catch((e) => { console.error('YES SELL parse error:', e); return null }) : null,
            noBuyResponse.ok ? noBuyResponse.json().catch((e) => { console.error('NO BUY parse error:', e); return null }) : null,
            noSellResponse.ok ? noSellResponse.json().catch((e) => { console.error('NO SELL parse error:', e); return null }) : null,
          ])

          // Log response status for debugging
          if (!yesBuyResponse.ok || !yesSellResponse.ok || !noBuyResponse.ok || !noSellResponse.ok) {
            console.error('API Response errors:', {
              yesBuy: { ok: yesBuyResponse.ok, status: yesBuyResponse.status, statusText: yesBuyResponse.statusText },
              yesSell: { ok: yesSellResponse.ok, status: yesSellResponse.status, statusText: yesSellResponse.statusText },
              noBuy: { ok: noBuyResponse.ok, status: noBuyResponse.status, statusText: noBuyResponse.statusText },
              noSell: { ok: noSellResponse.ok, status: noSellResponse.status, statusText: noSellResponse.statusText },
            })
          }

          // Check if we have at least one valid price for each outcome
          if (!yesBuyData?.price && !yesSellData?.price) {
            throw new Error('Failed to fetch YES price')
          }

          if (!noBuyData?.price && !noSellData?.price) {
            throw new Error('Failed to fetch NO price')
          }

          // Calculate prices
          const yesPrice = yesBuyData?.price 
            ? parseFloat(yesBuyData.price) 
            : parseFloat(yesSellData!.price)

          const noPrice = noBuyData?.price
            ? parseFloat(noBuyData.price)
            : parseFloat(noSellData!.price)

          // Normalize prices (Polymarkets prices might be in different format)
          const normalizedYesPrice = yesPrice > 1 ? yesPrice / 100 : yesPrice
          const normalizedNoPrice = noPrice > 1 ? noPrice / 100 : noPrice

          if (isMounted) {
            setPrices({
              yesPrice: Math.max(0.01, Math.min(0.99, normalizedYesPrice)),
              noPrice: Math.max(0.01, Math.min(0.99, normalizedNoPrice)),
              lastUpdated: new Date(),
            })
            setLoading(false)
          }
        } catch (err) {
          if (!isMounted) return
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch prices'
          setError(errorMessage)
          setPrices(null)
          setLoading(false)
        }
      }

      if (useWebSocket) {
        // Use WebSocket for real-time updates
        const ws = new WebSocket('wss://ws-live-data.polymarket.com')
        wsRef.current = ws

        ws.onopen = () => {
          if (!isMounted) return
          setError(null)
          // Subscribe to price updates for both tokens
          // Note: You may need to adjust the subscription format based on RTDS documentation
          ws.send(JSON.stringify({
            type: 'subscribe',
            topic: 'prices',
            tokens: [tokens.yes, tokens.no],
          }))
        }

        ws.onmessage = (event) => {
          if (!isMounted) return
          try {
            const data = JSON.parse(event.data)
            // Process WebSocket price updates
            // Adjust this based on actual RTDS message format
            if (data.topic === 'prices' && data.payload) {
              const payload = data.payload
              if (payload[tokens.yes] && payload[tokens.no]) {
                const yesPrice = parseFloat(payload[tokens.yes].price || payload[tokens.yes])
                const noPrice = parseFloat(payload[tokens.no].price || payload[tokens.no])
                
                const normalizedYesPrice = yesPrice > 1 ? yesPrice / 100 : yesPrice
                const normalizedNoPrice = noPrice > 1 ? noPrice / 100 : noPrice

                setPrices({
                  yesPrice: Math.max(0.01, Math.min(0.99, normalizedYesPrice)),
                  noPrice: Math.max(0.01, Math.min(0.99, normalizedNoPrice)),
                  lastUpdated: new Date(),
                })
                setLoading(false)
              }
            }
          } catch (err) {
            console.error('WebSocket message parse error:', err)
          }
        }

        ws.onerror = () => {
          if (!isMounted) return
          setError('WebSocket connection error')
          setLoading(false)
          // Fallback to polling if WebSocket fails
          fetchPricesWithTokens()
          intervalRef.current = setInterval(() => {
            fetchPricesWithTokens()
          }, interval)
        }

        ws.onclose = () => {
          if (!isMounted) return
          // Reconnect or fallback to polling
          fetchPricesWithTokens()
          intervalRef.current = setInterval(() => {
            fetchPricesWithTokens()
          }, interval)
        }

        // Initial fetch via REST while WebSocket connects
        fetchPricesWithTokens()
      } else {
        // Use REST API polling
        fetchPricesWithTokens()
        intervalRef.current = setInterval(() => {
          fetchPricesWithTokens()
        }, interval)
      }
    }

    // Initialize tokens and start fetching
    initializeTokens()

    // Cleanup
    return () => {
      isMounted = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [pair, timeframe, interval, yesTokenId, noTokenId, useWebSocket])

  return { prices, loading, error }
}

export default usePolymarketPrices

