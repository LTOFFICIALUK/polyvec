/**
 * Trading Key Recorder
 * 
 * Manages encrypted private key storage in PostgreSQL.
 * Keys are encrypted using keyVault before storage.
 */

import { Pool } from 'pg'
import {
  encryptPrivateKey,
  decryptPrivateKey,
  isValidPrivateKeyFormat,
  normalizePrivateKey,
  EncryptedData,
} from '../security/keyVault'
import { verifyPrivateKeyMatchesAddress } from '../security/authVerifier'

let pool: Pool | null = null
let isInitialized = false

// ============================================
// Types
// ============================================

export interface TradingKey {
  id: string
  userAddress: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  lastUsedAt?: Date
}

interface StoredKeyRow {
  id: string
  user_address: string
  encrypted_key: string
  iv: string
  auth_tag: string
  salt: string
  is_active: boolean
  created_at: string
  updated_at: string
  last_used_at?: string
}

// ============================================
// Initialization
// ============================================

export const initializeTradingKeyRecorder = async (): Promise<void> => {
  if (isInitialized) return

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.log('[TradingKeyRecorder] No DATABASE_URL - trading key storage disabled')
    return
  }

  try {
    const useSSL = databaseUrl.includes('proxy.rlwy.net') || databaseUrl.includes('railway.app')

    pool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    })

    await pool.query('SELECT 1')
    isInitialized = true
    console.log('[TradingKeyRecorder] Database connection established')

    await runMigrations()
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TradingKeyRecorder] Failed to initialize:', errorMessage)
  }
}

// ============================================
// Migrations
// ============================================

const runMigrations = async (): Promise<void> => {
  if (!pool) return

  try {
    // Enable UUID extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    // Create trading_keys table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trading_keys (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_address TEXT UNIQUE NOT NULL,
        encrypted_key TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        salt TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      )
    `)

    // Create index for fast lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_trading_keys_user ON trading_keys (user_address);
      CREATE INDEX IF NOT EXISTS idx_trading_keys_active ON trading_keys (is_active) WHERE is_active = TRUE;
    `)

    // Create audit log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trading_key_audit (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_address TEXT NOT NULL,
        action TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    console.log('[TradingKeyRecorder] ✅ Migrations completed')
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TradingKeyRecorder] Migration error:', errorMessage)
  }
}

// ============================================
// Key Storage
// ============================================

/**
 * Store an encrypted private key for a user
 * Replaces any existing key for this user
 */
export const storePrivateKey = async (
  userAddress: string,
  privateKey: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!pool) {
    return { success: false, error: 'Database not initialized' }
  }

  // Validate key format
  if (!isValidPrivateKeyFormat(privateKey)) {
    return { success: false, error: 'Invalid private key format' }
  }

  try {
    // Normalize the key
    const normalizedKey = normalizePrivateKey(privateKey)

    // CRITICAL SECURITY: Verify the private key matches the user address
    // This prevents users from storing keys for addresses they don't control
    if (!verifyPrivateKeyMatchesAddress(normalizedKey, userAddress)) {
      console.error(`[TradingKeyRecorder] Private key does not match user address for ${userAddress.slice(0, 10)}...`)
      return { success: false, error: 'Private key does not match the provided wallet address' }
    }

    // Encrypt the key
    const encrypted = encryptPrivateKey(normalizedKey, userAddress)

    // Upsert the key (replace if exists)
    await pool.query(
      `INSERT INTO trading_keys (user_address, encrypted_key, iv, auth_tag, salt)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_address) DO UPDATE SET
         encrypted_key = $2,
         iv = $3,
         auth_tag = $4,
         salt = $5,
         is_active = TRUE,
         updated_at = NOW()`,
      [
        userAddress.toLowerCase(),
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        encrypted.salt,
      ]
    )

    // Log the action
    await logKeyAction(userAddress, 'store', ipAddress, userAgent)

    console.log(`[TradingKeyRecorder] ✅ Key stored for ${userAddress.slice(0, 10)}...`)
    return { success: true }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TradingKeyRecorder] Store key error:', errorMessage)
    return { success: false, error: 'Failed to store key' }
  }
}

/**
 * Retrieve and decrypt a user's private key
 * Only call this when actually needed for signing
 */
export const getPrivateKey = async (userAddress: string): Promise<string | null> => {
  if (!pool) return null

  try {
    const result = await pool.query<StoredKeyRow>(
      'SELECT * FROM trading_keys WHERE user_address = $1 AND is_active = TRUE',
      [userAddress.toLowerCase()]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]

    // Reconstruct encrypted data object
    const encryptedData: EncryptedData = {
      ciphertext: row.encrypted_key,
      iv: row.iv,
      authTag: row.auth_tag,
      salt: row.salt,
    }

    // Decrypt and return
    const privateKey = decryptPrivateKey(encryptedData, userAddress)

    // Update last used timestamp
    await pool.query(
      'UPDATE trading_keys SET last_used_at = NOW() WHERE user_address = $1',
      [userAddress.toLowerCase()]
    )

    return privateKey
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[TradingKeyRecorder] Get key error:', errorMessage)
    return null
  }
}

/**
 * Check if a user has a stored trading key
 */
export const hasStoredKey = async (userAddress: string): Promise<boolean> => {
  if (!pool) return false

  try {
    const result = await pool.query(
      'SELECT 1 FROM trading_keys WHERE user_address = $1 AND is_active = TRUE',
      [userAddress.toLowerCase()]
    )
    return result.rows.length > 0
  } catch {
    return false
  }
}

/**
 * Get key metadata (without the actual key)
 */
export const getKeyMetadata = async (userAddress: string): Promise<TradingKey | null> => {
  if (!pool) return null

  try {
    const result = await pool.query<StoredKeyRow>(
      'SELECT id, user_address, is_active, created_at, updated_at, last_used_at FROM trading_keys WHERE user_address = $1',
      [userAddress.toLowerCase()]
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    return {
      id: row.id,
      userAddress: row.user_address,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Deactivate a user's trading key (soft delete)
 */
export const deactivateKey = async (
  userAddress: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> => {
  if (!pool) return false

  try {
    const result = await pool.query(
      'UPDATE trading_keys SET is_active = FALSE, updated_at = NOW() WHERE user_address = $1 RETURNING id',
      [userAddress.toLowerCase()]
    )

    if (result.rows.length > 0) {
      await logKeyAction(userAddress, 'deactivate', ipAddress, userAgent)
      console.log(`[TradingKeyRecorder] Key deactivated for ${userAddress.slice(0, 10)}...`)
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Permanently delete a user's trading key
 */
export const deleteKey = async (
  userAddress: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> => {
  if (!pool) return false

  try {
    const result = await pool.query(
      'DELETE FROM trading_keys WHERE user_address = $1 RETURNING id',
      [userAddress.toLowerCase()]
    )

    if (result.rows.length > 0) {
      await logKeyAction(userAddress, 'delete', ipAddress, userAgent)
      console.log(`[TradingKeyRecorder] Key deleted for ${userAddress.slice(0, 10)}...`)
      return true
    }
    return false
  } catch {
    return false
  }
}

// ============================================
// Audit Logging
// ============================================

const logKeyAction = async (
  userAddress: string,
  action: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  if (!pool) return

  try {
    await pool.query(
      `INSERT INTO trading_key_audit (user_address, action, ip_address, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [userAddress.toLowerCase(), action, ipAddress || null, userAgent || null]
    )
  } catch {
    // Non-critical, don't throw
  }
}

/**
 * Get audit log for a user
 */
export const getKeyAuditLog = async (
  userAddress: string,
  limit = 50
): Promise<Array<{ action: string; createdAt: Date; ipAddress?: string }>> => {
  if (!pool) return []

  try {
    const result = await pool.query(
      `SELECT action, ip_address, created_at FROM trading_key_audit 
       WHERE user_address = $1 ORDER BY created_at DESC LIMIT $2`,
      [userAddress.toLowerCase(), limit]
    )

    return result.rows.map(row => ({
      action: row.action,
      createdAt: new Date(row.created_at),
      ipAddress: row.ip_address,
    }))
  } catch {
    return []
  }
}

// ============================================
// Cleanup
// ============================================

export const closeTradingKeyRecorder = async (): Promise<void> => {
  if (pool) {
    await pool.end()
    pool = null
    isInitialized = false
    console.log('[TradingKeyRecorder] Closed database connection')
  }
}
