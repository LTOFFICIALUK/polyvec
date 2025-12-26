import { NextRequest, NextResponse } from 'next/server'
import { createUser, getUserByEmail, addToEmailList } from '@/lib/auth'
import { runMigrations } from '@/lib/db'
import { generateCustodialWallet, storeCustodialWallet } from '@/lib/wallet-generator'
import { authenticateWithPolymarket } from '@/lib/polymarket-auth-helper'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Ensure migrations are run
    await runMigrations()
    
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email)
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      )
    }

    // Create user
    const user = await createUser(email, password)

    // Generate and store custodial wallet
    const wallet = generateCustodialWallet()
    const walletResult = await storeCustodialWallet(user.id, wallet)
    
    if (!walletResult.success) {
      console.error('[Signup] Failed to create wallet:', walletResult.error)
      // User is created but wallet failed - this is a critical error
      // In production, you might want to rollback user creation or queue wallet creation
      return NextResponse.json(
        { error: 'Account created but failed to initialize wallet. Please contact support.' },
        { status: 500 }
      )
    }

    // Automatically subscribe to email list (non-blocking - don't fail signup if this fails)
    try {
      await addToEmailList(user.email, 'signup')
      console.log('[Signup] Successfully subscribed user to email list:', user.id)
    } catch (error: any) {
      console.error('[Signup] Error subscribing to email list (non-critical):', error)
      // Don't fail signup if email list subscription fails
    }

    // Automatically authenticate with Polymarket (non-blocking - don't fail signup if this fails)
    try {
      const authResult = await authenticateWithPolymarket(user.id, wallet.address)
      if (authResult.success) {
        console.log('[Signup] Successfully authenticated with Polymarket for user:', user.id)
      } else {
        console.log('[Signup] Polymarket authentication deferred:', authResult.error)
        // This is okay - the wallet might need to be used on Polymarket first
        // Credentials will be created automatically when the user tries to trade
      }
    } catch (error: any) {
      console.error('[Signup] Error during Polymarket authentication (non-critical):', error)
      // Don't fail signup if Polymarket auth fails - it can be done later
    }

    return NextResponse.json(
      { 
        success: true,
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          wallet_address: wallet.address, // Return wallet address to client
        }
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[Signup] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create account' },
      { status: 500 }
    )
  }
}
