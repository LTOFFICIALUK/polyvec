'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://206.189.70.100:3001'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol') || 'btcusdt'
  const timeframe = searchParams.get('timeframe') || '15m'
  const count = searchParams.get('count') || '100'

  try {
    const response = await fetch(
      `${WS_SERVICE_URL}/api/crypto/candles?symbol=${symbol}&timeframe=${timeframe}&count=${count}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }
    )

    if (!response.ok) {
      throw new Error(`WS Service error: ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Crypto candles fetch error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch crypto candles' },
      { status: 500 }
    )
  }
}

