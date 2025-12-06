'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

/**
 * GET /api/strategies - Get all strategies (for browsing)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') || '50'
  const offset = searchParams.get('offset') || '0'

  try {
    const response = await fetch(
      `${WS_SERVICE_URL}/api/strategies?limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Error fetching strategies:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch strategies'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/strategies - Create a new strategy
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()

    const response = await fetch(`${WS_SERVICE_URL}/api/strategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating strategy:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create strategy'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
