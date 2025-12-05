'use server'

import { NextResponse } from 'next/server'

const WEBSOCKET_SERVER_HTTP_URL = process.env.WEBSOCKET_SERVER_HTTP_URL || 
  (process.env.WEBSOCKET_SERVER_URL 
    ? process.env.WEBSOCKET_SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://')
    : 'http://localhost:8081')

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const marketId = searchParams.get('marketId')
  const yesTokenId = searchParams.get('yesTokenId')
  const noTokenId = searchParams.get('noTokenId')
  const startTime = searchParams.get('startTime')
  const endTime = searchParams.get('endTime')

  console.log(`[price-history] Request: marketId=${marketId} yesTokenId=${yesTokenId?.substring(0,12)}... wsUrl=${WEBSOCKET_SERVER_HTTP_URL}`)

  // We need either marketId OR both tokenIds
  if (!marketId && (!yesTokenId || !noTokenId)) {
    return NextResponse.json(
      { error: 'Missing required parameters: marketId OR (yesTokenId and noTokenId)' },
      { status: 400 }
    )
  }

  try {
    // Query Railway ws-service for price history
    const params = new URLSearchParams()
    if (marketId) params.append('marketId', marketId)
    if (yesTokenId) params.append('yesTokenId', yesTokenId)
    if (noTokenId) params.append('noTokenId', noTokenId)
    if (startTime) params.append('startTime', startTime)
    if (endTime) params.append('endTime', endTime)

    const url = `${WEBSOCKET_SERVER_HTTP_URL}/api/price-history?${params.toString()}`
    console.log(`[price-history] Fetching: ${url}`)
    
    const response = await fetch(url, {
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[price-history] ws-service error: ${response.status} - ${errorText}`)
      throw new Error(`Railway ws-service error: ${response.status}`)
    }

    const data = await response.json()
    console.log(`[price-history] Response: success=${data.success} count=${data.count}`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[price-history] Error fetching price history from Railway:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch price history' },
      { status: 500 }
    )
  }
}
