'use server'

import { NextResponse } from 'next/server'
import { getUserOrders } from '@/lib/websocket-server'
import { makeAuthenticatedRequest } from '@/lib/polymarket-api-auth'
import { PolymarketApiCredentials } from '@/lib/polymarket-api-auth'

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com'

// Fetch active markets and build a lookup map of tokenId -> market info
async function buildMarketLookup(): Promise<Map<string, { title: string; slug: string; endDate?: string }>> {
  const lookup = new Map<string, { title: string; slug: string; endDate?: string }>()
  
  try {
    // Fetch recent active markets (including recently closed for order matching)
    const response = await fetch(`${GAMMA_API_BASE}/markets?limit=500&order=id&ascending=false`, {
      cache: 'no-store'
    })
    
    if (!response.ok) {
      console.error('[Orders API] Failed to fetch markets for lookup:', response.status)
      return lookup
    }
    
    const markets = await response.json()
    const marketList = Array.isArray(markets) ? markets : (markets?.data || [])
    
    for (const market of marketList) {
      // Parse token IDs from clobTokenIds
      let tokenIds: string[] = []
      if (market?.clobTokenIds) {
        if (Array.isArray(market.clobTokenIds)) {
          tokenIds = market.clobTokenIds
        } else if (typeof market.clobTokenIds === 'string') {
          try {
            tokenIds = JSON.parse(market.clobTokenIds)
          } catch {
            // Ignore parse errors
          }
        }
      }
      
      // Parse outcomes to match token to outcome
      let outcomes: string[] = []
      if (market?.outcomes) {
        if (Array.isArray(market.outcomes)) {
          outcomes = market.outcomes
        } else if (typeof market.outcomes === 'string') {
          try {
            outcomes = JSON.parse(market.outcomes)
          } catch {
            outcomes = []
          }
        }
      }
      
      const title = market.title || market.question || ''
      const slug = market.slug || ''
      const endDate = market.endDate || market.end_date || ''
      
      // Map each token ID to market info
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i]
        const outcome = outcomes[i] || (i === 0 ? 'Yes' : 'No')
        lookup.set(tokenId, { 
          title: title ? `${title} - ${outcome}` : outcome,
          slug,
          endDate
        })
      }
    }
    
    console.log('[Orders API] Built market lookup with', lookup.size, 'tokens')
  } catch (error) {
    console.error('[Orders API] Error building market lookup:', error)
  }
  
  return lookup
}

// Fetch individual market info by token ID
async function fetchMarketByTokenId(tokenId: string): Promise<{ title: string; slug: string; endDate?: string } | null> {
  try {
    // Try to find market by token ID
    const response = await fetch(`${GAMMA_API_BASE}/markets?clob_token_ids=${tokenId}`, {
      cache: 'no-store'
    })
    
    if (response.ok) {
      const markets = await response.json()
      const marketList = Array.isArray(markets) ? markets : (markets?.data || [])
      
      if (marketList.length > 0) {
        const market = marketList[0]
        
        // Find the outcome for this token
        let outcomes: string[] = []
        let tokenIds: string[] = []
        
        if (market?.outcomes) {
          outcomes = Array.isArray(market.outcomes) ? market.outcomes : 
            (typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : [])
        }
        if (market?.clobTokenIds) {
          tokenIds = Array.isArray(market.clobTokenIds) ? market.clobTokenIds :
            (typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : [])
        }
        
        const tokenIndex = tokenIds.findIndex(t => t === tokenId)
        const outcome = outcomes[tokenIndex] || (tokenIndex === 0 ? 'Yes' : 'No')
        const title = market.title || market.question || ''
        
        return {
          title: title ? `${title} - ${outcome}` : outcome,
          slug: market.slug || '',
          endDate: market.endDate || market.end_date || ''
        }
      }
    }
  } catch (error) {
    console.error('[Orders API] Error fetching market by tokenId:', error)
  }
  return null
}

// Enrich orders with market info
async function enrichOrders(orders: any[], marketLookup: Map<string, { title: string; slug: string; endDate?: string }>): Promise<any[]> {
  const enrichedOrders = []
  
  for (const order of orders) {
    const tokenId = order.asset_id || order.token_id || order.tokenId || ''
    let marketInfo = marketLookup.get(tokenId)
    
    // If not found in bulk lookup, try individual fetch
    if (!marketInfo && tokenId) {
      const fetchedMarket = await fetchMarketByTokenId(tokenId)
      marketInfo = fetchedMarket || undefined
    }
    
    if (marketInfo) {
      enrichedOrders.push({
        ...order,
        title: marketInfo.title,
        slug: marketInfo.slug,
        market_end_date: marketInfo.endDate,
      })
    } else {
      enrichedOrders.push(order)
    }
  }
  
  return enrichedOrders
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const walletAddress = searchParams.get('address')
  const credentialsParam = searchParams.get('credentials') // JSON string of credentials

  if (!walletAddress) {
    return NextResponse.json({ error: 'Missing wallet address parameter' }, { status: 400 })
  }

  // If credentials are provided, use Polymarket API directly
  if (credentialsParam) {
    console.log('[Orders API] Credentials param received, length:', credentialsParam.length)
    
    try {
      const credentials: PolymarketApiCredentials = JSON.parse(credentialsParam)
      
      console.log('[Orders API] Fetching orders for:', walletAddress.slice(0, 10) + '...')
      console.log('[Orders API] Credentials parsed:', { 
        hasApiKey: !!credentials.apiKey, 
        apiKeyLength: credentials.apiKey?.length,
        hasSecret: !!credentials.secret,
        secretLength: credentials.secret?.length,
        hasPassphrase: !!credentials.passphrase,
        passphraseLength: credentials.passphrase?.length,
      })
      
      // Fetch LIVE orders from Polymarket CLOB API
      // GET /data/orders with L2 authentication
      const response = await makeAuthenticatedRequest(
        'GET',
        '/data/orders', // Don't include query params in path for HMAC signature
        walletAddress,
        credentials
      )

      console.log('[Orders API] Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('[Orders API] Raw response:', JSON.stringify(data).slice(0, 500))
        
        // Polymarket returns array of orders directly
        let orders = Array.isArray(data) ? data : (data.orders || data.data || [])
        console.log('[Orders API] Parsed orders count:', orders.length)
        
        // Enrich orders with market info if we have any orders
        if (orders.length > 0) {
          const marketLookup = await buildMarketLookup()
          orders = await enrichOrders(orders, marketLookup)
        }
        
        return NextResponse.json({ orders, count: orders.length, source: 'polymarket-api' })
      } else {
        const errorText = await response.text()
        console.error('[Orders API] Error response:', response.status, errorText)
        // Return the error info instead of falling through
        return NextResponse.json({ 
          orders: [], 
          count: 0, 
          source: 'polymarket-api-error',
          error: `Polymarket API returned ${response.status}`,
          errorDetails: errorText.slice(0, 200)
        })
      }
    } catch (error: any) {
      console.error('[Orders API] Polymarket API orders fetch error:', error.message)
      // Return error info instead of silent fallback
      return NextResponse.json({ 
        orders: [], 
        count: 0, 
        source: 'polymarket-api-exception',
        error: error.message
      })
    }
  } else {
    console.log('[Orders API] No credentials provided, using fallback')
  }

  // Fallback to WebSocket server (only if no credentials)
  try {
    console.log('[Orders API] Trying WebSocket server fallback...')
    const orders = await getUserOrders(walletAddress)
    return NextResponse.json({ orders, count: Array.isArray(orders) ? orders.length : 0, source: 'websocket' })
  } catch (error: any) {
    console.error('[Orders API] WebSocket fallback error:', error.message)
    // Fallback to empty array if WebSocket server is not available
    return NextResponse.json({ orders: [], count: 0, source: 'none' })
  }
}

