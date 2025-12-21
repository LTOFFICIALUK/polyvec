import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { ethers } from 'ethers'
import { getDbPool } from '@/lib/db'
import { decryptPrivateKey } from '@/lib/wallet-vault'
import { OrderParams, OrderSide, SignatureType } from '@/lib/polymarket-order-signing'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_CHAIN_ID = 137
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
const NEG_RISK_CTF_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a'

/**
 * POST /api/trade/sign-order
 * Signs an order using the user's custodial wallet private key
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
    const {
      tokenId,
      side,
      price,
      size,
      negRisk = false,
    } = body

    if (!tokenId || price === undefined || size === undefined || side === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: tokenId, side, price, size' },
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

    // Calculate amounts
    const TOKEN_DECIMALS = 1e6
    let makerAmount: string
    let takerAmount: string

    if (side === OrderSide.BUY) {
      const rawTakerAmount = Math.floor(size * 100) / 100
      const rawMakerAmount = Math.floor(rawTakerAmount * price * 10000) / 10000
      makerAmount = Math.floor(rawMakerAmount * TOKEN_DECIMALS).toString()
      takerAmount = Math.floor(rawTakerAmount * TOKEN_DECIMALS).toString()
    } else {
      const rawMakerAmount = Math.floor(size * 100) / 100
      const rawTakerAmount = Math.floor(rawMakerAmount * price * 10000) / 10000
      makerAmount = Math.floor(rawMakerAmount * TOKEN_DECIMALS).toString()
      takerAmount = Math.floor(rawTakerAmount * TOKEN_DECIMALS).toString()
    }

    // Get exchange nonce
    const nonceResponse = await fetch(`https://clob.polymarket.com/nonce?address=${walletAddress}`)
    const nonceData = await nonceResponse.json().catch(() => ({ nonce: '0' }))
    const nonce = nonceData.nonce?.toString() || '0'

    // Generate salt
    const salt = Math.round(Math.random() * Date.now())
    const saltBigInt = BigInt(salt)

    // Determine exchange address
    const exchangeAddress = negRisk ? NEG_RISK_CTF_EXCHANGE_ADDRESS : CTF_EXCHANGE_ADDRESS

    // EIP-712 domain
    const domain = {
      name: 'Polymarket CTF Exchange',
      version: '1',
      chainId: POLYGON_CHAIN_ID,
      verifyingContract: exchangeAddress,
    }

    // EIP-712 types
    const types = {
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' },
      ],
    }

    // Build order for signing
    const orderForSigning = {
      salt: saltBigInt,
      maker: ethers.getAddress(walletAddress),
      signer: ethers.getAddress(walletAddress),
      taker: ethers.ZeroAddress,
      tokenId: BigInt(tokenId),
      makerAmount: BigInt(makerAmount),
      takerAmount: BigInt(takerAmount),
      expiration: BigInt(0),
      nonce: BigInt(nonce),
      feeRateBps: BigInt(0),
      side: side,
      signatureType: SignatureType.EOA,
    }

    // Sign the order
    const signature = await wallet.signTypedData(domain, types, orderForSigning)

    // Return signed order
    return NextResponse.json({
      success: true,
      signedOrder: {
        salt: saltBigInt.toString(),
        maker: orderForSigning.maker,
        signer: orderForSigning.signer,
        taker: orderForSigning.taker,
        tokenId: BigInt(tokenId).toString(),
        makerAmount: makerAmount,
        takerAmount: takerAmount,
        expiration: '0',
        nonce: nonce,
        feeRateBps: '0',
        side: side === OrderSide.BUY ? 'BUY' : 'SELL',
        signatureType: SignatureType.EOA,
        signature: signature,
      },
    })
  } catch (error: any) {
    console.error('[Sign Order] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sign order' },
      { status: 500 }
    )
  }
}

