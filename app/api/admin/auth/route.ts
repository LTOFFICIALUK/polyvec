import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { isAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/auth
 * Check if current user is an admin
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.json(
        { isAdmin: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const adminStatus = await isAdmin(userId)

    if (!adminStatus) {
      return NextResponse.json(
        { isAdmin: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      isAdmin: true,
      userId,
    })
  } catch (error: any) {
    console.error('[Admin Auth] Error:', error)
    return NextResponse.json(
      { isAdmin: false, error: 'Invalid or expired token' },
      { status: 401 }
    )
  }
}

