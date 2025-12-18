/**
 * Polymarket API Authentication Utilities (L2)
 * Handles HMAC signing for authenticated API requests using API credentials
 * 
 * Based on official py-clob-client implementation:
 * https://github.com/Polymarket/py-clob-client/blob/main/py_clob_client/signing/hmac.py
 */

import crypto from 'crypto'

export interface PolymarketApiCredentials {
  apiKey: string
  secret: string
  passphrase: string
}

export interface PolymarketAuthHeaders {
  'POLY_ADDRESS': string
  'POLY_SIGNATURE': string
  'POLY_TIMESTAMP': string
  'POLY_API_KEY': string
  'POLY_PASSPHRASE': string
  [key: string]: string
}

/**
 * Convert URL-safe base64 to standard base64
 */
function urlSafeBase64ToStandard(urlSafe: string): string {
  return urlSafe.replace(/-/g, '+').replace(/_/g, '/')
}

/**
 * Convert standard base64 to URL-safe base64
 */
function standardBase64ToUrlSafe(standard: string): string {
  return standard.replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Generate HMAC signature for Polymarket API request
 * Matches the official py-clob-client implementation exactly
 */
function buildHmacSignature(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string | null
): string {
  // Decode the URL-safe base64 secret
  const base64Secret = urlSafeBase64ToStandard(secret)
  const secretBuffer = Buffer.from(base64Secret, 'base64')
  
  // Build the message: timestamp + method + requestPath + body
  let message = timestamp + method + requestPath
  if (body) {
    message += body
  }
  
  // Create HMAC SHA256 signature
  const hmac = crypto.createHmac('sha256', secretBuffer)
  hmac.update(message, 'utf-8')
  
  // Return URL-safe base64 encoded signature
  const signature = standardBase64ToUrlSafe(hmac.digest('base64'))
  
  return signature
}

/**
 * Generate L2 authentication headers for Polymarket API requests
 * Uses HMAC signature with API credentials
 */
export function generatePolymarketAuthHeaders(
  method: string,
  path: string,
  body: string | null,
  walletAddress: string,
  credentials: PolymarketApiCredentials
): PolymarketAuthHeaders {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  
  const signature = buildHmacSignature(
    credentials.secret,
    timestamp,
    method,
    path,
    body
  )

  // Use lowercase address for POLY_ADDRESS header
  const normalizedAddress = walletAddress.toLowerCase()

  return {
    'POLY_ADDRESS': normalizedAddress,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_API_KEY': credentials.apiKey,
    'POLY_PASSPHRASE': credentials.passphrase,
  } as PolymarketAuthHeaders
}

/**
 * Make authenticated request to Polymarket CLOB API from VPS
 */
export async function makeAuthenticatedRequest(
  method: string,
  path: string,
  walletAddress: string,
  credentials: PolymarketApiCredentials,
  body?: any
): Promise<Response> {
  const POLYMARKET_CLOB_API = process.env.POLYMARKET_CLOB_API || 'https://clob.polymarket.com'
  const url = `${POLYMARKET_CLOB_API}${path}`
  
  const bodyString = body ? JSON.stringify(body) : null
  
  const authHeaders = generatePolymarketAuthHeaders(
    method,
    path,
    bodyString,
    walletAddress,
    credentials
  )

  // Headers with browser-like headers to bypass Cloudflare bot protection
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://clob.polymarket.com',
    'Referer': 'https://clob.polymarket.com/',
    // Polymarket authentication headers
    'POLY_ADDRESS': authHeaders['POLY_ADDRESS'],
    'POLY_SIGNATURE': authHeaders['POLY_SIGNATURE'],
    'POLY_TIMESTAMP': authHeaders['POLY_TIMESTAMP'],
    'POLY_API_KEY': authHeaders['POLY_API_KEY'],
    'POLY_PASSPHRASE': authHeaders['POLY_PASSPHRASE'],
  }

  // Add a random delay before making the request to avoid rate limiting
  const randomDelay = 200 + Math.random() * 300 // 200-500ms random delay
  await new Promise(resolve => setTimeout(resolve, randomDelay))

  // Retry logic with exponential backoff for Cloudflare blocks
  const maxRetries = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: bodyString || undefined,
      })

      // If we get a Cloudflare block (403), retry with exponential backoff
      if (response.status === 403) {
        const clonedResponse = response.clone()
        const responseText = await clonedResponse.text()
        
        if (responseText.includes('Cloudflare') || responseText.includes('cf-error-details') || responseText.includes('Attention Required')) {
          if (attempt < maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const backoffDelay = Math.pow(2, attempt + 1) * 1000
            // Add some jitter to make it less predictable
            const jitter = Math.random() * 1000
            const totalDelay = backoffDelay + jitter
            
            console.warn(`[VPS Trade] Cloudflare block detected (attempt ${attempt + 1}/${maxRetries + 1}), waiting ${Math.round(totalDelay / 1000)}s before retry...`)
            await new Promise(resolve => setTimeout(resolve, totalDelay))
            
            // Continue to next iteration to retry
            continue
          } else {
            // Last attempt failed, return the error response
            return response
          }
        }
      }

      // Success or non-Cloudflare error - return the response
      return response
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries) {
        // Exponential backoff for network errors too
        const backoffDelay = Math.pow(2, attempt + 1) * 1000
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
        continue
      }
      throw error
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Failed to make request after retries')
}

