'use server'

import { NextResponse } from 'next/server'

// Use CLOB API for orderbook data (correct endpoint per Polymarket docs)
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tokenId = searchParams.get('tokenId')
  const tokenIds = searchParams.get('tokenIds') // Comma-separated list

  try {
    // Single token orderbook - use CLOB API
    if (tokenId) {
      const response = await fetch(`${POLYMARKET_CLOB_API}/book?token_id=${tokenId}`, {
        headers: {
          'Accept': 'application/json',
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
      return NextResponse.json({
        bids: data.bids || [],
        asks: data.asks || [],
      })
    }

    // Multiple token orderbooks - use CLOB batch API
    if (tokenIds) {
      const tokenArray = tokenIds.split(',').map((id) => id.trim())
      const response = await fetch(`${POLYMARKET_CLOB_API}/books`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(tokenArray.map(id => ({ token_id: id }))),
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Polymarket CLOB API error: ${response.status}`)
      }

      const data = await response.json()
      // CLOB batch API returns array of { asset_id, bids, asks }
      // For now, return the first one or combine them
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json({
          bids: data[0].bids || [],
          asks: data[0].asks || [],
        })
      }
      return NextResponse.json({ bids: [], asks: [] })
    }

    return NextResponse.json({ error: 'Missing tokenId or tokenIds parameter' }, { status: 400 })
  } catch (error: any) {
    console.error('Orderbook fetch error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch orderbook' }, { status: 500 })
  }
}

