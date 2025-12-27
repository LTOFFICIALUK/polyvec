import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { ethers } from 'ethers'
import { getDbPool } from '@/lib/db'
import { decryptPrivateKey } from '@/lib/wallet-vault'
import { getPlatformFeeWallet, calculatePlatformFee } from '@/lib/trade-fees'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC.e (Bridged)
const USDC_DECIMALS = 6

// ERC20 ABI for transfer
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
]

/**
 * POST /api/trade/collect-fee
 * Collects platform fee from user's wallet after successful trade
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

    const body = await request.json()
    const { tradeAmount, orderId, tokenId, side, shares, price } = body

    if (!tradeAmount || tradeAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid trade amount' },
        { status: 400 }
      )
    }

    // Get platform fee wallet
    const platformFeeWallet = getPlatformFeeWallet()
    if (!platformFeeWallet) {
      return NextResponse.json(
        { error: 'Platform fee wallet not configured' },
        { status: 500 }
      )
    }

    // Calculate fee
    const fee = calculatePlatformFee(tradeAmount)

    // Get user's custodial wallet
    const db = getDbPool()
    const walletResult = await db.query(
      'SELECT wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt FROM users WHERE id = $1',
      [userId]
    )

    if (walletResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const walletData = walletResult.rows[0]
    const walletAddress = walletData.wallet_address

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Custodial wallet not found' },
        { status: 404 }
      )
    }

    // Validate encrypted data
    if (!walletData.encrypted_private_key || !walletData.key_iv || !walletData.key_auth_tag || !walletData.key_salt) {
      return NextResponse.json(
        { error: 'Wallet encryption data is incomplete' },
        { status: 500 }
      )
    }

    // Decrypt private key
    let privateKey: string
    try {
      const encryptedData = {
        ciphertext: walletData.encrypted_private_key,
        iv: walletData.key_iv,
        authTag: walletData.key_auth_tag,
        salt: walletData.key_salt,
      }
      privateKey = decryptPrivateKey(encryptedData, walletAddress.toLowerCase())
    } catch (decryptError: any) {
      console.error('[Collect Fee] Decryption error:', decryptError)
      return NextResponse.json(
        { error: 'Failed to decrypt wallet' },
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

    // Check balance before transferring
    const usdcContract = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, wallet)
    const balance = await usdcContract.balanceOf(walletAddress)
    const balanceNum = Number(ethers.formatUnits(balance, USDC_DECIMALS))

    if (balanceNum < fee) {
      return NextResponse.json(
        {
          error: `Insufficient balance for fee. Need $${fee.toFixed(2)}, but only have $${balanceNum.toFixed(2)}`,
          errorCode: 'INSUFFICIENT_BALANCE_FOR_FEE',
        },
        { status: 400 }
      )
    }

    // Transfer fee to platform wallet
    const feeAmountUnits = ethers.parseUnits(fee.toFixed(6), USDC_DECIMALS)
    const tx = await usdcContract.transfer(platformFeeWallet, feeAmountUnits)
    const txHash = tx.hash

    // Wait for transaction confirmation (1 block)
    const receipt = await provider.waitForTransaction(txHash, 1)

    if (!receipt || receipt.status !== 1) {
      // Record failed fee collection
      try {
        await db.query(
          `INSERT INTO trading_fees (
            user_id, wallet_address, trade_amount, fee_amount, fee_rate,
            transaction_hash, order_id, token_id, side, shares, price, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            userId,
            walletAddress.toLowerCase(),
            tradeAmount,
            fee,
            0.025, // 2.5% fee rate
            txHash,
            orderId || null,
            tokenId || null,
            side || 'BUY',
            shares || null,
            price || null,
            'failed',
          ]
        )
      } catch (dbError) {
        console.error('[Collect Fee] Error recording failed fee:', dbError)
      }

      return NextResponse.json(
        { error: 'Fee transfer transaction failed' },
        { status: 500 }
      )
    }

    // Record successful fee collection in database
    try {
      await db.query(
        `INSERT INTO trading_fees (
          user_id, wallet_address, trade_amount, fee_amount, fee_rate,
          transaction_hash, order_id, token_id, side, shares, price, status, collected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
        [
          userId,
          walletAddress.toLowerCase(),
          tradeAmount,
          fee,
          0.025, // 2.5% fee rate
          txHash,
          orderId || null,
          tokenId || null,
          side || 'BUY',
          shares || null,
          price || null,
          'collected',
        ]
      )
    } catch (dbError) {
      console.error('[Collect Fee] Error recording fee to database:', dbError)
      // Don't fail the response if DB recording fails - fee was already collected
    }

    console.log('[Collect Fee] Fee collected successfully:', {
      userId,
      walletAddress: walletAddress.substring(0, 10) + '...',
      tradeAmount,
      fee,
      txHash,
    })

    return NextResponse.json({
      success: true,
      fee,
      txHash,
    })
  } catch (error: any) {
    console.error('[Collect Fee] Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to collect fee',
        errorCode: 'FEE_COLLECTION_ERROR',
      },
      { status: 500 }
    )
  }
}

