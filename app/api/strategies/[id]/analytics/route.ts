'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/strategies/[id]/analytics - Get strategy analytics
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params

  try {
    const response = await fetch(`${WS_SERVICE_URL}/api/strategies/${id}/analytics`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Error fetching strategy analytics:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch analytics'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
