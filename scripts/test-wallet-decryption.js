/**
 * Test script to verify wallet decryption works
 * Run: node scripts/test-wallet-decryption.js
 */

const { Pool } = require('pg')
const { decryptPrivateKey } = require('./lib/wallet-vault')
const ethers = require('ethers')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://polytrade:6Te4WfZi*V/r@206.189.70.100:5432/polytrade',
  ssl: { rejectUnauthorized: false }
})

async function testDecryption() {
  try {
    // Get user wallet data
    const result = await pool.query(
      `SELECT email, wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt
       FROM users 
       WHERE email = 'everythingsimpleinc1@gmail.com' 
       AND wallet_address IS NOT NULL
       LIMIT 1`
    )

    if (result.rows.length === 0) {
      console.log('❌ No wallet found for user')
      return
    }

    const user = result.rows[0]
    console.log('📋 User:', user.email)
    console.log('📍 Wallet Address:', user.wallet_address)
    console.log('')

    // Reconstruct encrypted data
    const encryptedData = {
      ciphertext: user.encrypted_private_key,
      iv: user.key_iv,
      authTag: user.key_auth_tag,
      salt: user.key_salt,
    }

    // Decrypt private key
    console.log('🔓 Decrypting private key...')
    const privateKey = decryptPrivateKey(encryptedData, user.wallet_address)
    
    // Verify the private key matches the wallet address
    const wallet = new ethers.Wallet(privateKey)
    const derivedAddress = wallet.address.toLowerCase()
    const storedAddress = user.wallet_address.toLowerCase()

    console.log('✅ Private key decrypted successfully')
    console.log('🔑 Private key (first 10 chars):', privateKey.substring(0, 12) + '...')
    console.log('')

    if (derivedAddress === storedAddress) {
      console.log('✅ VERIFICATION PASSED: Private key matches wallet address!')
      console.log('   Derived address:', derivedAddress)
      console.log('   Stored address: ', storedAddress)
    } else {
      console.log('❌ VERIFICATION FAILED: Address mismatch!')
      console.log('   Derived address:', derivedAddress)
      console.log('   Stored address: ', storedAddress)
    }

    await pool.end()
  } catch (error) {
    console.error('❌ Error:', error.message)
    await pool.end()
    process.exit(1)
  }
}

// Set environment variable for decryption
process.env.TRADING_KEY_SECRET = process.env.TRADING_KEY_SECRET || 'a18192d1f072a905a934c3c6f486fe62aadcfc0abc18fdc1098a62d27257d1db'

testDecryption()

