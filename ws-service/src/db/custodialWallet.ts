/**
 * Custodial Wallet Access
 * 
 * Retrieves and decrypts custodial wallet private keys from the users table
 * Uses the same encryption system as Next.js wallet-vault.ts
 */

import { Pool } from 'pg'
import crypto from 'crypto'

let pool: Pool | null = null

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SALT_LENGTH = 32

interface EncryptedWalletData {
  ciphertext: string
  iv: string
  authTag: string
  salt: string
}

interface CustodialWalletRow {
  id: number
  wallet_address: string
  encrypted_private_key: string
  key_iv: string
  key_auth_tag: string
  key_salt: string
}

/**
 * Initialize database connection
 */
export const initializeCustodialWallet = async (databasePool: Pool): Promise<void> => {
  pool = databasePool
  console.log('[CustodialWallet] Initialized with database pool')
}

/**
 * Get master secret from environment
 */
const getMasterSecret = (): string => {
  const secret = process.env.TRADING_KEY_SECRET || process.env.WALLET_ENCRYPTION_SECRET
  
  if (!secret) {
    throw new Error('[CustodialWallet] TRADING_KEY_SECRET or WALLET_ENCRYPTION_SECRET environment variable is not set')
  }
  
  if (secret.length < 32) {
    throw new Error('[CustodialWallet] Encryption secret must be at least 32 characters')
  }
  
  return secret
}

/**
 * Derive user-specific encryption key
 */
const deriveUserKey = (masterSecret: string, walletAddress: string, salt: Buffer): Buffer => {
  const info = `polyvec:custodial-wallet:${walletAddress.toLowerCase()}`
  
  return crypto.pbkdf2Sync(
    masterSecret,
    Buffer.concat([salt, Buffer.from(info)]),
    100000,
    KEY_LENGTH,
    'sha512'
  )
}

/**
 * Decrypt private key from custodial wallet data
 */
const decryptPrivateKey = (encryptedData: EncryptedWalletData, walletAddress: string): string => {
  const masterSecret = getMasterSecret()
  
  const salt = Buffer.from(encryptedData.salt, 'base64')
  const iv = Buffer.from(encryptedData.iv, 'base64')
  const authTag = Buffer.from(encryptedData.authTag, 'base64')
  const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64')
  
  const derivedKey = deriveUserKey(masterSecret, walletAddress, salt)
  
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv)
  decipher.setAuthTag(authTag)
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ])
  
  return decrypted.toString('utf8')
}

/**
 * Get and decrypt custodial wallet private key by user ID
 */
export const getCustodialWalletPrivateKey = async (userId: number): Promise<{ walletAddress: string; privateKey: string } | null> => {
  if (!pool) {
    throw new Error('[CustodialWallet] Database pool not initialized')
  }

  try {
    const result = await pool.query<CustodialWalletRow>(
      `SELECT wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt
       FROM users 
       WHERE id = $1 AND wallet_address IS NOT NULL`,
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    const walletAddress = row.wallet_address

    // Decrypt private key
    const privateKey = decryptPrivateKey(
      {
        ciphertext: row.encrypted_private_key,
        iv: row.key_iv,
        authTag: row.key_auth_tag,
        salt: row.key_salt,
      },
      walletAddress
    )

    return {
      walletAddress,
      privateKey,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[CustodialWallet] Get key error:', errorMessage)
    return null
  }
}

