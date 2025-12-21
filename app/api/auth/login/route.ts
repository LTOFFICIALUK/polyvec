import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail, comparePassword, updateLastLogin } from '@/lib/auth'
import { SignJWT } from 'jose'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Get user from database
    const user = await getUserByEmail(email)
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Verify password
    const isValid = await comparePassword(password, user.password_hash)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Update last login
    await updateLastLogin(user.id)

    // Create JWT token
    const token = await new SignJWT({ userId: user.id, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    // Create response with token in cookie
    const response = NextResponse.json(
      { 
        success: true,
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          last_login: user.last_login
        }
      },
      { status: 200 }
    )

    // Set HTTP-only cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    return response
  } catch (error: any) {
    console.error('[Login] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to login' },
      { status: 500 }
    )
  }
}
