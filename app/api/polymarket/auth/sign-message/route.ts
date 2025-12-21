import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { ethers } from 'ethers'
import { getDbPool } from '@/lib/db'
import { decryptPrivateKey } from '@/lib/wallet-vault'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_CHAIN_ID = 137
const AUTH_MESSAGE = 'Sign this message to authenticate with Polymarket'

/**
 * POST /api/polymarket/auth/sign-message
 * Signs Polymarket authentication message using custodial wallet private key
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

    // Get user's custodial wallet
    const db = getDbPool()
    const walletResult = await db.query(
      `SELECT wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt
       FROM users 
       WHERE id = $1 AND wallet_address IS NOT NULL`,
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
    const privateKey = decryptPrivateKey(
      {
        ciphertext: walletData.encrypted_private_key,
        iv: walletData.key_iv,
        authTag: walletData.key_auth_tag,
        salt: walletData.key_salt,
      },
      walletAddress
    )

    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey)

    // Verify wallet address matches
    if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Wallet address mismatch' },
        { status: 500 }
      )
    }

    // Generate timestamp and nonce
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = 0

    // Domain for EIP-712
    const domain = {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
    }

    // Types for EIP-712
    const types = {
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    }

    // Message to sign
    const value = {
      address: ethers.getAddress(walletAddress),
      timestamp: timestamp,
      nonce: nonce,
      message: AUTH_MESSAGE,
    }

    // Sign the message
    const signature = await wallet.signTypedData(domain, types, value)

    return NextResponse.json({
      address: ethers.getAddress(walletAddress),
      signature,
      timestamp,
      nonce,
    })
  } catch (error: any) {
    console.error('[Sign Auth Message] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sign authentication message' },
      { status: 500 }
    )
  }
}

