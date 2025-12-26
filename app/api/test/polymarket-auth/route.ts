'use server'

import { NextResponse } from 'next/server'
import { ethers } from 'ethers'

const POLYMARKET_CLOB_API = 'https://clob.polymarket.com'
const POLYGON_CHAIN_ID = 137
const AUTH_MESSAGE = 'This message attests that I control the given wallet'

/**
 * POST /api/test/polymarket-auth
 * Test Polymarket authentication with a generated test wallet
 */
export async function POST(req: Request) {
  try {
    // Generate a new test wallet
    const testWallet = ethers.Wallet.createRandom()
    const walletAddress = testWallet.address
    const privateKey = testWallet.privateKey

    console.log('[Test Auth] Generated test wallet:', walletAddress)

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

    console.log('[Test Auth] Signing message with domain:', domain)
    console.log('[Test Auth] Signing value:', value)

    // Sign the message
    const signature = await testWallet.signTypedData(domain, types, value)

    console.log('[Test Auth] Signature generated:', signature.substring(0, 20) + '...')
    console.log('[Test Auth] Signature length:', signature.length)

    // Prepare headers for Polymarket API
    const checksummedAddress = ethers.getAddress(walletAddress)
    const headers = {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': checksummedAddress,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp,
      'POLY_NONCE': nonce.toString(),
    }

    console.log('[Test Auth] Request headers:', {
      POLY_ADDRESS: checksummedAddress,
      POLY_SIGNATURE: signature.substring(0, 20) + '...',
      POLY_TIMESTAMP: timestamp,
      POLY_NONCE: nonce.toString(),
    })

    // First try to derive an existing API key
    console.log('[Test Auth] Attempting to derive API key...')
    const deriveResponse = await fetch(`${POLYMARKET_CLOB_API}/auth/derive-api-key`, {
      method: 'GET',
      headers: headers,
    })

    console.log('[Test Auth] Derive response status:', deriveResponse.status)

    if (deriveResponse.ok) {
      const data = await deriveResponse.json()
      console.log('[Test Auth] Successfully derived API key')
      console.log('[Test Auth] Response data keys:', Object.keys(data))

      const apiKey = data.apiKey || data.api_key || data.key
      const secret = data.secret || data.apiSecret || data.api_secret
      const passphrase = data.passphrase || data.apiPassphrase || data.api_passphrase

      if (apiKey && secret && passphrase) {
        return NextResponse.json({
          success: true,
          method: 'derive',
          walletAddress: checksummedAddress,
          credentials: {
            apiKey: apiKey.substring(0, 10) + '...',
            secretLength: secret.length,
            passphraseLength: passphrase.length,
          },
          fullCredentials: {
            apiKey,
            secret,
            passphrase,
          },
        })
      }
    }

    const deriveErrorText = await deriveResponse.text()
    console.log('[Test Auth] Derive failed:', deriveResponse.status, deriveErrorText)

    // If derive fails, try to create a new API key
    console.log('[Test Auth] Attempting to create new API key...')
    const createResponse = await fetch(`${POLYMARKET_CLOB_API}/auth/api-key`, {
      method: 'POST',
      headers: headers,
    })

    console.log('[Test Auth] Create response status:', createResponse.status)

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('[Test Auth] Create failed:', createResponse.status, errorText)

      return NextResponse.json(
        {
          success: false,
          error: `Polymarket API error: ${createResponse.status}`,
          details: errorText,
          requestInfo: {
            address: checksummedAddress,
            signatureLength: signature.length,
            timestamp,
            nonce: nonce.toString(),
            message: AUTH_MESSAGE,
            domain,
            types,
            value,
          },
        },
        { status: createResponse.status }
      )
    }

    const data = await createResponse.json()
    console.log('[Test Auth] Successfully created API key')
    console.log('[Test Auth] Response data keys:', Object.keys(data))

    const apiKey = data.apiKey || data.api_key || data.key
    const secret = data.secret || data.apiSecret || data.api_secret
    const passphrase = data.passphrase || data.apiPassphrase || data.api_passphrase

    if (!apiKey || !secret || !passphrase) {
      return NextResponse.json({
        success: false,
        error: 'Incomplete credentials from Polymarket',
        availableFields: Object.keys(data),
        responseData: data,
      })
    }

    return NextResponse.json({
      success: true,
      method: 'create',
      walletAddress: checksummedAddress,
      credentials: {
        apiKey: apiKey.substring(0, 10) + '...',
        secretLength: secret.length,
        passphraseLength: passphrase.length,
      },
      fullCredentials: {
        apiKey,
        secret,
        passphrase,
      },
    })
  } catch (error: any) {
    console.error('[Test Auth] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to test authentication',
        stack: error.stack,
      },
      { status: 500 }
    )
  }
}

