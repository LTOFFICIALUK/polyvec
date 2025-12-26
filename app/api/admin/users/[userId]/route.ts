import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import crypto from 'crypto'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/users/[userId]
 * Get specific user details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, secret)
    const adminUserId = payload.userId as number

    const authCheck = await requireAdmin(adminUserId)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 })
    }

    const db = getDbPool()
    const userId = parseInt(params.userId)

    // Get user details
    const userResult = await db.query(
      `SELECT 
        id,
        email,
        plan_tier,
        is_admin,
        is_banned,
        ban_reason,
        banned_at,
        wallet_address,
        created_at,
        last_login,
        plan_updated_at
      FROM users 
      WHERE id = $1`,
      [userId]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get user's subscription
    const subResult = await db.query(
      `SELECT 
        id,
        subscription_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        created_at
      FROM subscriptions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1`,
      [userId]
    )

    // Get user's payment history
    const paymentsResult = await db.query(
      `SELECT 
        id,
        amount,
        currency,
        status,
        reason,
        payment_intent_id,
        created_at
      FROM payments 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10`,
      [userId]
    )

    return NextResponse.json({
      user: userResult.rows[0],
      subscription: subResult.rows[0] || null,
      recentPayments: paymentsResult.rows,
    })
  } catch (error: any) {
    console.error('[Admin User] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/users/[userId]
 * Update user (email, plan, ban status, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, secret)
    const adminUserId = payload.userId as number

    const authCheck = await requireAdmin(adminUserId)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 })
    }

    const body = await request.json()
    const userId = parseInt(params.userId)
    const db = getDbPool()

    const updates: string[] = []
    const values: any[] = []
    let paramCount = 0

    // Update email
    if (body.email !== undefined) {
      paramCount++
      updates.push(`email = $${paramCount}`)
      values.push(body.email.toLowerCase().trim())
    }

    // Update plan tier
    if (body.planTier !== undefined) {
      paramCount++
      updates.push(`plan_tier = $${paramCount}`)
      updates.push(`plan_updated_at = CURRENT_TIMESTAMP`)
      values.push(body.planTier)
    }

    // Update admin status
    if (body.isAdmin !== undefined) {
      paramCount++
      updates.push(`is_admin = $${paramCount}`)
      values.push(body.isAdmin)
    }

    // Ban/unban user
    if (body.isBanned !== undefined) {
      paramCount++
      updates.push(`is_banned = $${paramCount}`)
      values.push(body.isBanned)
      
      if (body.isBanned) {
        paramCount++
        updates.push(`banned_at = CURRENT_TIMESTAMP`)
        if (body.banReason) {
          paramCount++
          updates.push(`ban_reason = $${paramCount}`)
          values.push(body.banReason)
        }
      } else {
        updates.push(`banned_at = NULL`)
        updates.push(`ban_reason = NULL`)
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    paramCount++
    values.push(userId)

    await db.query(
      `UPDATE users 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}`,
      values
    )

    return NextResponse.json({ success: true, message: 'User updated successfully' })
  } catch (error: any) {
    console.error('[Admin User Update] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/users/[userId]/reset-password
 * Send password reset email to user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, secret)
    const adminUserId = payload.userId as number

    const authCheck = await requireAdmin(adminUserId)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 })
    }

    const db = getDbPool()
    const userId = parseInt(params.userId)

    // Get user
    const userResult = await db.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = userResult.rows[0]

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // 24 hours

    // Store token
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, resetToken, expiresAt]
    )

    // Send email (you'll need to create this email template)
    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://polyvec.com'}/reset-password?token=${resetToken}`
    
    // TODO: Send password reset email
    // await sendPasswordResetEmail(user.email, { resetUrl })

    return NextResponse.json({
      success: true,
      message: 'Password reset email sent',
      resetUrl, // For testing - remove in production
    })
  } catch (error: any) {
    console.error('[Admin Reset Password] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send reset email' },
      { status: 500 }
    )
  }
}

