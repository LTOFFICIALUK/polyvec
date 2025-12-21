/**
 * Script to fix payment status (revert from past_due to active)
 * Use this after testing to restore normal subscription status
 * 
 * Usage: DATABASE_URL="..." npx tsx scripts/fix-payment-status.ts <email>
 */

import { Pool } from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const useSSL = databaseUrl.includes('206.189.70.100')
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
})

async function fixPaymentStatus(email: string) {
  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    )

    if (userResult.rows.length === 0) {
      console.error(`User not found: ${email}`)
      process.exit(1)
    }

    const userId = userResult.rows[0].id

    // Update subscription back to active
    await pool.query(
      `UPDATE subscriptions 
       SET status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND status = 'past_due'`,
      [userId]
    )

    console.log(`✅ Subscription status restored to 'active' for ${email}`)
    await pool.end()
  } catch (error: any) {
    console.error('Error:', error.message)
    await pool.end()
    process.exit(1)
  }
}

const email = process.argv[2] || 'everythingsimpleinc1@gmail.com'
fixPaymentStatus(email)

