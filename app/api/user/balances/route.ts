import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const POLYGON_RPC = 'https://polygon-rpc.com'
const BALANCE_OF_SELECTOR = '0x70a08231'

async function getTokenBalance(rpcUrl: string, tokenContract: string, walletAddress: string): Promise<number> {
  try {
    const addressPadded = walletAddress.slice(2).toLowerCase().padStart(64, '0')
    const callData = BALANCE_OF_SELECTOR + addressPadded
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: tokenContract,
          data: callData,
        }, 'latest'],
        id: 1,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.result && data.result !== '0x') {
        const balanceWei = BigInt(data.result)
        return Number(balanceWei) / 1e6 // USDC has 6 decimals
      }
    }
  } catch (e) {
    console.error(`Token balance fetch failed:`, e)
  }
  return 0
}

async function getNativeBalance(rpcUrl: string, walletAddress: string): Promise<number> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
        id: 1,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.result) {
        const balanceWei = BigInt(data.result)
        return Number(balanceWei) / 1e18 // POL has 18 decimals
      }
    }
  } catch (e) {
    console.error('Native balance fetch failed:', e)
  }
  return 0
}

/**
 * GET /api/user/balances?sync=true
 * Get the user's USDC.e and POL balances
 * If sync=true, fetches from blockchain and updates database
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

    // Verify token
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const db = getDbPool()
    const { searchParams } = new URL(request.url)
    const shouldSync = searchParams.get('sync') === 'true'
    
    // Get wallet address
    const walletResult = await db.query(
      'SELECT wallet_address FROM users WHERE id = $1',
      [userId]
    )

    if (walletResult.rows.length === 0 || !walletResult.rows[0].wallet_address) {
      return NextResponse.json({
        usdc_balance: '0',
        pol_balance: '0',
        wallet_address: null,
      })
    }

    const walletAddress = walletResult.rows[0].wallet_address.toLowerCase()

    // If sync requested, fetch from blockchain and update database
    if (shouldSync) {
      try {
        const [usdcBalance, polBalance] = await Promise.all([
          getTokenBalance(POLYGON_RPC, USDC_E, walletAddress),
          getNativeBalance(POLYGON_RPC, walletAddress),
        ])

        // Update or insert balance record
        await db.query(
          `INSERT INTO user_balances (user_id, wallet_address, usdc_balance, pol_balance)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, wallet_address)
           DO UPDATE SET 
             usdc_balance = $3,
             pol_balance = $4,
             updated_at = CURRENT_TIMESTAMP`,
          [userId, walletAddress, usdcBalance.toString(), polBalance.toString()]
        )

        return NextResponse.json({
          usdc_balance: usdcBalance.toString(),
          pol_balance: polBalance.toString(),
          wallet_address: walletAddress,
        })
      } catch (syncError: any) {
        console.error('[Balances API] Sync error:', syncError)
        // Fall through to return database values
      }
    }
    
    // Get balances from database
    const balanceResult = await db.query(
      `SELECT usdc_balance, pol_balance, wallet_address 
       FROM user_balances 
       WHERE user_id = $1`,
      [userId]
    )

    if (balanceResult.rows.length === 0) {
      return NextResponse.json({
        usdc_balance: '0',
        pol_balance: '0',
        wallet_address: walletAddress,
      })
    }

    const balance = balanceResult.rows[0]

    return NextResponse.json({
      usdc_balance: balance.usdc_balance.toString(),
      pol_balance: balance.pol_balance.toString(),
      wallet_address: balance.wallet_address,
    })
  } catch (error: any) {
    console.error('[Balances API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get balances' },
      { status: 500 }
    )
  }
}

