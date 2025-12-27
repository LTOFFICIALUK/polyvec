import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { ethers } from 'ethers'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a'
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

const ERC1155_ABI = [
  'function isApprovedForAll(address account, address operator) view returns (bool)',
]

/**
 * GET /api/user/allowance
 * Get USDC allowance and conditional token approval status for custodial wallet
 */
export async function GET(request: NextRequest) {
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

    // Get user's custodial wallet address
    const db = getDbPool()
    const walletResult = await db.query(
      'SELECT wallet_address FROM users WHERE id = $1',
      [userId]
    )

    if (walletResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const walletAddress = walletResult.rows[0].wallet_address
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Custodial wallet not found' },
        { status: 404 }
      )
    }

    // Create provider
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    const usdcContract = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, provider)
    const conditionalTokensContract = new ethers.Contract(CONDITIONAL_TOKENS, ERC1155_ABI, provider)

    // Check balances and allowances with timeout
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('RPC call timeout')), 10000)
    )
    
    const results = await Promise.race([
      Promise.all([
      usdcContract.balanceOf(walletAddress),
      usdcContract.allowance(walletAddress, CTF_EXCHANGE),
      usdcContract.allowance(walletAddress, NEG_RISK_CTF_EXCHANGE),
      conditionalTokensContract.isApprovedForAll(walletAddress, CTF_EXCHANGE),
      conditionalTokensContract.isApprovedForAll(walletAddress, NEG_RISK_CTF_EXCHANGE),
      ]),
      timeoutPromise
    ])
    
    const [usdcBalance, regularAllowance, negRiskAllowance, ctfApproved, negRiskApproved] = results

    const balanceNum = Number(ethers.formatUnits(usdcBalance, 6))
    const regularAllowanceNum = Number(ethers.formatUnits(regularAllowance, 6))
    const negRiskAllowanceNum = Number(ethers.formatUnits(negRiskAllowance, 6))

    return NextResponse.json({
      success: true,
      allowance: {
        usdce: {
          balance: balanceNum,
          allowance: regularAllowanceNum,
          needsApproval: regularAllowanceNum < balanceNum,
        },
        nativeUsdc: {
          balance: 0,
          allowance: 0,
          needsApproval: false,
        },
        needsAnyApproval: regularAllowanceNum < balanceNum || negRiskAllowanceNum < balanceNum,
        hasAnyBalance: balanceNum > 0,
      },
      conditionalTokens: {
        ctfApproved,
        negRiskApproved,
        needsApproval: !ctfApproved || !negRiskApproved,
      },
    })
  } catch (error: any) {
    console.error('[Allowance API] Error:', error)
    // Log more details for debugging
    if (error.code) {
      console.error('[Allowance API] Error code:', error.code)
    }
    if (error.message?.includes('timeout')) {
      return NextResponse.json(
        { error: 'Blockchain RPC timeout. Please try again.' },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { error: error.message || 'Failed to check allowance' },
      { status: 500 }
    )
  }
}

