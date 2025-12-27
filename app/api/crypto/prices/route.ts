'use server'

import { NextResponse } from 'next/server'

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://206.189.70.100:8081'

export async function GET(req: Request) {
  try {
    const response = await fetch(`${WS_SERVICE_URL}/api/crypto/prices`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`WS Service error: ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Crypto prices fetch error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch crypto prices' },
      { status: 500 }
    )
  }
}

