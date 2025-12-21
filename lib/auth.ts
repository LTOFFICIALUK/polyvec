import bcrypt from 'bcryptjs'
import { getDbPool } from './db'

export interface User {
  id: number
  email: string
  created_at: Date
  last_login: Date | null
}

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10)
}

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

export const createUser = async (email: string, password: string): Promise<User> => {
  const db = getDbPool()
  const passwordHash = await hashPassword(password)
  
  const result = await db.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at, last_login',
    [email.toLowerCase().trim(), passwordHash]
  )
  
  return result.rows[0]
}

export const getUserByEmail = async (email: string): Promise<User & { password_hash: string } | null> => {
  const db = getDbPool()
  
  const result = await db.query(
    'SELECT id, email, password_hash, created_at, last_login FROM users WHERE email = $1 AND is_active = TRUE',
    [email.toLowerCase().trim()]
  )
  
  return result.rows[0] || null
}

export const updateLastLogin = async (userId: number): Promise<void> => {
  const db = getDbPool()
  
  await db.query(
    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
    [userId]
  )
}

export const addToEmailList = async (email: string, source: string = 'landing_page'): Promise<void> => {
  const db = getDbPool()
  
  try {
    await db.query(
      'INSERT INTO email_list (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
      [email.toLowerCase().trim(), source]
    )
  } catch (error: any) {
    // Ignore duplicate key errors
    if (error.code !== '23505') {
      throw error
    }
  }
}
