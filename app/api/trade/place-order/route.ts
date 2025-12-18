'use server'

import { NextResponse } from 'next/server'
import { makeAuthenticatedRequest, PolymarketApiCredentials } from '@/lib/polymarket-api-auth'

/**
 * POST /api/trade/place-order
 * 
 * Places an order directly on Polymarket (same approach as cancel-order)
 * Uses the deployment IP (Vercel/your server) instead of restricted VPS IP
 * 1. Browser signs order using createSignedOrder() (EIP-712)
 * 2. This API route constructs order payload and submits directly to Polymarket
 * 3. Uses HMAC authentication with API credentials
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      walletAddress,
      credentials,
      signedOrder, // SignedOrder object from createSignedOrder()
      orderType = 'GTC', // 'GTC', 'GTD', 'FOK', or 'FAK'
    } = body

    // Basic validation
    if (!walletAddress || !credentials || !signedOrder) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: walletAddress, credentials, signedOrder',
          errorCode: 'MISSING_FIELDS',
        },
        { status: 400 }
      )
    }

    // Validate credentials structure
    if (!credentials.apiKey || !credentials.secret || !credentials.passphrase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid API credentials. Please re-authenticate with Polymarket.',
          errorCode: 'INVALID_CREDENTIALS',
        },
        { status: 400 }
      )
    }

    const apiCredentials: PolymarketApiCredentials = {
      apiKey: credentials.apiKey,
      secret: credentials.secret,
      passphrase: credentials.passphrase,
    }

    // Construct order payload matching the official SDK's orderToJson() format
    // Based on @polymarket/clob-client/dist/utilities.js:orderToJson()
    // Structure: { order: {...orderFields including signature}, owner, orderType, deferExec }
    // According to Polymarket docs: owner field should be "api key of order owner" (the API key string, not the address)
    // The API key must match the address that signed the order (maker/signer)
    const ownerAddress = signedOrder.maker // Already checksummed from ethers.getAddress()
    
    // Validate that walletAddress matches the maker address (case-insensitive)
    const walletAddressLower = walletAddress.toLowerCase()
    const makerAddressLower = ownerAddress.toLowerCase()
    
    if (walletAddressLower !== makerAddressLower) {
      console.error('[Place Order] Address mismatch:', {
        walletAddress,
        makerAddress: ownerAddress,
        walletAddressLower,
        makerAddressLower,
      })
      return NextResponse.json(
        {
          success: false,
          error: `Wallet address (${walletAddress}) does not match order maker address (${ownerAddress}). Please ensure you're placing orders with the same wallet that created the API credentials.`,
          errorCode: 'ADDRESS_MISMATCH',
        },
        { status: 400 }
      )
    }
    
    console.log('[Place Order] Address info:', {
      walletAddress: walletAddress,
      signedOrderMaker: signedOrder.maker,
      ownerAddress: ownerAddress,
      addressesMatch: walletAddressLower === makerAddressLower,
    })
    
    const orderPayload = {
      order: {
        salt: parseInt(signedOrder.salt, 10), // SDK converts to number
        maker: signedOrder.maker,
        signer: signedOrder.signer,
        taker: signedOrder.taker,
        tokenId: signedOrder.tokenId,
        makerAmount: signedOrder.makerAmount,
        takerAmount: signedOrder.takerAmount,
        expiration: signedOrder.expiration,
        nonce: signedOrder.nonce,
        feeRateBps: signedOrder.feeRateBps,
        side: signedOrder.side, // String ("BUY" or "SELL") - SDK uses Side enum which is string
        signatureType: Number(signedOrder.signatureType), // Number (0 = EOA)
        signature: signedOrder.signature, // Signature is INSIDE order object in SDK
      },
      owner: apiCredentials.apiKey, // According to Polymarket docs: "api key of order owner" - should be the API key string, not the address
      orderType: String(orderType).toUpperCase(), // 'GTC', 'GTD', 'FOK', or 'FAK'
      deferExec: false, // SDK includes this field
    }

    console.log('[Place Order] Submitting order to Polymarket:', {
      walletAddress: walletAddress.substring(0, 10) + '...',
      tokenId: signedOrder.tokenId?.substring(0, 20) + '...',
      side: signedOrder.side,
      orderType: orderType,
    })
    
    console.log('[Place Order] Full order payload being sent:', JSON.stringify(orderPayload, null, 2))

    // Submit order directly to Polymarket API (uses deployment IP, not restricted VPS)
    // Use lowercase address for POLY_ADDRESS header (must match the format used when creating API key)
    // generatePolymarketAuthHeaders will convert to lowercase anyway, but we do it explicitly for clarity
    const response = await makeAuthenticatedRequest(
      'POST',
      '/order',
      ownerAddress.toLowerCase(), // Use lowercase to match API key creation format
      apiCredentials,
      orderPayload
    )

    const responseText = await response.text()
    let responseData: any
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { errorMsg: responseText }
    }

    if (!response.ok) {
      // Log the error prominently so it's easy to find
      console.error('\n========== [PLACE ORDER ERROR] ==========')
      console.error('[Place Order] Status:', response.status, response.statusText)
      console.error('[Place Order] Error Data:', JSON.stringify(responseData, null, 2))
      console.error('[Place Order] Raw Response:', responseText.substring(0, 1000))
      console.error('==========================================\n')

      // Check if Cloudflare blocked the request
      if (response.status === 403 && (
        responseText.includes('Cloudflare') || 
        responseText.includes('cf-error-details') || 
        responseText.includes('Attention Required')
      )) {
        return NextResponse.json(
          {
            success: false,
            error: 'Request blocked by Cloudflare. If this persists, your deployment IP may be restricted. Try using a VPN or deploying to a different region.',
            errorCode: 'CLOUDFLARE_BLOCK',
            details: { errorMsg: 'Cloudflare security challenge triggered.' },
          },
          { status: 403 }
        )
      }

      // Check for API key owner mismatch error
      if (responseData.error?.includes('owner of the API KEY') || 
          responseData.error?.includes('API KEY')) {
        return NextResponse.json(
          {
            success: false,
            error: 'API credentials do not match your wallet address. Please re-authenticate with Polymarket using the correct wallet.',
            errorCode: 'API_KEY_OWNER_MISMATCH',
            details: responseData,
          },
          { status: 400 }
        )
      }

      // Map Polymarket error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        'INVALID_ORDER_MIN_TICK_SIZE': 'Order price breaks minimum tick size rules',
        'INVALID_ORDER_MIN_SIZE': 'Order size is below the minimum requirement',
        'INVALID_ORDER_DUPLICATED': 'This order has already been placed',
        'INVALID_ORDER_NOT_ENOUGH_BALANCE': 'Insufficient balance or allowance',
        'INVALID_ORDER_EXPIRATION': 'Order expiration is invalid',
        'INVALID_ORDER_ERROR': 'Could not insert order',
        'EXECUTION_ERROR': 'Could not execute trade',
        'ORDER_DELAYED': 'Order match delayed due to market conditions',
        'DELAYING_ORDER_ERROR': 'Error delaying the order',
        'FOK_ORDER_NOT_FILLED_ERROR': 'FOK order could not be fully filled',
        'MARKET_NOT_READY': 'Market is not yet ready to process new orders',
      }

      const errorCode = responseData.errorCode || responseData.code
      const errorMessage = errorMessages[errorCode] || responseData.error || responseData.errorMsg || 'Order placement failed'

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          errorCode: errorCode || 'UNKNOWN_ERROR',
          details: responseData,
        },
        { status: response.status }
      )
    }

    // Success
    console.log('[Place Order] Order submitted successfully:', {
      orderId: responseData.orderID || responseData.id,
    })

    return NextResponse.json({
      success: true,
      orderId: responseData.orderID || responseData.id,
      data: responseData,
    })
  } catch (error: any) {
    console.error('[Place Order] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to place order',
        errorCode: 'UNKNOWN_ERROR',
      },
      { status: 500 }
    )
  }
}
