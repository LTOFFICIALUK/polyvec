import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const WS_SERVICE_URL = process.env.WS_SERVICE_URL || process.env.NEXT_PUBLIC_WEBSOCKET_SERVER_URL?.replace('ws://', 'http://').replace('wss://', 'https://') || 'http://localhost:8081'

/**
 * POST /api/trade/sign-order-vps
 * Proxies signing request to VPS (secure - keys never leave VPS)
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Verify token and get userId
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const body = await request.json()
    const {
      tokenId,
      side,
      price,
      size,
      negRisk = false,
    } = body

    if (!tokenId || price === undefined || size === undefined || side === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: tokenId, side, price, size' },
        { status: 400 }
      )
    }

    // Call VPS to sign the order (keys stay on VPS)
    const vpsResponse = await fetch(`${WS_SERVICE_URL}/api/trade/sign-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        tokenId,
        side,
        price,
        size,
        negRisk,
      }),
    })

    if (!vpsResponse.ok) {
      const errorData = await vpsResponse.json().catch(() => ({ error: 'VPS request failed' }))
      return NextResponse.json(
        { error: errorData.error || 'Failed to sign order on VPS' },
        { status: vpsResponse.status }
      )
    }

    const vpsData = await vpsResponse.json()
    return NextResponse.json(vpsData)
  } catch (error: any) {
    console.error('[Sign Order VPS Proxy] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sign order' },
      { status: 500 }
    )
  }
}

