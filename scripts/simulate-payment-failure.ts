/**
 * Script to simulate payment failure for testing notifications
 * This sets a user's subscription status to 'past_due' so they can see the payment warning banner
 * 
 * Usage: npx tsx scripts/simulate-payment-failure.ts <email>
 */

import { Pool } from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[Simulate Payment Failure] DATABASE_URL not found in environment variables')
  console.error('\nPlease set DATABASE_URL as an environment variable:')
  console.error('  export DATABASE_URL="postgresql://user:pass@host:port/db"')
  console.error('\nOr run with:')
  console.error('  DATABASE_URL="postgresql://..." npx tsx scripts/simulate-payment-failure.ts <email>')
  process.exit(1)
}

// Determine if we need SSL based on connection string
const useSSL = 
  databaseUrl.includes('proxy.rlwy.net') || 
  databaseUrl.includes('railway.app') ||
  databaseUrl.includes('206.189.70.100') // VPS IP

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
})

async function simulatePaymentFailure(email: string) {
  try {
    console.log(`[Simulate Payment Failure] Looking up user: ${email}`)
    
    // Find user by email
    const userResult = await pool.query(
      'SELECT id, email, plan_tier FROM users WHERE email = $1',
      [email]
    )

    if (userResult.rows.length === 0) {
      console.error(`[Simulate Payment Failure] User not found: ${email}`)
      process.exit(1)
    }

    const user = userResult.rows[0]
    console.log(`[Simulate Payment Failure] Found user:`, {
      id: user.id,
      email: user.email,
      plan_tier: user.plan_tier,
    })

    // Check if user has a subscription
    const subResult = await pool.query(
      'SELECT id, subscription_id, status FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.id]
    )

    if (subResult.rows.length === 0) {
      console.log(`[Simulate Payment Failure] No subscription found. Creating one...`)
      
      // Create a test subscription with past_due status
      await pool.query(
        `INSERT INTO subscriptions (
          user_id,
          plan_tier,
          subscription_id,
          payment_method,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id,
          'pro',
          `test_sub_${Date.now()}`,
          'stripe',
          'past_due',
          new Date(),
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          false,
        ]
      )
      console.log(`[Simulate Payment Failure] Created test subscription with past_due status`)
    } else {
      const subscription = subResult.rows[0]
      console.log(`[Simulate Payment Failure] Found subscription:`, {
        id: subscription.id,
        subscription_id: subscription.subscription_id,
        current_status: subscription.status,
      })

      // Update subscription status to past_due
      await pool.query(
        `UPDATE subscriptions 
         SET status = 'past_due',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [subscription.id]
      )
      console.log(`[Simulate Payment Failure] Updated subscription status to 'past_due'`)
    }

    // Ensure user is on Pro plan
    if (user.plan_tier !== 'pro') {
      await pool.query(
        `UPDATE users 
         SET plan_tier = 'pro',
             plan_updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [user.id]
      )
      console.log(`[Simulate Payment Failure] Updated user plan_tier to 'pro'`)
    }

    console.log(`\n✅ Success! User ${email} now has:`)
    console.log(`   - Plan: Pro`)
    console.log(`   - Subscription Status: past_due`)
    console.log(`\nRefresh your browser to see the payment warning banner!`)

    await pool.end()
  } catch (error: any) {
    console.error('[Simulate Payment Failure] Error:', error)
    await pool.end()
    process.exit(1)
  }
}

// Get email from command line args
const email = process.argv[2] || 'everythinginc1@gmail.com'

if (!email) {
  console.error('Usage: npx tsx scripts/simulate-payment-failure.ts <email>')
  process.exit(1)
}

simulatePaymentFailure(email)

