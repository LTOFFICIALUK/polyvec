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
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
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
