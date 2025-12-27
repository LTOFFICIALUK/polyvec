/**
 * Admin authentication utilities
 * Checks if a user has admin privileges
 */

import { getDbPool } from './db'

export interface AdminUser {
  id: number
  email: string
  is_admin: boolean
  is_banned: boolean
}

/**
 * Check if a user is an admin
 * Checks the is_admin column in the database
 */
export const isAdmin = async (userId: number): Promise<boolean> => {
  try {
    const db = getDbPool()
    const result = await db.query(
      'SELECT is_admin FROM users WHERE id = $1 AND is_active = TRUE AND is_banned = FALSE',
      [userId]
    )

    if (result.rows.length === 0) {
      return false
    }

    return result.rows[0].is_admin === true
  } catch (error) {
    console.error('[Admin Auth] Error checking admin status:', error)
    return false
  }
}

/**
 * Get admin user details
 */
export const getAdminUser = async (userId: number): Promise<AdminUser | null> => {
  try {
    const db = getDbPool()
    const result = await db.query(
      'SELECT id, email, is_admin, is_banned FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return {
      id: result.rows[0].id,
      email: result.rows[0].email,
      is_admin: result.rows[0].is_admin === true,
      is_banned: result.rows[0].is_banned === true,
    }
  } catch (error) {
    console.error('[Admin Auth] Error getting admin user:', error)
    return null
  }
}

/**
 * Require admin middleware helper
 * Use this in API routes to ensure only admins can access
 */
export const requireAdmin = async (userId: number): Promise<{ authorized: boolean; error?: string }> => {
  const adminStatus = await isAdmin(userId)
  
  if (!adminStatus) {
    return {
      authorized: false,
      error: 'Admin access required',
    }
  }

  return { authorized: true }
}

/**
 * Check admin access from NextRequest
 * Extracts userId from JWT token and verifies admin status
 */
export const checkAdminAccess = async (request: Request | { cookies: { get: (name: string) => { value: string } | undefined } }): Promise<{ isAdmin: boolean; userId?: number }> => {
  try {
    const { jwtVerify } = await import('jose')
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    )

    // Handle both NextRequest (with cookies.get) and regular Request
    let token: string | undefined
    if ('cookies' in request && typeof request.cookies.get === 'function') {
      // NextRequest
      token = request.cookies.get('auth-token')?.value
    } else if (request instanceof Request) {
      // Regular Request
      token = request.headers.get('cookie')
        ?.split(';')
        .find((c) => c.trim().startsWith('auth-token='))
        ?.split('=')[1]
    }

    if (!token) {
      return { isAdmin: false }
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    if (!userId) {
      return { isAdmin: false }
    }

    const adminStatus = await isAdmin(userId)
    return { isAdmin: adminStatus, userId }
  } catch (error) {
    console.error('[Admin Auth] Error checking admin access:', error)
    return { isAdmin: false }
  }
}

