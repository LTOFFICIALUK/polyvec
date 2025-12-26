import { Pool } from 'pg'

let pool: Pool | null = null

export const getDbPool = (): Pool => {
  if (pool) {
    return pool
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  // Determine if we need SSL based on connection string
  const useSSL = 
    databaseUrl.includes('proxy.rlwy.net') || 
    databaseUrl.includes('railway.app') ||
    databaseUrl.includes('206.189.70.100') // VPS IP

  pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Increased for better concurrency
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // Reduced timeout for faster failures
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    // Optimize for read-heavy workloads
    statement_timeout: 5000, // 5 second query timeout
  })

  return pool
}

export const runMigrations = async (): Promise<void> => {
  const db = getDbPool()
  
  try {
    // Run migration SQL directly (migration file should be run manually on VPS)
    // This ensures tables exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS email_list (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(100) DEFAULT 'landing_page'
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_email_list_email ON email_list(email);
    `)
    console.log('[DB] Users migration completed')
    
    // Add Polymarket credentials columns if they don't exist
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS polymarket_api_key TEXT,
      ADD COLUMN IF NOT EXISTS polymarket_api_secret TEXT,
      ADD COLUMN IF NOT EXISTS polymarket_api_passphrase TEXT,
      ADD COLUMN IF NOT EXISTS polymarket_credentials_created_at TIMESTAMP WITH TIME ZONE;
      
      CREATE INDEX IF NOT EXISTS idx_users_polymarket_credentials ON users(id) 
      WHERE polymarket_api_key IS NOT NULL;
    `)
    console.log('[DB] Polymarket credentials columns added')
    
    // Add profile fields if they don't exist
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE,
      ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
      ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP WITH TIME ZONE;
      
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) 
      WHERE username IS NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_users_wallet_for_profile ON users(wallet_address) 
      WHERE wallet_address IS NOT NULL;
    `)
    console.log('[DB] Profile fields added')
  } catch (error: any) {
    // If tables already exist, that's okay
    if (error.message?.includes('already exists') || error.code === '42P07') {
      console.log('[DB] Users tables already exist')
    } else {
      console.error('[DB] Migration error:', error.message)
      throw error
    }
  }
}
