/**
 * Polymarket CLOB API client
 * Handles HTTP requests to Polymarket APIs
 */

const POLYMARKET_CLOB_API = process.env.POLYMARKET_CLOB_API || 'https://clob.polymarket.com'
const POLYMARKET_API = process.env.POLYMARKET_API || 'https://api.polymarket.com'
const POLYMARKET_GAMMA_API = process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com'
const POLYMARKET_DATA_API = process.env.POLYMARKET_DATA_API || 'https://data-api.polymarket.com'

export interface MarketMetadata {
  marketId: string
  question: string
  conditionId: string
  tokenId: string
  tickSize: string
  eventTimeframe?: string
  startTime?: number
  endTime?: number
  eventStartTime?: number  // Actual event start time (from API eventStartTime field)
  eventEndTime?: number    // Calculated event end time (eventStartTime + timeframe duration)
  slug?: string
  yesTokenId?: string
  noTokenId?: string
  tokenIds?: string[]
  active?: boolean
  closed?: boolean
  acceptingOrders?: boolean
}

export interface OrderbookData {
  bids: Array<{ price: string; size: string }>
  asks: Array<{ price: string; size: string }>
  timestamp?: string
  hash?: string
  asset_id?: string
}

const parseDateValue = (value: string | number | undefined): number | undefined => {
  if (!value) return undefined
  if (typeof value === 'number') return value
  const parsed = new Date(value).getTime()
  return isNaN(parsed) ? undefined : parsed
}

const normalizeTokenIds = (raw: unknown): string[] => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((id) => typeof id === 'string')
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((id) => typeof id === 'string')
      }
    } catch {
      return []
    }
  }
  return []
}

/**
 * Generate 1h market slug from timestamp
 * Format: {pair-full-name}-up-or-down-{month}-{day}-{time}-et
 * Example: solana-up-or-down-november-27-2pm-et
 */
const generate1hSlug = (pair: string, eventStartSeconds: number): string | null => {
  const pairFullNames: Record<string, string> = {
    'BTC': 'bitcoin',
    'SOL': 'solana',
    'ETH': 'ethereum',
    'XRP': 'xrp',
  }
  
  const pairFullName = pairFullNames[pair.toUpperCase()]
  if (!pairFullName) return null
  
  try {
    const eventDate = new Date(eventStartSeconds * 1000)
    if (isNaN(eventDate.getTime())) return null
    
    const etDate = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      hour12: true,
    }).formatToParts(eventDate)
    
    const month = etDate.find(p => p.type === 'month')?.value.toLowerCase() || ''
    const day = etDate.find(p => p.type === 'day')?.value || ''
    const hour = etDate.find(p => p.type === 'hour')?.value || ''
    const dayPeriod = etDate.find(p => p.type === 'dayPeriod')?.value?.toLowerCase() || ''
    
    if (!month || !day || !hour || !dayPeriod) return null
    
    const timeStr = `${hour}${dayPeriod}`
    return `${pairFullName}-up-or-down-${month}-${day}-${timeStr}-et`
  } catch (error) {
    return null
  }
}

/**
 * Fetch multiple orderbooks at once (more efficient)
 * Uses CLOB API: POST https://clob.polymarket.com/books
 */
export const fetchMultipleOrderbooks = async (tokenIds: string[]): Promise<Map<string, OrderbookData>> => {
  const results = new Map<string, OrderbookData>()
  
  if (tokenIds.length === 0) return results
  
  try {
    // Use batch endpoint for efficiency
    const response = await fetch(
      `${POLYMARKET_CLOB_API}/books`,
      {
        method: 'POST',
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tokenIds.map(tokenId => ({ token_id: tokenId }))),
      }
    )

    if (!response.ok) {
      throw new Error(`Multiple orderbooks API error: ${response.status}`)
    }

    const data = await response.json() as any[]
    
    // Debug: Log first 2 results
    if (data.length > 0) {
      const sample = data.slice(0, 2)
      sample.forEach((book: any, i: number) => {
        const lastBid = book.bids?.[book.bids?.length - 1]?.price
        console.log(`[clobClient] Book ${i}: asset_id=${book.asset_id?.substring(0, 20)}..., bids=${book.bids?.length}, lastBid(best)=${lastBid}`)
      })
    }
    
    // Map results back to token IDs using asset_id for reliable matching
    for (let i = 0; i < data.length; i++) {
      const orderbook = data[i]
      if (orderbook && orderbook.bids && orderbook.asks && orderbook.asset_id) {
        // Use asset_id from response to match to correct token (more reliable than index)
        const tokenId = orderbook.asset_id
        
        // IMPORTANT: Sort bids/asks properly regardless of API order
        // Best bid = HIGHEST buy price (what buyers will pay)
        // Best ask = LOWEST sell price (what sellers will accept)
        const bids = Array.isArray(orderbook.bids) 
          ? [...orderbook.bids].sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price))  // Highest first
          : []
        const asks = Array.isArray(orderbook.asks)
          ? [...orderbook.asks].sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price))  // Lowest first
          : []
        
        // Debug: Log the best prices we found
        if (bids.length > 0 && asks.length > 0) {
          console.log(`[clobClient] Token ${tokenId.substring(0,12)}... bestBid=${bids[0].price} bestAsk=${asks[0].price}`)
        }
        
        // Extract full OrderBookSummary including timestamp and hash for change detection
        results.set(tokenId, {
          bids: bids,
          asks: asks,
          timestamp: orderbook.timestamp,
          hash: orderbook.hash,
          asset_id: orderbook.asset_id,
        })
      }
    }
  } catch (error) {
    // Fallback to individual fetches if batch fails
    console.warn('[clobClient] Batch orderbook fetch failed, will use individual fetches')
  }
  
  return results
}

/**
 * Fetch markets list from Polymarket
 * Returns markets for BTC/SOL/ETH/XRP with 15m, 1h timeframes
 * Uses Gamma API which is the correct endpoint for market searches
 * 
 * Based on Polymarket docs: https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide
 * - Use `closed=false` to get only active markets
 * - Use `order=id&ascending=false` to get newest markets first
 * - Check `active` field to ensure market is active
 */
export const fetchMarketsList = async (): Promise<MarketMetadata[]> => {
  try {
    // Use Gamma API to fetch active markets with proper filters
    // According to docs: 
    // - closed=false gets only active markets
    // - order=id&ascending=false gets newest first
    // - liquidity_num_min filters for markets with actual trading activity
    //   (markets with liquidity are more likely to have active prices 10-90c)
    const now = new Date()
    const nowISO = now.toISOString()
    
    // Build query to get markets - use search endpoint for better results
    // and also try the markets endpoint with higher limits
    const allMarkets: any[] = []
    const existingIds = new Set<string>()
    
    // Strategy 1: Use search endpoint for each crypto pair and timeframe
    const searchTerms = ['BTC', 'SOL', 'ETH', 'XRP']
    const timeframes = ['15m', '1h']
    
    for (const term of searchTerms) {
      for (const timeframe of timeframes) {
        try {
          const queries = timeframe === '1h' 
            ? [
                `${term} ${timeframe} up down`,
                `${term} ${timeframe} up or down`,
                `${term} ${timeframe}`,
                `${term} hourly up down`,
                `${term} hourly up or down`,
                `${term} hourly`,
                // Hourly markets use "up or down" format in slugs
                `${term} up or down`,
                `${term} up-or-down`,
              ]
            : [
                `${term} ${timeframe} up down`,
                `${term} ${timeframe} up or down`,
                `${term} ${timeframe}`,
              ]
          
          for (const query of queries) {
            const searchUrl = `${POLYMARKET_GAMMA_API}/search?type=market&closed=false&limit=100&q=${encodeURIComponent(query)}`
            const searchResponse = await fetch(searchUrl, {
              headers: { 'Accept': 'application/json' },
            })
            
            if (searchResponse.ok) {
              const searchData = await searchResponse.json() as any
              const searchMarkets = Array.isArray(searchData) ? searchData : 
                                   (Array.isArray(searchData?.markets) ? searchData.markets : 
                                   (Array.isArray(searchData?.results) ? searchData.results :
                                   (Array.isArray(searchData?.data) ? searchData.data : [])))
              
              for (const market of searchMarkets) {
                const marketId = market.id || market.slug
                if (marketId && !existingIds.has(marketId)) {
                  allMarkets.push(market)
                  existingIds.add(marketId)
                }
              }
            }
          }
        } catch (error) {
          // Continue with other searches
        }
      }
    }
    
    console.log(`[clobClient] Found ${allMarkets.length} markets from search endpoint`)
    
    // Strategy 2: Also try markets endpoint with high limit
    try {
      const url = `${POLYMARKET_GAMMA_API}/markets?closed=false&limit=2000&order=id&ascending=false`
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      })

      if (response.ok) {
        const data = await response.json() as any
        const markets = Array.isArray(data) ? data : (data?.data || [])
        
        for (const market of markets) {
          const marketId = market.id || market.slug
          if (marketId && !existingIds.has(marketId)) {
            allMarkets.push(market)
            existingIds.add(marketId)
          }
        }
        console.log(`[clobClient] Added ${markets.length} markets from markets endpoint (total: ${allMarkets.length})`)
      }
    } catch (error) {
      console.error(`Error fetching from markets endpoint:`, error)
    }
    
    // Strategy 3: Direct slug lookup for 1h markets (bypasses search which doesn't find them)
    // Generate slugs for current hour and a few hours around it, then fetch directly
    try {
      const now = Date.now()
      const oneHourMs = 60 * 60 * 1000
      
      // Try current hour and ±3 hours (7 hours total range)
      const hourOffsets = [-3, -2, -1, 0, 1, 2, 3]
      
      for (const term of searchTerms) {
        for (const hourOffset of hourOffsets) {
          const targetTime = now + (hourOffset * oneHourMs)
          const targetSeconds = Math.floor(targetTime / 1000)
          
          // Round down to the hour
          const targetDate = new Date(targetTime)
          targetDate.setMinutes(0, 0, 0)
          const hourStartSeconds = Math.floor(targetDate.getTime() / 1000)
          
          const slug = generate1hSlug(term, hourStartSeconds)
          if (!slug) continue
          
          // Skip if we already have this market
          if (existingIds.has(slug)) continue
          
          try {
            // Fetch market directly by slug
            const response = await fetch(`${POLYMARKET_GAMMA_API}/markets/slug/${slug}`, {
              headers: { 'Accept': 'application/json' },
            })
            
            if (response.ok) {
              const market = await response.json() as any
              const marketId = market.id || market.slug
              
              // Only add if it has clobTokenIds and matches our criteria
              const tokenIds = normalizeTokenIds(market.clobTokenIds)
              if (tokenIds.length >= 2 && marketId && !existingIds.has(marketId)) {
                // Check if it's active (or at least not closed)
                if (market.closed !== true) {
                  allMarkets.push(market)
                  existingIds.add(marketId)
                }
              }
            }
          } catch (error) {
            // Continue with next slug
          }
        }
      }
      
      console.log(`[clobClient] Added markets from direct slug lookup (total: ${allMarkets.length})`)
    } catch (error) {
      console.error(`Error in direct slug lookup:`, error)
    }

    // Filter for crypto UP/DOWN markets with 15m/1h timeframes
    // (searchTerms and timeframes already declared above)
    const markets: MarketMetadata[] = []

    console.log(`[clobClient] Processing ${allMarkets.length} markets from Gamma API`)

    for (const market of allMarkets) {
      // According to docs, check `active` and `closed` fields
      // `closed=false` in query should filter these, but double-check
      if (market?.closed === true || market?.active === false) {
        continue
      }
      
      // Note: We're NOT filtering by acceptingOrders because we want to include
      // future markets that haven't started accepting orders yet. This allows
      // us to see markets that are coming up soon.

      const slug = (market.slug || '').toLowerCase()
      const question = (market.question || '').toLowerCase()
      const title = (market.title || '').toLowerCase()

      // Check if it matches our search criteria
      for (const term of searchTerms) {
        for (const timeframe of timeframes) {
          const termLower = term.toLowerCase()
          const frameLower = timeframe.toLowerCase()
          
          // Pattern 1: Slug pattern (most reliable) - e.g., "btc-updown-15m-1764211500" or "solana-up-or-down-november-27-2pm-et"
          let matchesSlug = false
          if (slug) {
            if (frameLower === '15m') {
              // 15m markets use timestamp format: "sol-updown-15m-1764211500"
              const slugPattern = new RegExp(`^${termLower}-updown-${frameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`)
              matchesSlug = slugPattern.test(slug)
            } else if (frameLower === '1h') {
              // Hourly markets use human-readable format: "solana-up-or-down-november-27-2pm-et"
              // Match pattern: <pair-full-name>-up-or-down-<month>-<day>-<time>-et
              const pairFullNames: Record<string, string> = {
                'btc': 'bitcoin',
                'sol': 'solana',
                'eth': 'ethereum',
                'xrp': 'xrp',
              }
              const pairFullName = pairFullNames[termLower] || termLower
              const hourlyPattern = new RegExp(`^${pairFullName}-up-or-down-[a-z]+-\\d+-\\d+(am|pm)-et$`)
              matchesSlug = hourlyPattern.test(slug)
            }
          }
          
          // Pattern 2: Question/title pattern - check for crypto name and timeframe
          const hasCrypto = question.includes(termLower) || title.includes(termLower) || 
                           (termLower === 'btc' && (question.includes('bitcoin') || title.includes('bitcoin'))) ||
                           (termLower === 'eth' && (question.includes('ethereum') || title.includes('ethereum'))) ||
                           (termLower === 'sol' && (question.includes('solana') || title.includes('solana')))
          
          // Improved timeframe detection - handle 15m, 1h, 1 hour, 60m, etc.
          let hasTimeframe = false
          if (frameLower === '15m') {
            hasTimeframe = question.includes('15m') || title.includes('15m') ||
                          question.includes('15 minute') || title.includes('15 minute') ||
                          question.includes('15-min') || title.includes('15-min')
          } else if (frameLower === '1h') {
            // Hourly markets: check for explicit timeframe OR slug format OR seriesSlug
            const seriesSlug = (market.events?.[0]?.seriesSlug || '').toLowerCase()
            hasTimeframe = question.includes('1h') || title.includes('1h') ||
                          question.includes('1 hour') || title.includes('1 hour') ||
                          question.includes('60m') || title.includes('60m') ||
                          question.includes('60 minute') || title.includes('60 minute') ||
                          question.includes('1-hour') || title.includes('1-hour') ||
                          seriesSlug.includes('hourly') ||
                          slug.includes('-up-or-down-') // Hourly markets use this slug format
          }
          
          const hasUpDown = question.includes('up') && question.includes('down')
          const matchesQuestion = hasCrypto && hasTimeframe && hasUpDown

          if (matchesSlug || matchesQuestion) {
            // Extract token IDs from clobTokenIds
            let tokenIds: string[] = []
            if (market.clobTokenIds) {
              if (Array.isArray(market.clobTokenIds)) {
                tokenIds = market.clobTokenIds
              } else if (typeof market.clobTokenIds === 'string') {
                try {
                  tokenIds = JSON.parse(market.clobTokenIds)
                } catch {
                  tokenIds = []
                }
              }
            }

            if (tokenIds.length >= 2) {
              const marketSlug = market.slug
              
              // If we have a slug but no eventStartTime, fetch full market details to get it
              let fullMarketData: any = market
              if (marketSlug && !market.eventStartTime && !market.event_start_time && !market.eventStart && !market.event_start) {
                try {
                  // Fetch full market details by slug to get eventStartTime
                  const fullMarket = await fetchMarketBySlug(marketSlug)
                  if (fullMarket && fullMarket.eventStartTime) {
                    fullMarketData = { ...market, eventStartTime: fullMarket.eventStartTime }
                  }
                } catch (error) {
                  // Continue with original market data if fetch fails
                  console.warn(`[clobClient] Could not fetch full details for ${marketSlug}:`, error)
                }
              }
              
              // Try multiple field names for start/end times
              const startDate = fullMarketData.startDate || fullMarketData.start_date || fullMarketData.startTime || fullMarketData.start_time
              const endDate = fullMarketData.endDate || fullMarketData.end_date || fullMarketData.endTime || fullMarketData.end_time
              
              // Parse dates - handle both ISO strings and timestamps
              let startTime: number | undefined
              let endTime: number | undefined
              
              if (startDate) {
                if (typeof startDate === 'number') {
                  startTime = startDate
                } else if (typeof startDate === 'string') {
                  const parsed = new Date(startDate).getTime()
                  if (!isNaN(parsed)) startTime = parsed
                }
              }
              
              if (endDate) {
                if (typeof endDate === 'number') {
                  endTime = endDate
                } else if (typeof endDate === 'string') {
                  const parsed = new Date(endDate).getTime()
                  if (!isNaN(parsed)) endTime = parsed
                }
              }
              
              // Capture eventStartTime from API (actual event start time)
              let eventStartTime: number | undefined
              const eventStartDate = fullMarketData.eventStartTime || fullMarketData.event_start_time || fullMarketData.eventStart || fullMarketData.event_start
              if (eventStartDate) {
                if (typeof eventStartDate === 'number') {
                  eventStartTime = eventStartDate
                } else if (typeof eventStartDate === 'string') {
                  const parsed = new Date(eventStartDate).getTime()
                  if (!isNaN(parsed)) eventStartTime = parsed
                }
              }
              
              // Calculate eventEndTime based on timeframe
              let eventEndTime: number | undefined
              if (eventStartTime) {
                const timeframeMinutes = timeframe === '1h' ? 60 : 15
                eventEndTime = eventStartTime + (timeframeMinutes * 60 * 1000)
              }
              
              // IMPORTANT: Determine correct UP/DOWN token mapping based on outcomes
              // Polymarket's clobTokenIds order matches the outcomes array order
              // outcomes = ["Up", "Down"] means tokenIds[0] = Up, tokenIds[1] = Down
              // outcomes = ["Down", "Up"] means tokenIds[0] = Down, tokenIds[1] = Up
              let upTokenId = tokenIds[0]
              let downTokenId = tokenIds[1]
              
              // Check outcomes field to determine correct mapping
              const outcomes = fullMarketData.outcomes || market.outcomes
              if (Array.isArray(outcomes) && outcomes.length >= 2) {
                const upIndex = outcomes.findIndex((o: string) => 
                  o.toLowerCase() === 'up' || o.toLowerCase() === 'yes'
                )
                const downIndex = outcomes.findIndex((o: string) => 
                  o.toLowerCase() === 'down' || o.toLowerCase() === 'no'
                )
                
                if (upIndex !== -1 && downIndex !== -1 && upIndex < tokenIds.length && downIndex < tokenIds.length) {
                  upTokenId = tokenIds[upIndex]
                  downTokenId = tokenIds[downIndex]
                  console.log(`[clobClient] Token mapping from outcomes: Up=${upIndex}, Down=${downIndex}`)
                }
              }
              
              // Create metadata with correct UP/DOWN token mapping
              markets.push({
                marketId: fullMarketData.id || fullMarketData.slug || market.id || market.slug,
                question: fullMarketData.question || fullMarketData.title || market.question || market.title || '',
                conditionId: fullMarketData.conditionId || fullMarketData.condition_id || market.conditionId || market.condition_id || '',
                tokenId: upTokenId, // default to Up token for compatibility
                yesTokenId: upTokenId,
                noTokenId: downTokenId,
                tokenIds,
                slug: marketSlug,
                tickSize: fullMarketData.orderPriceMinTickSize?.toString() || market.orderPriceMinTickSize?.toString() || '0.01',
                eventTimeframe: timeframe,
                startTime,
                endTime,
                eventStartTime,
                eventEndTime,
                active: fullMarketData.active !== undefined ? fullMarketData.active : market.active,
                closed: fullMarketData.closed !== undefined ? fullMarketData.closed : market.closed,
                acceptingOrders: fullMarketData.acceptingOrders !== undefined ? fullMarketData.acceptingOrders : market.acceptingOrders,
              })
              console.log(`[clobClient] Found market: ${fullMarketData.id || market.id} - ${fullMarketData.question || market.question || market.title}${eventStartTime ? ' (with eventStartTime)' : ''} [Up: ${upTokenId.substring(0,8)}..., Down: ${downTokenId.substring(0,8)}...]`)
            }
            break // Found a match, move to next market
          }
        }
      }
    }
    
    console.log(`[clobClient] Found ${markets.length} matching crypto UP/DOWN markets`)

    // Deduplicate by marketId
    const uniqueMarkets = new Map<string, MarketMetadata>()
    for (const market of markets) {
      if (!uniqueMarkets.has(market.marketId)) {
        uniqueMarkets.set(market.marketId, market)
      }
    }

    return Array.from(uniqueMarkets.values())
  } catch (error) {
    console.error('Error fetching markets list:', error)
    return []
  }
}

/**
 * Fetch orderbook for a specific token
 * Uses CLOB API: https://clob.polymarket.com/book?token_id=...
 */
export const fetchOrderbook = async (tokenId: string): Promise<OrderbookData | null> => {
  try {
    const response = await fetch(
      `${POLYMARKET_CLOB_API}/book?token_id=${tokenId}`,
      {
        headers: { 'Accept': 'application/json' },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        // Orderbook doesn't exist for this token - not an error, just no data
        return null
      }
      throw new Error(`Orderbook API error: ${response.status}`)
    }

    const data = await response.json() as any
    // IMPORTANT: Sort bids/asks properly regardless of API order
    // Best bid = HIGHEST buy price (what buyers will pay)
    // Best ask = LOWEST sell price (what sellers will accept)
    const bids = Array.isArray(data.bids) 
      ? [...data.bids].sort((a: any, b: any) => parseFloat(b.price) - parseFloat(a.price))  // Highest first
      : []
    const asks = Array.isArray(data.asks)
      ? [...data.asks].sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price))  // Lowest first
      : []
    // Return full OrderBookSummary structure
    return {
      bids: bids,
      asks: asks,
      timestamp: data.timestamp,
      hash: data.hash,
      asset_id: data.asset_id,
    }
  } catch (error) {
    // Don't log DNS errors as they're network issues, not API issues
    const errorMsg = error instanceof Error ? error.message : String(error)
    if (!errorMsg.includes('ENOTFOUND')) {
      console.error(`Error fetching orderbook for ${tokenId.substring(0, 20)}...:`, errorMsg)
    }
    return null
  }
}

/**
 * Fetch market details
 */
export const fetchMarketDetails = async (marketId: string): Promise<MarketMetadata | null> => {
  try {
    const response = await fetch(`${POLYMARKET_API}/markets/${marketId}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Market details API error: ${response.status}`)
    }

    const data = await response.json() as any
    return {
      marketId: data.market_id || data.id,
      question: data.question || data.title,
      conditionId: data.condition_id || data.conditionId,
      tokenId: data.token_id || data.tokenId,
      tickSize: data.tick_size || '0.01',
      eventTimeframe: data.timeframe,
      startTime: data.start_time ? new Date(data.start_time).getTime() : undefined,
      endTime: data.end_time ? new Date(data.end_time).getTime() : undefined,
    }
  } catch (error) {
    console.error(`Error fetching market details for ${marketId}:`, error)
    return null
  }
}

/**
 * Fetch a market directly by slug from Gamma API
 */
export const fetchMarketBySlug = async (slug: string): Promise<MarketMetadata | null> => {
  try {
    const response = await fetch(`${POLYMARKET_GAMMA_API}/markets/slug/${slug}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`[clobClient] Market slug lookup failed (${response.status}) for ${slug}`)
      }
      return null
    }

    const market = await response.json() as any
    const tokenIds = normalizeTokenIds(market.clobTokenIds)
    if (tokenIds.length === 0) {
      return null
    }

    let timeframe: string | undefined
    const slugMatch = typeof market.slug === 'string' ? market.slug.match(/updown-(\w+)-/) : null
    if (slugMatch && slugMatch[1]) {
      timeframe = slugMatch[1]
    }
    
    // Also check for hourly markets with different slug format
    if (!timeframe && market.slug && market.slug.includes('-up-or-down-') && market.slug.endsWith('-et')) {
      timeframe = '1h'
    }

    // Capture eventStartTime from API (actual event start time)
    const eventStartTime = parseDateValue(market.eventStartTime || market.event_start_time || market.eventStart || market.event_start)
    
    // Calculate eventEndTime based on timeframe
    let eventEndTime: number | undefined
    if (eventStartTime) {
      const timeframeMinutes = timeframe === '1h' ? 60 : 15
      eventEndTime = eventStartTime + (timeframeMinutes * 60 * 1000)
    }

    // IMPORTANT: Determine correct UP/DOWN token mapping based on outcomes
    // Polymarket's clobTokenIds order matches the outcomes array order
    let upTokenId = tokenIds[0]
    let downTokenId = tokenIds[1]
    
    // Check outcomes field to determine correct mapping
    const outcomes = market.outcomes
    if (Array.isArray(outcomes) && outcomes.length >= 2) {
      const upIndex = outcomes.findIndex((o: string) => 
        o.toLowerCase() === 'up' || o.toLowerCase() === 'yes'
      )
      const downIndex = outcomes.findIndex((o: string) => 
        o.toLowerCase() === 'down' || o.toLowerCase() === 'no'
      )
      
      if (upIndex !== -1 && downIndex !== -1 && upIndex < tokenIds.length && downIndex < tokenIds.length) {
        upTokenId = tokenIds[upIndex]
        downTokenId = tokenIds[downIndex]
        console.log(`[clobClient] fetchMarketBySlug token mapping: Up=${upIndex}, Down=${downIndex}`)
      }
    }

    return {
      marketId: market.id || market.slug,
      question: market.question || market.title || '',
      conditionId: market.conditionId || market.condition_id || '',
      tokenId: upTokenId,
      yesTokenId: upTokenId,
      noTokenId: downTokenId,
      tokenIds,
      slug: market.slug,
      tickSize: market.orderPriceMinTickSize?.toString() || '0.01',
      eventTimeframe: timeframe,
      startTime: parseDateValue(market.startDate || market.start_date || market.startTime || market.start_time),
      endTime: parseDateValue(market.endDate || market.end_date || market.endTime || market.end_time),
      eventStartTime,
      eventEndTime,
      active: market.active,
      closed: market.closed,
      acceptingOrders: market.acceptingOrders,
    }
  } catch (error) {
    console.error(`[clobClient] Error fetching market by slug ${slug}:`, error)
    return null
  }
}

