import { NextRequest, NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pair, timeframe } = body

    if (!pair || !timeframe) {
      return NextResponse.json(
        { error: 'Missing pair or timeframe' },
        { status: 400 }
      )
    }

    const response = await fetch(`${WS_SERVICE_URL}/markets/debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pair, timeframe }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `WebSocket service error: ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching debug markets:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch debug markets' },
      { status: 500 }
    )
  }
}

