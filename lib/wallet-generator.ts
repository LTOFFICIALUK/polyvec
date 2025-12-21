/**
 * Wallet Generator - Creates custodial wallets for users
 * 
 * Generates secure random wallets and stores them encrypted in the database
 */

import { ethers } from 'ethers'
import { encryptPrivateKey, normalizePrivateKey } from './wallet-vault'
import { getDbPool } from './db'

export interface GeneratedWallet {
  address: string
  privateKey: string // Only returned during generation, never stored in plaintext
}

/**
 * Generate a new custodial wallet for a user
 * Returns the wallet address and private key (private key should be encrypted before storage)
 */
export const generateCustodialWallet = (): GeneratedWallet => {
  // Generate a random wallet
  const wallet = ethers.Wallet.createRandom()
  
  return {
    address: wallet.address,
    privateKey: normalizePrivateKey(wallet.privateKey),
  }
}

/**
 * Store a custodial wallet for a user in the database
 * The private key is encrypted before storage
 */
export const storeCustodialWallet = async (
  userId: number,
  wallet: GeneratedWallet
): Promise<{ success: boolean; error?: string }> => {
  const db = getDbPool()
  
  try {
    // Encrypt the private key
    const encrypted = encryptPrivateKey(wallet.privateKey, wallet.address)
    
    // Store in users table
    await db.query(
      `UPDATE users 
       SET wallet_address = $1,
           encrypted_private_key = $2,
           key_iv = $3,
           key_auth_tag = $4,
           key_salt = $5,
           wallet_created_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        wallet.address.toLowerCase(),
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        encrypted.salt,
        userId,
      ]
    )
    
    // Initialize balance record
    await db.query(
      `INSERT INTO user_balances (user_id, wallet_address, usdc_balance, pol_balance)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (user_id, wallet_address) DO NOTHING`,
      [userId, wallet.address.toLowerCase()]
    )
    
    return { success: true }
  } catch (error: any) {
    console.error('[WalletGenerator] Error storing wallet:', error)
    return { 
      success: false, 
      error: error.message || 'Failed to store wallet' 
    }
  }
}

/**
 * Get a user's custodial wallet address
 */
export const getUserWalletAddress = async (userId: number): Promise<string | null> => {
  const db = getDbPool()
  
  try {
    const result = await db.query(
      'SELECT wallet_address FROM users WHERE id = $1',
      [userId]
    )
    
    return result.rows[0]?.wallet_address || null
  } catch (error) {
    console.error('[WalletGenerator] Error getting wallet address:', error)
    return null
  }
}

/**
 * Get and decrypt a user's custodial wallet private key
 * WARNING: Only call this when actually needed for signing transactions
 */
export const getUserWalletPrivateKey = async (userId: number): Promise<string | null> => {
  const db = getDbPool()
  const { decryptPrivateKey } = await import('./wallet-vault')
  
  try {
    const result = await db.query(
      `SELECT wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt
       FROM users 
       WHERE id = $1 AND wallet_address IS NOT NULL`,
      [userId]
    )
    
    if (result.rows.length === 0 || !result.rows[0].wallet_address) {
      return null
    }
    
    const row = result.rows[0]
    const walletAddress = row.wallet_address
    
    // Reconstruct encrypted data
    const encryptedData = {
      ciphertext: row.encrypted_private_key,
      iv: row.key_iv,
      authTag: row.key_auth_tag,
      salt: row.key_salt,
    }
    
    // Decrypt and return
    return decryptPrivateKey(encryptedData, walletAddress)
  } catch (error) {
    console.error('[WalletGenerator] Error getting private key:', error)
    return null
  }
}

/**
 * Check if a user has a custodial wallet
 */
export const userHasWallet = async (userId: number): Promise<boolean> => {
  const db = getDbPool()
  
  try {
    const result = await db.query(
      'SELECT 1 FROM users WHERE id = $1 AND wallet_address IS NOT NULL',
      [userId]
    )
    
    return result.rows.length > 0
  } catch (error) {
    return false
  }
}

