import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { ethers } from 'ethers'
import { getDbPool } from '@/lib/db'
import { decryptPrivateKey } from '@/lib/wallet-vault'
import { closePosition } from '@/lib/redeem-positions'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'

export const dynamic = 'force-dynamic'

/**
 * POST /api/user/close-position
 * Closes a losing position using the user's custodial wallet
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

    // Verify token
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const body = await request.json()
    const { conditionId } = body

    if (!conditionId) {
      return NextResponse.json(
        { error: 'Missing required field: conditionId' },
        { status: 400 }
      )
    }

    // Get user's custodial wallet
    const db = getDbPool()
    const walletResult = await db.query(
      `SELECT wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt
       FROM users 
       WHERE id = $1`,
      [userId]
    )

    if (walletResult.rows.length === 0 || !walletResult.rows[0].wallet_address) {
      return NextResponse.json(
        { error: 'Custodial wallet not found' },
        { status: 404 }
      )
    }

    const walletData = walletResult.rows[0]
    const walletAddress = walletData.wallet_address

    // Decrypt private key
    let privateKey: string
    try {
      const encryptedData = {
        ciphertext: walletData.encrypted_private_key,
        iv: walletData.key_iv,
        authTag: walletData.key_auth_tag,
        salt: walletData.key_salt,
      }
      privateKey = decryptPrivateKey(encryptedData, walletAddress)
    } catch (decryptError: any) {
      console.error('[Close Position] Failed to decrypt private key:', decryptError)
      return NextResponse.json(
        { error: 'Failed to decrypt wallet. Please contact support.' },
        { status: 500 }
      )
    }

    // Create wallet and provider
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    const wallet = new ethers.Wallet(privateKey, provider)

    // Verify wallet address matches
    if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Wallet address mismatch' },
        { status: 500 }
      )
    }

    // Create a provider wrapper that provides the wallet as signer
    const providerWrapper = {
      getSigner: async () => wallet,
      provider: provider,
    } as any

    // Close the position (redeems all outcomes)
    const txHash = await closePosition(
      providerWrapper,
      conditionId
    )

    return NextResponse.json({
      success: true,
      txHash,
      message: 'Position closed successfully',
    })
  } catch (error: any) {
    console.error('[Close Position] Error:', error)
    
    // Provide user-friendly error messages
    if (error.message?.includes('not yet resolved') || error.message?.includes('condition not resolved')) {
      return NextResponse.json(
        { error: 'Market not yet resolved on-chain. Please wait for the oracle to settle the market.' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to close position' },
      { status: 500 }
    )
  }
}

