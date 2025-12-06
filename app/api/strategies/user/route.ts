'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:8081'

/**
 * GET /api/strategies/user?address=... - Get strategies for a specific user
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')

  if (!address) {
    return NextResponse.json(
      { success: false, error: 'Missing address parameter' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(
      `${WS_SERVICE_URL}/api/strategies/user?address=${encodeURIComponent(address)}`,
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
    console.error('Error fetching user strategies:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch user strategies'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
