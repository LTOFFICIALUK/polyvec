# VPS Endpoint: /api/trade/submit-order

## Overview
The VPS endpoint should use the official Polymarket SDK's `postOrder()` method to submit signed orders.
This is much cleaner than manually constructing API requests.

## Request Body Structure
```typescript
{
  walletAddress: string,
  credentials: {
    apiKey: string,
    secret: string,
    passphrase: string,
  },
  signedOrder: SignedOrder, // SDK's SignedOrder object from createOrder()
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK',
}
```

## Implementation (TypeScript/Node.js)

```typescript
import { ClobClient, OrderType } from '@polymarket/clob-client'
import { Wallet } from 'ethers'

app.post('/api/trade/submit-order', async (req, res) => {
  try {
    const { walletAddress, credentials, signedOrder, orderType } = req.body

    // Validate required fields
    if (!walletAddress || !credentials || !signedOrder || !orderType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: walletAddress, credentials, signedOrder, orderType',
        errorCode: 'MISSING_FIELDS',
      })
    }

    // Initialize SDK client with credentials
    // Note: For postOrder, we don't need a signer since the order is already signed
    // But SDK requires one, so we create a dummy wallet (it won't be used)
    const dummyWallet = Wallet.createRandom()
    
    const client = new ClobClient(
      'https://clob.polymarket.com',
      137, // Polygon chain ID
      dummyWallet, // Dummy signer (won't be used for postOrder)
      {
        apiKey: credentials.apiKey,
        secret: credentials.secret,
        passphrase: credentials.passphrase,
      },
      0, // Signature type (not used for postOrder)
      undefined, // Funder (not needed)
    )

    // Use SDK's postOrder() method - it handles all serialization automatically
    const orderResponse = await client.postOrder(
      signedOrder, // SDK's SignedOrder object
      orderType as OrderType, // GTC, GTD, FOK, or FAK
    )

    if (!orderResponse.success) {
      return res.status(400).json({
        success: false,
        error: orderResponse.errorMsg || 'Order submission failed',
        errorCode: 'ORDER_SUBMISSION_FAILED',
        details: orderResponse,
      })
    }

    // Success
    return res.json({
      success: true,
      orderId: orderResponse.orderID,
      data: orderResponse,
    })
  } catch (error: any) {
    console.error('[VPS Submit Order] Error:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      errorCode: 'INTERNAL_ERROR',
    })
  }
})
```

## Key Points

1. **Use SDK's postOrder()**: Don't manually construct the API request. The SDK handles all serialization.

2. **SignedOrder Structure**: The `signedOrder` from the browser is the SDK's `SignedOrder` type:
   ```typescript
   {
     salt: string,
     maker: string,
     signer: string,
     taker: string,
     tokenId: string,
     makerAmount: string,
     takerAmount: string,
     expiration: string,
     nonce: string,
     feeRateBps: string,
     side: number | string, // 0 = BUY, 1 = SELL
     signatureType: number,
     signature: string,
   }
   ```

3. **No Manual Serialization**: The SDK's `postOrder()` method automatically converts the SignedOrder to the correct API format.

4. **Order Type**: Pass the orderType directly to `postOrder()` - it accepts 'GTC', 'GTD', 'FOK', or 'FAK'.

