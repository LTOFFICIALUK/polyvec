'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/strategies/[id] - Get a specific strategy
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params

  try {
    const response = await fetch(`${WS_SERVICE_URL}/api/strategies/${id}`, {
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
    console.error('Error fetching strategy:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch strategy'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

/**
 * PUT /api/strategies/[id] - Update a strategy
 */
export async function PUT(req: Request, { params }: RouteParams) {
  const { id } = await params

  try {
    const body = await req.json()

    const response = await fetch(`${WS_SERVICE_URL}/api/strategies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Error updating strategy:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to update strategy'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

/**
 * DELETE /api/strategies/[id] - Delete a strategy
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  const { id } = await params

  try {
    const response = await fetch(`${WS_SERVICE_URL}/api/strategies/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      return NextResponse.json(error, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Error deleting strategy:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete strategy'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
