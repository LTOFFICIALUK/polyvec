import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { ethers } from 'ethers'
import { decryptPrivateKey } from '@/lib/wallet-vault'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a'

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]

/**
 * POST /api/user/approve-usdc
 * Approve USDC spending for both CTF_EXCHANGE and NEG_RISK_CTF_EXCHANGE
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
    let walletResult
    try {
      walletResult = await db.query(
        `SELECT wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt
         FROM users 
         WHERE id = $1`,
        [userId]
      )
    } catch (dbError: any) {
      console.error('[Approve USDC] Database query error:', dbError)
      if (dbError.message?.includes('connection slots') || dbError.message?.includes('too many clients')) {
        return NextResponse.json(
          { error: 'Database is busy. Please try again in a moment.' },
          { status: 503 }
        )
      }
      throw dbError
    }

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
      console.error('[Approve USDC] Failed to decrypt private key:', decryptError)
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

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, wallet)

    // Get current balance to approve max amount
    const balance = await usdcContract.balanceOf(walletAddress)
    const maxApproval = ethers.MaxUint256 // Approve max amount for convenience

    // Approve both exchanges
    console.log('[Approve USDC] Sending approval transactions...')
    const approvals = await Promise.all([
      usdcContract.approve(CTF_EXCHANGE, maxApproval),
      usdcContract.approve(NEG_RISK_CTF_EXCHANGE, maxApproval),
    ])

    console.log('[Approve USDC] Transactions sent:', {
      regular: approvals[0].hash,
      negRisk: approvals[1].hash,
    })

    // Return immediately with transaction hashes - don't wait for confirmation
    // The frontend will poll for allowance status
    return NextResponse.json({
      success: true,
      message: 'Approval transactions sent. Waiting for confirmation...',
      pending: true,
      transactions: {
        regular: {
          hash: approvals[0].hash,
          status: 'pending',
        },
        negRisk: {
          hash: approvals[1].hash,
          status: 'pending',
        },
      },
    })
  } catch (error: any) {
    console.error('[Approve USDC] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to approve USDC' },
      { status: 500 }
    )
  }
}

