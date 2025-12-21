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

async function checkSubscription(email: string) {
  try {
    const result = await pool.query(
      `SELECT 
        u.id as user_id,
        u.email,
        u.plan_tier,
        s.id as subscription_id,
        s.status,
        s.subscription_id as stripe_subscription_id,
        s.current_period_end,
        s.created_at
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.email = $1
      ORDER BY s.created_at DESC
      LIMIT 1`,
      [email]
    )
    
    if (result.rows.length === 0) {
      console.log('User not found')
    } else {
      console.log('User and Subscription:', JSON.stringify(result.rows[0], null, 2))
    }
    
    await pool.end()
  } catch (error: any) {
    console.error('Error:', error.message)
    await pool.end()
    process.exit(1)
  }
}

const email = process.argv[2] || 'everythingsimpleinc1@gmail.com'
checkSubscription(email)

