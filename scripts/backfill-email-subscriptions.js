#!/usr/bin/env node

/**
 * Backfill Email Subscriptions
 * 
 * This script subscribes all existing users to the email list
 * if they're not already subscribed.
 * 
 * Usage:
 *   node scripts/backfill-email-subscriptions.js
 * 
 * Or run on VPS:
 *   ssh root@206.189.70.100
 *   cd /root/polytrade
 *   DATABASE_URL="postgresql://polyvec:<PASSWORD>@localhost:5432/polyvec" node scripts/backfill-email-subscriptions.js
 */

const { Pool } = require('pg')

// Try to load dotenv if available, otherwise use environment variables
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // dotenv not available, use environment variables directly
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('206.189.70.100') || process.env.DATABASE_URL?.includes('206.189')
    ? { rejectUnauthorized: false } 
    : false,
})

async function backfillEmailSubscriptions() {
  console.log('=========================================')
  console.log('Backfilling Email Subscriptions')
  console.log('=========================================\n')

  try {
    // Get all users
    const usersResult = await pool.query(
      `SELECT id, email, created_at 
       FROM users 
       ORDER BY created_at ASC`
    )

    const users = usersResult.rows
    console.log(`Found ${users.length} users in database\n`)

    // Get existing email list subscribers
    const existingSubscribersResult = await pool.query(
      `SELECT email FROM email_list`
    )
    const existingEmails = new Set(
      existingSubscribersResult.rows.map(row => row.email.toLowerCase())
    )

    console.log(`Found ${existingEmails.size} existing email list subscribers\n`)

    // Find users not in email list
    const usersToSubscribe = users.filter(
      user => !existingEmails.has(user.email.toLowerCase())
    )

    console.log(`${usersToSubscribe.length} users need to be subscribed\n`)

    if (usersToSubscribe.length === 0) {
      console.log('✅ All users are already subscribed!')
      await pool.end()
      return
    }

    // Subscribe users
    let subscribed = 0
    let errors = 0

    for (const user of usersToSubscribe) {
      try {
        await pool.query(
          `INSERT INTO email_list (email, source, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO NOTHING`,
          [user.email.toLowerCase().trim(), 'signup', user.created_at]
        )
        subscribed++
        console.log(`✅ Subscribed: ${user.email}`)
      } catch (error) {
        errors++
        console.error(`❌ Error subscribing ${user.email}:`, error.message)
      }
    }

    console.log('\n=========================================')
    console.log('Summary:')
    console.log(`✅ Successfully subscribed: ${subscribed}`)
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`)
    }
    console.log('=========================================')

    // Show final count
    const finalCountResult = await pool.query(
      `SELECT COUNT(*) as total FROM email_list`
    )
    console.log(`\n📧 Total email list subscribers: ${finalCountResult.rows[0].total}`)

    // Show breakdown by source
    const sourceBreakdownResult = await pool.query(
      `SELECT source, COUNT(*) as count
       FROM email_list
       GROUP BY source
       ORDER BY count DESC`
    )
    console.log('\nBreakdown by source:')
    sourceBreakdownResult.rows.forEach(row => {
      console.log(`  ${row.source || 'unknown'}: ${row.count}`)
    })

  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run the script
backfillEmailSubscriptions()
  .then(() => {
    console.log('\n✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

