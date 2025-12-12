'use server'

import { NextResponse } from 'next/server'

const WEBSOCKET_SERVER_HTTP_URL = process.env.WEBSOCKET_SERVER_HTTP_URL || 
  (process.env.WEBSOCKET_SERVER_URL 
    ? process.env.WEBSOCKET_SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://')
    : 'http://localhost:8081')

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { strategyId, strategy, marketId, startTime, endTime, initialBalance } = body

    console.log(`[backtest] Request: strategyId=${strategyId} marketId=${marketId}`)

    if (!strategyId && !strategy) {
      return NextResponse.json(
        { error: 'Missing required parameter: strategyId or strategy' },
        { status: 400 }
      )
    }

    const url = `${WEBSOCKET_SERVER_HTTP_URL}/api/backtest`
    console.log(`[backtest] Posting to: ${url}`)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId,
        strategy,
        marketId,
        startTime,
        endTime,
        initialBalance,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[backtest] ws-service error: ${response.status} - ${errorText}`)
      return NextResponse.json(
        { error: `Backtest service error: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[backtest] Response: success=${data.success}`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[backtest] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to run backtest' },
      { status: 500 }
    )
  }
}

// Quick profitability check
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const strategyId = searchParams.get('strategyId')
  const marketId = searchParams.get('marketId')
  const lookbackDays = searchParams.get('lookbackDays') || '7'

  if (!strategyId) {
    return NextResponse.json(
      { error: 'Missing required parameter: strategyId' },
      { status: 400 }
    )
  }

  try {
    const url = `${WEBSOCKET_SERVER_HTTP_URL}/api/backtest/quick`
    console.log(`[backtest/quick] Posting to: ${url}`)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId,
        marketId,
        lookbackDays: parseInt(lookbackDays, 10),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[backtest/quick] ws-service error: ${response.status} - ${errorText}`)
      return NextResponse.json(
        { error: `Backtest service error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[backtest/quick] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check profitability' },
      { status: 500 }
    )
  }
}
