/**
 * Trade Executor
 * 
 * Executes trades on Polymarket using stored encrypted private keys.
 * Handles order signing and submission to the CLOB API.
 */

import { ethers } from 'ethers'
import { getPrivateKey, hasStoredKey } from '../db/tradingKeyRecorder'
import { recordTrade } from '../db/strategyRecorder'

// ============================================
// Configuration
// ============================================

const POLYMARKET_CLOB_API = process.env.POLYMARKET_CLOB_API || 'https://clob.polymarket.com'
const CHAIN_ID = 137 // Polygon mainnet

// Polymarket CLOB contract addresses (Polygon)
const EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
const COLLATERAL_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC on Polygon

// ============================================
// Types
// ============================================

export interface TradeOrder {
  strategyId: string
  userAddress: string
  tokenId: string       // Polymarket token ID (outcome token)
  side: 'BUY' | 'SELL'
  size: number          // Number of shares
  price: number         // Price per share (0.01 to 0.99)
  orderType: 'market' | 'limit'
}

export interface TradeResult {
  success: boolean
  orderId?: string
  error?: string
  executedPrice?: number
  executedSize?: number
  timestamp: number
}

interface PolymarketOrderPayload {
  tokenID: string
  price: string
  size: string
  side: 'BUY' | 'SELL'
  feeRateBps: string
  nonce: string
  expiration: string
  taker: string
}

// ============================================
// Order Execution
// ============================================

/**
 * Execute a trade order for a strategy
 */
export const executeTrade = async (order: TradeOrder): Promise<TradeResult> => {
  const startTime = Date.now()

  try {
    console.log(`[TradeExecutor] Executing ${order.side} order for ${order.userAddress.slice(0, 10)}...`)

    // Check if user has a trading key
    const hasKey = await hasStoredKey(order.userAddress)
    if (!hasKey) {
      return {
        success: false,
        error: 'No trading key found for user',
        timestamp: startTime,
      }
    }

    // Get the decrypted private key
    let privateKey: string | null = await getPrivateKey(order.userAddress)
    if (!privateKey) {
      return {
        success: false,
        error: 'Failed to decrypt trading key',
        timestamp: startTime,
      }
    }

    // Create wallet from private key
    let wallet: ethers.Wallet | null = new ethers.Wallet(privateKey)

    // Verify wallet address matches user address
    if (wallet.address.toLowerCase() !== order.userAddress.toLowerCase()) {
      console.error('[TradeExecutor] Wallet address mismatch!')
      return {
        success: false,
        error: 'Wallet address mismatch',
        timestamp: startTime,
      }
    }

    // Build and sign the order
    const signedOrder = await buildAndSignOrder(wallet, order)

    // Submit to Polymarket CLOB
    const result = await submitOrder(signedOrder, wallet.address)

    // Record the trade
    if (result.success && result.orderId) {
      await recordTrade({
        strategyId: order.strategyId,
        userAddress: order.userAddress,
        marketId: order.tokenId.split('-')[0] || order.tokenId, // Extract market from token
        tokenId: order.tokenId,
        side: order.side.toLowerCase() as 'buy' | 'sell',
        direction: 'YES', // TODO: Determine from token
        entryPrice: result.executedPrice,
        shares: result.executedSize || order.size,
        orderType: order.orderType,
        orderId: result.orderId,
        status: 'pending',
        executedAt: new Date(),
      })
    }

    // Clear sensitive data from memory (best effort)
    // Note: JavaScript doesn't guarantee memory clearing, but we minimize exposure time
    privateKey = null
    wallet = null
    
    console.log(`[TradeExecutor] Order ${result.success ? 'submitted' : 'failed'}: ${result.orderId || result.error}`)
    
    return {
      ...result,
      timestamp: startTime,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TradeExecutor] Execution error:', errorMessage)
    
    return {
      success: false,
      error: errorMessage,
      timestamp: startTime,
    }
  }
}

// ============================================
// Order Building & Signing
// ============================================

interface SignedOrder {
  order: PolymarketOrderPayload
  signature: string
}

/**
 * Build and sign a Polymarket order
 */
const buildAndSignOrder = async (
  wallet: ethers.Wallet,
  order: TradeOrder
): Promise<SignedOrder> => {
  const nonce = Date.now().toString()
  const expiration = (Math.floor(Date.now() / 1000) + 3600).toString() // 1 hour expiry

  // Build order payload
  const orderPayload: PolymarketOrderPayload = {
    tokenID: order.tokenId,
    price: order.price.toFixed(2),
    size: order.size.toString(),
    side: order.side,
    feeRateBps: '0', // Polymarket currently has 0 fees
    nonce,
    expiration,
    taker: '0x0000000000000000000000000000000000000000', // Anyone can fill
  }

  // Create EIP-712 typed data for signing
  const domain = {
    name: 'Polymarket CTF Exchange',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: EXCHANGE_ADDRESS,
  }

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

  // Calculate amounts based on side
  const makerAmount = order.side === 'BUY' 
    ? Math.floor(order.size * order.price * 1e6) // USDC amount (6 decimals)
    : Math.floor(order.size * 1e6) // Token amount

  const takerAmount = order.side === 'BUY'
    ? Math.floor(order.size * 1e6) // Token amount
    : Math.floor(order.size * order.price * 1e6) // USDC amount

  const orderData = {
    salt: nonce,
    maker: wallet.address,
    signer: wallet.address,
    taker: orderPayload.taker,
    tokenId: order.tokenId,
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    expiration: orderPayload.expiration,
    nonce: orderPayload.nonce,
    feeRateBps: orderPayload.feeRateBps,
    side: order.side === 'BUY' ? 0 : 1,
    signatureType: 0, // EOA signature
  }

  // Sign the order
  const signature = await wallet.signTypedData(domain, types, orderData)

  return {
    order: orderPayload,
    signature,
  }
}

// ============================================
// Order Submission
// ============================================

/**
 * Submit a signed order to Polymarket CLOB
 */
const submitOrder = async (
  signedOrder: SignedOrder,
  makerAddress: string
): Promise<TradeResult> => {
  try {
    const response = await fetch(`${POLYMARKET_CLOB_API}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order: signedOrder.order,
        signature: signedOrder.signature,
        maker: makerAddress,
        orderType: 'GTC', // Good till cancelled
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[TradeExecutor] CLOB API error:', errorText)
      return {
        success: false,
        error: `CLOB API error: ${response.status}`,
        timestamp: Date.now(),
      }
    }

    const data = await response.json() as { orderID?: string; id?: string }

    return {
      success: true,
      orderId: data.orderID || data.id,
      executedPrice: parseFloat(signedOrder.order.price),
      executedSize: parseInt(signedOrder.order.size),
      timestamp: Date.now(),
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Network error'
    return {
      success: false,
      error: errorMessage,
      timestamp: Date.now(),
    }
  }
}

// ============================================
// Market Orders
// ============================================

/**
 * Execute a market order (best available price)
 * This queries the orderbook first, then places a limit order at the best price
 */
export const executeMarketOrder = async (
  order: Omit<TradeOrder, 'price' | 'orderType'>
): Promise<TradeResult> => {
  try {
    // Get best price from orderbook
    const bestPrice = await getBestPrice(order.tokenId, order.side)
    
    if (!bestPrice) {
      return {
        success: false,
        error: 'No liquidity available',
        timestamp: Date.now(),
      }
    }

    // Execute as limit order at best price
    return executeTrade({
      ...order,
      price: bestPrice,
      orderType: 'market',
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      error: errorMessage,
      timestamp: Date.now(),
    }
  }
}

/**
 * Get best available price from orderbook
 */
const getBestPrice = async (tokenId: string, side: 'BUY' | 'SELL'): Promise<number | null> => {
  try {
    const response = await fetch(`${POLYMARKET_CLOB_API}/book?token_id=${tokenId}`)
    
    if (!response.ok) return null
    
    const book = await response.json() as { asks?: Array<{ price: string }>; bids?: Array<{ price: string }> }
    
    if (side === 'BUY') {
      // For buying, we look at asks (selling side)
      const asks = book.asks || []
      if (asks.length === 0) return null
      return parseFloat(asks[0].price)
    } else {
      // For selling, we look at bids (buying side)
      const bids = book.bids || []
      if (bids.length === 0) return null
      return parseFloat(bids[0].price)
    }
  } catch {
    return null
  }
}

// ============================================
// Validation
// ============================================

/**
 * Validate that a user can execute trades
 */
export const canExecuteTrades = async (userAddress: string): Promise<{
  canTrade: boolean
  reason?: string
}> => {
  const hasKey = await hasStoredKey(userAddress)
  
  if (!hasKey) {
    return {
      canTrade: false,
      reason: 'No trading key configured. Please add your wallet private key in settings.',
    }
  }

  return { canTrade: true }
}

/**
 * Test that a stored key can sign (without actually trading)
 */
export const testKeySignature = async (userAddress: string): Promise<boolean> => {
  try {
    const privateKey = await getPrivateKey(userAddress)
    if (!privateKey) return false

    const wallet = new ethers.Wallet(privateKey)
    
    // Verify address matches
    if (wallet.address.toLowerCase() !== userAddress.toLowerCase()) {
      return false
    }

    // Try signing a test message
    await wallet.signMessage('test')
    
    return true
  } catch {
    return false
  }
}
