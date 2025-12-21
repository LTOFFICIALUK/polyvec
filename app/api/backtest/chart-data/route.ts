'use server'

import { NextResponse } from 'next/server'

const WEBSOCKET_SERVER_HTTP_URL = process.env.WEBSOCKET_SERVER_HTTP_URL || 
  (process.env.WEBSOCKET_SERVER_URL 
    ? process.env.WEBSOCKET_SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://')
    : 'http://localhost:8081')

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { asset, timeframe, direction, indicatorType, indicatorParameters, marketIds } = body

    if (!asset || !timeframe) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: asset and timeframe' },
        { status: 400 }
      )
    }

    const url = `${WEBSOCKET_SERVER_HTTP_URL}/api/backtest/chart-data`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset,
        timeframe,
        direction,
        indicatorType,
        indicatorParameters,
        marketIds,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to fetch chart data' }))
      return NextResponse.json(
        { success: false, error: errorData.error || 'Failed to fetch chart data' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[backtest/chart-data] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

