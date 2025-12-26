import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/lib/db'
import { jwtVerify } from 'jose'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * POST /api/analytics/track
 * Track a page view (public endpoint - no auth required)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pagePath, timeOnPage } = body

    if (!pagePath) {
      return NextResponse.json({ error: 'pagePath is required' }, { status: 400 })
    }

    // Get user ID if authenticated (optional)
    let userId: number | null = null
    const token = request.cookies.get('auth-token')?.value
    if (token) {
      try {
        const { payload } = await jwtVerify(token, secret)
        userId = payload.userId as number
      } catch {
        // Invalid token, continue without user ID
      }
    }

    const db = getDbPool()
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const referrer = request.headers.get('referer') || null

    // Generate session ID (simple approach - could be improved)
    const sessionId = request.cookies.get('session-id')?.value || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`

    await db.query(
      `INSERT INTO page_analytics (
        page_path,
        user_id,
        session_id,
        ip_address,
        user_agent,
        referrer,
        time_on_page
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [pagePath, userId, sessionId, ipAddress, userAgent, referrer, timeOnPage || null]
    )

    // Set session cookie if not exists
    const response = NextResponse.json({ success: true })
    if (!request.cookies.get('session-id')) {
      response.cookies.set('session-id', sessionId, {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        httpOnly: false, // Needs to be accessible from client
        sameSite: 'lax',
      })
    }

    return response
  } catch (error: any) {
    console.error('[Page Analytics] Error:', error)
    // Don't fail the request if analytics fails
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

