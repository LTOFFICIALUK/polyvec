'use server'

import { NextRequest, NextResponse } from 'next/server'
import { getDbPool, runMigrations } from '@/lib/db'
import { verifyAuth } from '@/lib/auth'

// GET profile data by wallet address
export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const { address } = params
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }

    // Ensure migrations are run
    await runMigrations()
    
    const db = getDbPool()
    const result = await db.query(
      `SELECT 
        id,
        username,
        profile_picture_url,
        wallet_address,
        profile_updated_at
      FROM users 
      WHERE wallet_address = $1 
      LIMIT 1`,
      [address.toLowerCase()]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({
        username: null,
        profilePictureUrl: null,
        walletAddress: address,
      })
    }

    const user = result.rows[0]
    return NextResponse.json({
      username: user.username || null,
      profilePictureUrl: user.profile_picture_url || null,
      walletAddress: user.wallet_address || address,
      profileUpdatedAt: user.profile_updated_at || null,
    })
  } catch (error: any) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

// PATCH update profile data (requires authentication)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request)
    if (!authResult.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { address } = params
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      )
    }

    // Ensure migrations are run
    await runMigrations()
    
    // Verify the user owns this wallet address
    const db = getDbPool()
    const userCheck = await db.query(
      `SELECT id, wallet_address FROM users WHERE id = $1`,
      [authResult.user.id]
    )

    if (userCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const userWallet = userCheck.rows[0].wallet_address
    if (!userWallet || userWallet.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        { error: 'You can only update your own profile' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { username, profilePictureUrl } = body

    // Validate username if provided
    if (username !== undefined) {
      if (username && (username.length < 3 || username.length > 50)) {
        return NextResponse.json(
          { error: 'Username must be between 3 and 50 characters' },
          { status: 400 }
        )
      }
      if (username && !username.match(/^[a-zA-Z0-9_-]+$/)) {
        return NextResponse.json(
          { error: 'Username can only contain letters, numbers, underscores, and hyphens' },
          { status: 400 }
        )
      }
    }

    // Validate profile picture URL if provided
    if (profilePictureUrl !== undefined && profilePictureUrl !== null) {
      if (profilePictureUrl && profilePictureUrl.length > 500) {
        return NextResponse.json(
          { error: 'Profile picture URL is too long' },
          { status: 400 }
        )
      }
      // Basic URL validation
      if (profilePictureUrl && !profilePictureUrl.match(/^https?:\/\/.+/)) {
        return NextResponse.json(
          { error: 'Invalid profile picture URL' },
          { status: 400 }
        )
      }
    }

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (username !== undefined) {
      updates.push(`username = $${paramIndex}`)
      values.push(username || null)
      paramIndex++
    }

    if (profilePictureUrl !== undefined) {
      updates.push(`profile_picture_url = $${paramIndex}`)
      values.push(profilePictureUrl || null)
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // Add profile_updated_at
    updates.push(`profile_updated_at = CURRENT_TIMESTAMP`)
    values.push(authResult.user.id)

    const updateQuery = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING username, profile_picture_url, profile_updated_at
    `

    const result = await db.query(updateQuery, values)

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      username: result.rows[0].username || null,
      profilePictureUrl: result.rows[0].profile_picture_url || null,
      profileUpdatedAt: result.rows[0].profile_updated_at,
    })
  } catch (error: any) {
    // Handle unique constraint violation for username
    if (error.code === '23505' && error.constraint?.includes('username')) {
      return NextResponse.json(
        { error: 'Username is already taken' },
        { status: 409 }
      )
    }

    console.error('Error updating profile:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}

