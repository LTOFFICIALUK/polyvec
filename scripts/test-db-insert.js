// Test INSERT permissions on the database
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

// URL encode password: 6Te4WfZi*V/r -> 6Te4WfZi%2AV%2Fr
const DATABASE_URL = 'postgresql://polytrade:6Te4WfZi%2AV%2Fr@206.189.70.100:5432/polytrade'

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
})

async function testInsert() {
  try {
    console.log('Testing database INSERT permissions...')
    console.log('')
    
    // Test 1: Insert into email_list
    console.log('Test 1: Inserting into email_list...')
    const emailResult = await pool.query(
      'INSERT INTO email_list (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email',
      ['test@example.com', 'test']
    )
    console.log('✓ Email list insert successful:', emailResult.rows[0] || 'Email already exists')
    
    // Test 2: Insert into users
    console.log('')
    console.log('Test 2: Inserting into users...')
    const testPassword = await bcrypt.hash('testpassword123', 10)
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email, created_at',
      ['testuser@example.com', testPassword]
    )
    
    if (userResult.rows.length > 0) {
      console.log('✓ User insert successful:', userResult.rows[0])
      
      // Clean up test user
      await pool.query('DELETE FROM users WHERE email = $1', ['testuser@example.com'])
      console.log('✓ Test user cleaned up')
    } else {
      console.log('✓ User already exists (this is fine)')
    }
    
    // Clean up test email
    await pool.query('DELETE FROM email_list WHERE email = $1', ['test@example.com'])
    console.log('✓ Test email cleaned up')
    
    console.log('')
    console.log('✓ All INSERT tests passed! Database is ready for authentication.')
    
    pool.end()
    process.exit(0)
  } catch (error) {
    console.error('✗ INSERT test failed!')
    console.error('Error:', error.message)
    console.error('Code:', error.code)
    pool.end()
    process.exit(1)
  }
}

testInsert()

