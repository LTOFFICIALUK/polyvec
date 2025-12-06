'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/strategies/[id]/trades - Get trades for a strategy
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') || '100'
  const offset = searchParams.get('offset') || '0'

  try {
    const response = await fetch(
      `${WS_SERVICE_URL}/api/strategies/${id}/trades?limit=${limit}&offset=${offset}`,
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
    console.error('Error fetching strategy trades:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch trades'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/strategies/[id]/trades - Record a new trade for a strategy
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params

  try {
    const body = await req.json()

    const response = await fetch(`${WS_SERVICE_URL}/api/strategies/${id}/trades`, {
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
    console.error('Error recording trade:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to record trade'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
