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

async function listUsers() {
  try {
    const result = await pool.query('SELECT id, email, plan_tier FROM users ORDER BY id')
    console.log(`Found ${result.rows.length} users:`)
    result.rows.forEach((user, i) => {
      console.log(`${i + 1}. ID: ${user.id}, Email: ${user.email}, Plan: ${user.plan_tier || 'free'}`)
    })
    await pool.end()
  } catch (error: any) {
    console.error('Error:', error.message)
    await pool.end()
    process.exit(1)
  }
}

listUsers()

