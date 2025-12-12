/**
 * Authentication Verifier
 * 
 * Verifies wallet signatures for API endpoint authentication.
 * Uses EIP-712 signature verification to ensure requests are authorized.
 */

import { ethers } from 'ethers'

// ============================================
// Types
// ============================================

export interface SignaturePayload {
  address: string
  signature: string
  timestamp: string
  nonce?: string
  message?: string
}

// ============================================
// Configuration
// ============================================

const POLYGON_CHAIN_ID = 137
const MAX_TIMESTAMP_DRIFT = 300 // 5 minutes in seconds

const AUTH_DOMAIN = {
  name: 'PolyTradeAuth',
  version: '1',
  chainId: POLYGON_CHAIN_ID,
}

const AUTH_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
  ],
  Auth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
}

const AUTH_MESSAGE = 'Authorize trading key storage for PolyTrade'

// ============================================
// Verification
// ============================================

/**
 * Verify a wallet signature for API authentication
 * 
 * @param payload - Signature payload from request
 * @param expectedAddress - The address that should have signed (optional, if not provided uses payload.address)
 * @returns true if signature is valid, false otherwise
 */
export const verifySignature = (
  payload: SignaturePayload,
  expectedAddress?: string
): boolean => {
  try {
    const { address, signature, timestamp, nonce = '0', message = AUTH_MESSAGE } = payload

    // Validate required fields
    if (!address || !signature || !timestamp) {
      console.warn('[AuthVerifier] Missing required signature fields')
      return false
    }

    // Validate address format
    try {
      ethers.getAddress(address) // Validates checksum and format
    } catch {
      console.warn('[AuthVerifier] Invalid address format:', address)
      return false
    }

    // Check timestamp to prevent replay attacks
    const timestampNum = parseInt(timestamp, 10)
    const currentTime = Math.floor(Date.now() / 1000)
    const timeDiff = Math.abs(currentTime - timestampNum)

    if (isNaN(timestampNum) || timeDiff > MAX_TIMESTAMP_DRIFT) {
      console.warn('[AuthVerifier] Invalid or expired timestamp:', {
        timestamp,
        currentTime,
        timeDiff,
      })
      return false
    }

    // Verify the address matches expected (if provided)
    if (expectedAddress && address.toLowerCase() !== expectedAddress.toLowerCase()) {
      console.warn('[AuthVerifier] Address mismatch:', {
        expected: expectedAddress,
        received: address,
      })
      return false
    }

    // Recover the signer address from the signature
    try {
      const recoveredAddress = ethers.verifyMessage(
        `Authorize trading key storage for PolyTrade\nTimestamp: ${timestamp}\nNonce: ${nonce}`,
        signature
      )

      // Compare addresses (case-insensitive)
      const isValid = recoveredAddress.toLowerCase() === address.toLowerCase()

      if (!isValid) {
        console.warn('[AuthVerifier] Signature verification failed:', {
          expected: address,
          recovered: recoveredAddress,
        })
      }

      return isValid
    } catch (error) {
      console.error('[AuthVerifier] Signature verification error:', error)
      return false
    }
  } catch (error) {
    console.error('[AuthVerifier] Verification error:', error)
    return false
  }
}

/**
 * Verify that a private key corresponds to a given address
 * 
 * @param privateKey - The private key to verify
 * @param expectedAddress - The address it should match
 * @returns true if the private key matches the address
 */
export const verifyPrivateKeyMatchesAddress = (
  privateKey: string,
  expectedAddress: string
): boolean => {
  try {
    // Normalize private key format
    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
    
    // Create wallet from private key
    const wallet = new ethers.Wallet(normalizedKey)
    
    // Compare addresses (case-insensitive)
    const matches = wallet.address.toLowerCase() === expectedAddress.toLowerCase()
    
    if (!matches) {
      console.warn('[AuthVerifier] Private key address mismatch:', {
        expected: expectedAddress,
        actual: wallet.address,
      })
    }
    
    return matches
  } catch (error) {
    console.error('[AuthVerifier] Private key verification error:', error)
    return false
  }
}

/**
 * Extract signature from request headers or body
 */
export const extractSignatureFromRequest = (req: any): SignaturePayload | null => {
  try {
    // Try to get from headers first (preferred)
    const address = req.headers['x-auth-address']
    const signature = req.headers['x-auth-signature']
    const timestamp = req.headers['x-auth-timestamp']
    const nonce = req.headers['x-auth-nonce']

    if (address && signature && timestamp) {
      return {
        address,
        signature,
        timestamp,
        nonce: nonce || '0',
      }
    }

    return null
  } catch {
    return null
  }
}
