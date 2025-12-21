import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { ethers } from 'ethers'
import { getDbPool } from '@/lib/db'
import { decryptPrivateKey } from '@/lib/wallet-vault'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC.e (Bridged)
const USDC_DECIMALS = 6
const POL_DECIMALS = 18

// ERC20 ABI for transfer function
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]

/**
 * POST /api/user/withdraw
 * Withdraws USDC.e or POL from custodial wallet to recipient address
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
    const { tokenType, amount, recipientAddress } = body

    // Validation
    if (!tokenType || !amount || !recipientAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: tokenType, amount, recipientAddress' },
        { status: 400 }
      )
    }

    if (tokenType !== 'USDC' && tokenType !== 'POL') {
      return NextResponse.json(
        { error: 'Invalid tokenType. Must be "USDC" or "POL"' },
        { status: 400 }
      )
    }

    // Validate recipient address
    try {
      ethers.getAddress(recipientAddress)
    } catch {
      return NextResponse.json(
        { error: 'Invalid recipient address format' },
        { status: 400 }
      )
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive number' },
        { status: 400 }
      )
    }

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

    // Get current balance
    const balanceResult = await db.query(
      `SELECT usdc_balance, pol_balance FROM user_balances WHERE user_id = $1`,
      [userId]
    )

    if (balanceResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Balance record not found' },
        { status: 404 }
      )
    }

    const currentUsdcBalance = parseFloat(balanceResult.rows[0].usdc_balance || '0')
    const currentPolBalance = parseFloat(balanceResult.rows[0].pol_balance || '0')

    // Check sufficient balance
    if (tokenType === 'USDC' && amountNum > currentUsdcBalance) {
      return NextResponse.json(
        { error: 'Insufficient USDC.e balance' },
        { status: 400 }
      )
    }

    if (tokenType === 'POL' && amountNum > currentPolBalance) {
      return NextResponse.json(
        { error: 'Insufficient POL balance' },
        { status: 400 }
      )
    }

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

    let txHash: string

    if (tokenType === 'POL') {
      // Native POL transfer
      const amountWei = ethers.parseEther(amountNum.toString())
      const tx = await wallet.sendTransaction({
        to: recipientAddress,
        value: amountWei,
      })
      txHash = tx.hash
    } else {
      // USDC.e token transfer
      const tokenContract = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, wallet)
      const amountUnits = ethers.parseUnits(amountNum.toString(), USDC_DECIMALS)
      const tx = await tokenContract.transfer(recipientAddress, amountUnits)
      txHash = tx.hash
    }

    // Wait for transaction confirmation (1 block)
    const receipt = await provider.waitForTransaction(txHash, 1)

    if (!receipt || receipt.status !== 1) {
      return NextResponse.json(
        { error: 'Transaction failed' },
        { status: 500 }
      )
    }

    // Update balances in database
    if (tokenType === 'USDC') {
      await db.query(
        `UPDATE user_balances 
         SET usdc_balance = usdc_balance - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [amountNum, userId]
      )
    } else {
      await db.query(
        `UPDATE user_balances 
         SET pol_balance = pol_balance - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [amountNum, userId]
      )
    }

    return NextResponse.json({
      success: true,
      txHash,
      tokenType,
      amount: amountNum,
      recipientAddress,
    })
  } catch (error: any) {
    console.error('[Withdraw] Error:', error)
    
    // Handle specific errors
    if (error.message?.includes('insufficient funds')) {
      return NextResponse.json(
        { error: 'Insufficient balance for withdrawal (including gas fees)' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process withdrawal' },
      { status: 500 }
    )
  }
}

