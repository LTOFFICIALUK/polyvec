'use server'

import { NextResponse } from 'next/server'

const WEBSOCKET_SERVER_HTTP_URL = process.env.WEBSOCKET_SERVER_HTTP_URL || 
  (process.env.WEBSOCKET_SERVER_URL 
    ? process.env.WEBSOCKET_SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://')
    : 'http://206.189.70.100:8081')

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const asset = searchParams.get('asset') || 'BTC'
    const timeframe = searchParams.get('timeframe') || '15m'
    const indicatorType = searchParams.get('indicatorType')
    const startTime = searchParams.get('startTime')
    const endTime = searchParams.get('endTime')
    
    const url = `${WEBSOCKET_SERVER_HTTP_URL}/api/admin/indicators?asset=${asset}&timeframe=${timeframe}${indicatorType ? `&indicatorType=${indicatorType}` : ''}${startTime ? `&startTime=${startTime}` : ''}${endTime ? `&endTime=${endTime}` : ''}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Failed to fetch indicators: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[admin/indicators] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch indicators' },
      { status: 500 }
    )
  }
}
