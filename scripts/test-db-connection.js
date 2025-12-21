// Simple script to test database connection
const { Pool } = require('pg')

// URL encode password: 6Te4WfZi*V/r -> 6Te4WfZi%2AV%2Fr
const DATABASE_URL = 'postgresql://polytrade:6Te4WfZi%2AV%2Fr@206.189.70.100:5432/polytrade'

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
})

console.log('Testing database connection...')
console.log('Connecting to: postgresql://polytrade:***@206.189.70.100:5432/polytrade')
console.log('')

pool.query(`
  SELECT 
    NOW() as server_time,
    (SELECT COUNT(*) FROM information_schema.tables 
     WHERE table_schema = 'public' 
     AND table_name IN ('users', 'email_list')) as table_count,
    (SELECT COUNT(*) FROM users) as user_count,
    (SELECT COUNT(*) FROM email_list) as email_list_count
`)
  .then((result) => {
    const row = result.rows[0]
    console.log('✓ Connection successful!')
    console.log('')
    console.log('Server time:', row.server_time)
    console.log('Tables found:', row.table_count)
    console.log('Users in database:', row.user_count)
    console.log('Emails in list:', row.email_list_count)
    console.log('')
    console.log('✓ Database is ready for authentication!')
    pool.end()
    process.exit(0)
  })
  .catch((error) => {
    console.error('✗ Connection failed!')
    console.error('Error:', error.message)
    console.error('')
    console.error('Please check:')
    console.error('1. PostgreSQL is running on the VPS')
    console.error('2. Firewall allows port 5432')
    console.error('3. PostgreSQL is configured to accept remote connections')
    pool.end()
    process.exit(1)
  })

