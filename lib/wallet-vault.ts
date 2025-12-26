/**
 * Wallet Vault - Secure encryption/decryption for custodial wallet private keys
 * 
 * Uses AES-256-GCM with per-user derived keys for maximum security.
 * Compatible with the ws-service keyVault system.
 */

import crypto from 'crypto'

// ============================================
// Configuration
// ============================================

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits
const SALT_LENGTH = 32 // 256 bits

// ============================================
// Types
// ============================================

export interface EncryptedWalletData {
  ciphertext: string  // Base64 encoded
  iv: string          // Base64 encoded
  authTag: string     // Base64 encoded
  salt: string        // Base64 encoded
}

// ============================================
// Key Derivation
// ============================================

/**
 * Derive a unique encryption key for each user
 * This means even if one user's key is somehow compromised,
 * it doesn't help decrypt other users' keys
 */
const deriveUserKey = (masterSecret: string, walletAddress: string, salt: Buffer): Buffer => {
  // Use PBKDF2 with user-specific data to derive unique key
  const info = `polyvec:custodial-wallet:${walletAddress.toLowerCase()}`
  
  return crypto.pbkdf2Sync(
    masterSecret,
    Buffer.concat([salt, Buffer.from(info)]),
    100000, // iterations - high for security
    KEY_LENGTH,
    'sha512'
  )
}

/**
 * Get the master secret from environment
 * Throws if not configured (fail-safe)
 */
const getMasterSecret = (): string => {
  const secret = process.env.TRADING_KEY_SECRET || process.env.WALLET_ENCRYPTION_SECRET
  
  if (!secret) {
    throw new Error('[WalletVault] TRADING_KEY_SECRET or WALLET_ENCRYPTION_SECRET environment variable is not set')
  }
  
  if (secret.length < 32) {
    throw new Error('[WalletVault] Encryption secret must be at least 32 characters')
  }
  
  return secret
}

// ============================================
// Encryption
// ============================================

/**
 * Encrypt a private key for storage
 * 
 * @param privateKey - The wallet private key to encrypt
 * @param walletAddress - The wallet address (used for key derivation)
 * @returns Encrypted data object safe for database storage
 */
export const encryptPrivateKey = (privateKey: string, walletAddress: string): EncryptedWalletData => {
  const masterSecret = getMasterSecret()
  
  // Generate random salt and IV for this encryption
  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)
  
  // Derive user-specific encryption key
  const derivedKey = deriveUserKey(masterSecret, walletAddress, salt)
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv)
  
  // Encrypt the private key
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final()
  ])
  
  // Get authentication tag (prevents tampering)
  const authTag = cipher.getAuthTag()
  
  // Return all components needed for decryption
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  }
}

// ============================================
// Decryption
// ============================================

/**
 * Decrypt a stored private key
 * 
 * @param encryptedData - The encrypted data object from database
 * @param walletAddress - The wallet address (must match encryption)
 * @returns The decrypted private key
 */
export const decryptPrivateKey = (encryptedData: EncryptedWalletData, walletAddress: string): string => {
  const masterSecret = getMasterSecret()
  
  // Parse stored components
  const salt = Buffer.from(encryptedData.salt, 'base64')
  const iv = Buffer.from(encryptedData.iv, 'base64')
  const authTag = Buffer.from(encryptedData.authTag, 'base64')
  const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64')
  
  // Derive the same user-specific key
  const derivedKey = deriveUserKey(masterSecret, walletAddress, salt)
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv)
  decipher.setAuthTag(authTag)
  
  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ])
  
  return decrypted.toString('utf8')
}

// ============================================
// Validation
// ============================================

/**
 * Validate that a string looks like a valid private key
 * Does NOT verify it's a real key, just format check
 */
export const isValidPrivateKeyFormat = (key: string): boolean => {
  // Remove 0x prefix if present
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key
  
  // Private key should be 64 hex characters (32 bytes)
  const hexRegex = /^[a-fA-F0-9]{64}$/
  return hexRegex.test(cleanKey)
}

/**
 * Normalize private key format (ensure 0x prefix)
 */
export const normalizePrivateKey = (key: string): string => {
  const cleanKey = key.trim()
  return cleanKey.startsWith('0x') ? cleanKey : `0x${cleanKey}`
}

