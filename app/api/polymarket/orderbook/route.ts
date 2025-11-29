'use server'

import { NextResponse } from 'next/server'

// Use Polymarket APIs:
// - CLOB for orderbook data
// - Gamma for market details (to resolve clobTokenIds from slug/id)
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com'
const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tokenId = searchParams.get('tokenId')
  const tokenIds = searchParams.get('tokenIds') // Comma-separated list
  const slug = searchParams.get('slug')
  const marketId = searchParams.get('marketId')

  try {
    console.log('[Orderbook API] Incoming request', {
      tokenId,
      tokenIds,
      slug,
      marketId,
    })

    // 1) If we have a specific tokenId, use it directly (existing behaviour)
    if (tokenId) {
      const response = await fetch(`${POLYMARKET_CLOB_API}/book?token_id=${tokenId}`, {
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      })

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({ bids: [], asks: [] })
        }
        throw new Error(`Polymarket CLOB API error: ${response.status}`)
      }

      const data = await response.json()
      // CLOB API returns { bids: [...], asks: [...] } directly
      // IMPORTANT: Polymarket CLOB API returns bids/asks in REVERSE order:
      // - Bids: sorted lowest to highest (we need highest to lowest)
      // - Asks: sorted highest to lowest (we need lowest to highest)
      const bids = Array.isArray(data.bids) ? [...data.bids].reverse() : []
      const asks = Array.isArray(data.asks) ? [...data.asks].reverse() : []
      return NextResponse.json({
        bids: bids,
        asks: asks,
      })
    }

    // 2) If we have multiple tokenIds, use CLOB batch API
    if (tokenIds) {
      const tokenArray = tokenIds.split(',').map((id) => id.trim()).filter(Boolean)
      if (tokenArray.length === 0) {
        return NextResponse.json({ bids: [], asks: [] })
      }

      const response = await fetch(`${POLYMARKET_CLOB_API}/books`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(tokenArray.map((id) => ({ token_id: id }))),
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Polymarket CLOB API error: ${response.status}`)
      }

      const data = await response.json()
      // CLOB batch API returns array of { asset_id, bids, asks }
      // IMPORTANT: Polymarket CLOB API returns bids/asks in REVERSE order - reverse them
      if (Array.isArray(data) && data.length > 0) {
        const bids = Array.isArray(data[0].bids) ? [...data[0].bids].reverse() : []
        const asks = Array.isArray(data[0].asks) ? [...data[0].asks].reverse() : []
        return NextResponse.json({
          bids: bids,
          asks: asks,
        })
      }
      return NextResponse.json({ bids: [], asks: [] })
    }

    // 3) If we have a slug or marketId (from "View on Polymarket"), resolve clobTokenIds via Gamma
    if (slug || marketId) {
      // Fetch full market details from Gamma
      const detailsUrl = slug
        ? `${POLYMARKET_GAMMA_API}/markets/slug/${encodeURIComponent(slug)}`
        : `${POLYMARKET_GAMMA_API}/markets/${encodeURIComponent(marketId!)}`

      console.log('[Orderbook API] Fetching Gamma market details from', detailsUrl)

      const detailsResponse = await fetch(detailsUrl, {
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      })

      if (!detailsResponse.ok) {
        if (detailsResponse.status === 404) {
          // No such market – return empty book rather than throwing
          return NextResponse.json({ bids: [], asks: [] })
        }
        throw new Error(`Polymarket Gamma API error: ${detailsResponse.status}`)
      }

      const market = await detailsResponse.json()
      console.log('[Orderbook API] Gamma market id', market?.id || market?.slug || null)

      // Extract clobTokenIds in a resilient way – Gamma may expose different field shapes.
      let clobTokenIds: string[] = []
      if (Array.isArray(market.clobTokenIds)) {
        clobTokenIds = market.clobTokenIds
      } else if (Array.isArray(market.clob_token_ids)) {
        clobTokenIds = market.clob_token_ids
      } else if (typeof market.clobTokenIds === 'string') {
        try {
          const parsed = JSON.parse(market.clobTokenIds)
          if (Array.isArray(parsed)) {
            clobTokenIds = parsed
          }
        } catch {
          // ignore parsing error – fall back to empty array
        }
      }

      // Fallbacks: some Gamma variants embed tokens under other fields
      if (clobTokenIds.length === 0 && Array.isArray(market.tokenIds)) {
        clobTokenIds = market.tokenIds
      }
      if (clobTokenIds.length === 0 && Array.isArray(market.clob_tokens)) {
        clobTokenIds = market.clob_tokens.map((t: any) => t?.id).filter(Boolean)
      }

      const primaryToken = clobTokenIds[0]
      console.log('[Orderbook API] Resolved clobTokenIds count:', clobTokenIds.length, 'primaryToken:', primaryToken ? String(primaryToken).slice(0, 16) + '…' : null)
      if (!primaryToken) {
        // No token for this market – return empty book
        return NextResponse.json({ bids: [], asks: [] })
      }

      const response = await fetch(`${POLYMARKET_CLOB_API}/book?token_id=${primaryToken}`, {
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      })

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({ bids: [], asks: [] })
        }
        throw new Error(`Polymarket CLOB API error: ${response.status}`)
      }

      const data = await response.json()
      // IMPORTANT: Polymarket CLOB API returns bids/asks in REVERSE order - reverse them
      const bids = Array.isArray(data.bids) ? [...data.bids].reverse() : []
      const asks = Array.isArray(data.asks) ? [...data.asks].reverse() : []
      return NextResponse.json({
        bids: bids,
        asks: asks,
      })
    }

    return NextResponse.json(
      { error: 'Missing tokenId, tokenIds, slug, or marketId parameter' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Orderbook fetch error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch orderbook' }, { status: 500 })
  }
}

