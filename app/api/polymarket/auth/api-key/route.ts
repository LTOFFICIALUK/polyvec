'use server'

import { NextResponse } from 'next/server'

const POLYMARKET_CLOB_API = 'https://clob.polymarket.com'

/**
 * POST /api/polymarket/auth/api-key
 * Generate Polymarket API key using L1 authentication (EIP-712 signature)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { address, signature, timestamp, nonce } = body

    if (!address || !signature || !timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields: address, signature, timestamp' },
        { status: 400 }
      )
    }

    // Normalize address to lowercase for consistency with API usage
    const normalizedAddress = address.toLowerCase()
    
    const headers = {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': normalizedAddress,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp,
      'POLY_NONCE': nonce?.toString() || '0',
    }

    console.log('Attempting to create/derive API key for:', address)

    // First try to derive an existing API key
    const deriveResponse = await fetch(`${POLYMARKET_CLOB_API}/auth/derive-api-key`, {
      method: 'GET',
      headers: headers,
    })

    if (deriveResponse.ok) {
      const data = await deriveResponse.json()
      console.log('Successfully derived API key, raw response:', JSON.stringify(data, null, 2))
      
      // Check all possible field names
      const apiKey = data.apiKey || data.api_key || data.key
      const secret = data.secret || data.apiSecret || data.api_secret
      const passphrase = data.passphrase || data.apiPassphrase || data.api_passphrase
      
      console.log('Parsed credentials:', { 
        apiKey: apiKey?.substring(0, 10) + '...', 
        secretLength: secret?.length,
        passphraseLength: passphrase?.length 
      })
      
      if (!apiKey || !secret || !passphrase) {
        console.error('Missing credential fields! Available fields:', Object.keys(data))
        return NextResponse.json({
          error: 'Incomplete credentials returned from Polymarket',
          availableFields: Object.keys(data),
        }, { status: 500 })
      }
      
      return NextResponse.json({
        apiKey,
        secret,
        passphrase,
      })
    }

    const deriveError = await deriveResponse.text()
    console.log('Derive failed with status:', deriveResponse.status, 'error:', deriveError)
    console.log('Trying to create new API key...')

    // If derive fails, try to create a new API key
    const createResponse = await fetch(`${POLYMARKET_CLOB_API}/auth/api-key`, {
      method: 'POST',
      headers: headers,
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('Polymarket API error:', createResponse.status, errorText)
      
      // Check if the user needs to sign up on Polymarket first
      if (errorText.includes('Could not create api key')) {
        return NextResponse.json(
          { 
            error: 'Account not found. Please sign up on polymarket.com first, then try again.',
            details: errorText 
          },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { error: `Polymarket API error: ${createResponse.status}`, details: errorText },
        { status: createResponse.status }
      )
    }

    const data = await createResponse.json()
    console.log('Successfully created API key, raw response:', JSON.stringify(data, null, 2))
    
    // Check all possible field names
    const apiKey = data.apiKey || data.api_key || data.key
    const secret = data.secret || data.apiSecret || data.api_secret
    const passphrase = data.passphrase || data.apiPassphrase || data.api_passphrase
    
    console.log('Parsed credentials:', { 
      apiKey: apiKey?.substring(0, 10) + '...', 
      secretLength: secret?.length,
      passphraseLength: passphrase?.length 
    })
    
    if (!apiKey || !secret || !passphrase) {
      console.error('Missing credential fields! Available fields:', Object.keys(data))
      return NextResponse.json({
        error: 'Incomplete credentials returned from Polymarket',
        availableFields: Object.keys(data),
      }, { status: 500 })
    }
    
    return NextResponse.json({
      apiKey,
      secret,
      passphrase,
    })
  } catch (error: any) {
    console.error('API key generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate API key' },
      { status: 500 }
    )
  }
}

