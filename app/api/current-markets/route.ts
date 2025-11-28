'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const pair = searchParams.get('pair') // BTC, SOL, ETH, XRP
  const timeframe = searchParams.get('timeframe') // 15m, 1h

  try {
    // Fetch current markets from WebSocket service
    const response = await fetch(`${WS_SERVICE_URL}/markets/current`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pair, timeframe }),
      cache: 'no-store',
    })

    if (!response.ok) {
      // If it's a 404 or other error, return null market data instead of throwing
      if (response.status === 404) {
        return NextResponse.json({
          marketId: null,
          question: null,
          tokenId: null,
          bestBid: null,
          bestAsk: null,
          lastPrice: null,
          startTime: null,
          endTime: null,
          eventTimeframe: null,
          error: 'No active market found'
        })
      }
      throw new Error(`WebSocket service error: ${response.status}`)
    }

    const data = await response.json()
    // Return the data even if marketId is null (no market found)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching current markets:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch current markets' },
      { status: 500 }
    )
  }
}

