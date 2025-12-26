import { getDbPool } from '@/lib/db'
import { decryptPrivateKey } from '@/lib/wallet-vault'
import { ethers } from 'ethers'

const POLYMARKET_CLOB_API = 'https://clob.polymarket.com'
const POLYGON_CHAIN_ID = 137
const AUTH_MESSAGE = 'This message attests that I control the given wallet'

export interface PolymarketApiCredentials {
  apiKey: string
  secret: string
  passphrase: string
}

/**
 * Authenticate with Polymarket and store credentials for a user
 * This is called automatically during account creation
 */
export async function authenticateWithPolymarket(
  userId: number,
  walletAddress: string
): Promise<{ success: boolean; credentials?: PolymarketApiCredentials; error?: string }> {
  const db = getDbPool()

  try {
    // Check if credentials already exist
    const existingResult = await db.query(
      `SELECT polymarket_api_key, polymarket_api_secret, polymarket_api_passphrase
       FROM users 
       WHERE id = $1 AND polymarket_api_key IS NOT NULL`,
      [userId]
    )

    if (existingResult.rows.length > 0 && existingResult.rows[0].polymarket_api_key) {
      // Credentials already exist, return them
      return {
        success: true,
        credentials: {
          apiKey: existingResult.rows[0].polymarket_api_key,
          secret: existingResult.rows[0].polymarket_api_secret,
          passphrase: existingResult.rows[0].polymarket_api_passphrase,
        },
      }
    }

    // Get user's encrypted private key
    const walletResult = await db.query(
      `SELECT encrypted_private_key, key_iv, key_auth_tag, key_salt
       FROM users 
       WHERE id = $1 AND wallet_address = $2`,
      [userId, walletAddress.toLowerCase()]
    )

    if (walletResult.rows.length === 0) {
      return { success: false, error: 'Custodial wallet not found' }
    }

    const walletData = walletResult.rows[0]

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
      return { success: false, error: 'Wallet address mismatch' }
    }

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

    // Sign the message
    const signature = await wallet.signTypedData(domain, types, value)

    // Prepare headers for Polymarket API
    // Use checksummed address to match what was signed
    const checksummedAddress = ethers.getAddress(walletAddress)
    const headers = {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': checksummedAddress,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp,
      'POLY_NONCE': nonce.toString(),
    }

    // Try to derive existing API key first
    const deriveResponse = await fetch(`${POLYMARKET_CLOB_API}/auth/derive-api-key`, {
      method: 'GET',
      headers: headers,
    })

    let credentials: PolymarketApiCredentials | null = null

    if (deriveResponse.ok) {
      const data = await deriveResponse.json()
      const apiKey = data.apiKey || data.api_key || data.key
      const secret = data.secret || data.apiSecret || data.api_secret
      const passphrase = data.passphrase || data.apiPassphrase || data.api_passphrase

      if (apiKey && secret && passphrase) {
        credentials = { apiKey, secret, passphrase }
      }
    }

    // If derive failed, try to create new API key
    if (!credentials) {
      const createResponse = await fetch(`${POLYMARKET_CLOB_API}/auth/api-key`, {
        method: 'POST',
        headers: headers,
      })

      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        // If account doesn't exist on Polymarket, that's okay - we'll try again later
        // The wallet might need to be used on Polymarket first
        console.log('[PolymarketAuth] Could not create API key:', errorText)
        return {
          success: false,
          error: 'Wallet may need to be used on Polymarket first. Credentials will be created automatically when ready.',
        }
      }

      const data = await createResponse.json()
      const apiKey = data.apiKey || data.api_key || data.key
      const secret = data.secret || data.apiSecret || data.api_secret
      const passphrase = data.passphrase || data.apiPassphrase || data.api_passphrase

      if (!apiKey || !secret || !passphrase) {
        return { success: false, error: 'Incomplete credentials from Polymarket' }
      }

      credentials = { apiKey, secret, passphrase }
    }

    // Store credentials in database
    await db.query(
      `UPDATE users 
       SET polymarket_api_key = $1,
           polymarket_api_secret = $2,
           polymarket_api_passphrase = $3,
           polymarket_credentials_created_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [credentials.apiKey, credentials.secret, credentials.passphrase, userId]
    )

    return { success: true, credentials }
  } catch (error: any) {
    console.error('[PolymarketAuth] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to authenticate with Polymarket',
    }
  }
}

/**
 * Get stored Polymarket credentials for a user
 */
export async function getPolymarketCredentials(
  userId: number
): Promise<PolymarketApiCredentials | null> {
  const db = getDbPool()

  try {
    const result = await db.query(
      `SELECT polymarket_api_key, polymarket_api_secret, polymarket_api_passphrase
       FROM users 
       WHERE id = $1 AND polymarket_api_key IS NOT NULL`,
      [userId]
    )

    if (result.rows.length === 0 || !result.rows[0].polymarket_api_key) {
      return null
    }

    return {
      apiKey: result.rows[0].polymarket_api_key,
      secret: result.rows[0].polymarket_api_secret,
      passphrase: result.rows[0].polymarket_api_passphrase,
    }
  } catch (error: any) {
    console.error('[PolymarketAuth] Error getting credentials:', error)
    return null
  }
}

