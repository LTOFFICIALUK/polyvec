'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/strategies/[id]/analytics/recalculate - Recalculate strategy analytics
 */
export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params

  try {
    const response = await fetch(
      `${WS_SERVICE_URL}/api/strategies/${id}/analytics/recalculate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Error recalculating analytics:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to recalculate analytics'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
