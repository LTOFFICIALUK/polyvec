import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { ethers } from 'ethers'
import { getDbPool } from '@/lib/db'
import { decryptPrivateKey } from '@/lib/wallet-vault'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC.e (Bridged)
const USDC_DECIMALS = 6
const POL_DECIMALS = 18

// ERC20 ABI for transfer function
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]

/**
 * POST /api/user/withdraw
 * Withdraws USDC.e or POL from custodial wallet to recipient address
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Verify token and get userId
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const body = await request.json()
    const { tokenType, amount, recipientAddress } = body

    // Validation
    if (!tokenType || !amount || !recipientAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: tokenType, amount, recipientAddress' },
        { status: 400 }
      )
    }

    if (tokenType !== 'USDC' && tokenType !== 'POL') {
      return NextResponse.json(
        { error: 'Invalid tokenType. Must be "USDC" or "POL"' },
        { status: 400 }
      )
    }

    // Validate recipient address
    try {
      ethers.getAddress(recipientAddress)
    } catch {
      return NextResponse.json(
        { error: 'Invalid recipient address format' },
        { status: 400 }
      )
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive number' },
        { status: 400 }
      )
    }

    // Get user's custodial wallet
    // Note: Using connection pool - connections are automatically released
    const db = getDbPool()
    let walletResult
    try {
      walletResult = await db.query(
      `SELECT wallet_address, encrypted_private_key, key_iv, key_auth_tag, key_salt
       FROM users 
       WHERE id = $1 AND wallet_address IS NOT NULL`,
      [userId]
    )
    } catch (dbError: any) {
      console.error('[Withdraw] Database error fetching wallet:', dbError)
      return NextResponse.json(
        { error: 'Database connection error. Please try again.' },
        { status: 500 }
      )
    }

    if (walletResult.rows.length === 0 || !walletResult.rows[0].wallet_address) {
      return NextResponse.json(
        { error: 'Custodial wallet not found' },
        { status: 404 }
      )
    }

    const walletData = walletResult.rows[0]
    const walletAddress = walletData.wallet_address
    const walletAddressLower = walletAddress.toLowerCase() // For blockchain calls

    // Fetch current balance from blockchain (always get fresh data, don't rely on cached DB values)
    const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
    const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
    const BALANCE_OF_SELECTOR = '0x70a08231'

    // Helper function to get token balance from blockchain
    const getTokenBalance = async (tokenContract: string, address: string): Promise<number> => {
      try {
        const addressPadded = address.slice(2).toLowerCase().padStart(64, '0')
        const callData = BALANCE_OF_SELECTOR + addressPadded
        
        const response = await fetch(POLYGON_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{
              to: tokenContract,
              data: callData,
            }, 'latest'],
            id: 1,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.result && data.result !== '0x') {
            const balanceWei = BigInt(data.result)
            return Number(balanceWei) / 1e6 // USDC has 6 decimals
          }
        }
      } catch (e) {
        console.error('Token balance fetch failed:', e)
      }
      return 0
    }

    // Helper function to get native POL balance from blockchain
    const getNativeBalance = async (address: string): Promise<number> => {
      try {
        const response = await fetch(POLYGON_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.result) {
            const balanceWei = BigInt(data.result)
            return Number(balanceWei) / 1e18 // POL has 18 decimals
          }
        }
      } catch (e) {
        console.error('Native balance fetch failed:', e)
      }
      return 0
    }

    // Fetch balances from blockchain
    const [currentUsdcBalance, currentPolBalance] = await Promise.all([
      getTokenBalance(USDC_E, walletAddressLower),
      getNativeBalance(walletAddressLower),
    ])

    // Check sufficient balance (using blockchain balance, not database)
    if (tokenType === 'USDC' && amountNum > currentUsdcBalance) {
      return NextResponse.json(
        { error: `Insufficient USDC.e balance. Available: $${currentUsdcBalance.toFixed(2)}, Requested: $${amountNum.toFixed(2)}` },
        { status: 400 }
      )
    }

    if (tokenType === 'POL' && amountNum > currentPolBalance) {
      return NextResponse.json(
        { error: `Insufficient POL balance. Available: ${currentPolBalance.toFixed(4)}, Requested: ${amountNum.toFixed(4)}` },
        { status: 400 }
      )
    }

    // Validate encrypted data exists
    if (!walletData.encrypted_private_key || !walletData.key_iv || !walletData.key_auth_tag || !walletData.key_salt) {
      console.error('[Withdraw] Missing encrypted wallet data:', {
        hasCiphertext: !!walletData.encrypted_private_key,
        hasIv: !!walletData.key_iv,
        hasAuthTag: !!walletData.key_auth_tag,
        hasSalt: !!walletData.key_salt,
      })
      return NextResponse.json(
        { error: 'Wallet encryption data is incomplete. Please contact support.' },
        { status: 500 }
      )
    }

    // Decrypt private key
    // IMPORTANT: The wallet address in DB is stored as lowercase (see wallet-generator.ts line 55)
    // During encryption: encryptPrivateKey(wallet.privateKey, wallet.address)
    //   - wallet.address from ethers.Wallet.createRandom() is checksummed
    //   - encryptPrivateKey normalizes to lowercase before deriving key (wallet-vault.ts line 85)
    //   - deriveUserKey also normalizes to lowercase (wallet-vault.ts line 41)
    // During decryption: decryptPrivateKey(encryptedData, walletAddress)
    //   - walletAddress from DB is already lowercase
    //   - decryptPrivateKey normalizes to lowercase (wallet-vault.ts line 140)
    //   - Both should produce identical derived keys
    //
    // Use the EXACT same pattern as getUserWalletPrivateKey (wallet-generator.ts line 133)
    let privateKey: string
    try {
      const encryptedData = {
        ciphertext: walletData.encrypted_private_key,
        iv: walletData.key_iv,
        authTag: walletData.key_auth_tag,
        salt: walletData.key_salt,
      }
      
      // Use wallet address from DB directly (already lowercase, same as getUserWalletPrivateKey)
      // decryptPrivateKey will normalize it the same way encryptPrivateKey did
      privateKey = decryptPrivateKey(encryptedData, walletAddress)
    } catch (decryptError: any) {
      // Log comprehensive error details for debugging
      console.error('[Withdraw] Failed to decrypt private key:', {
        error: decryptError.message,
        errorName: decryptError.name,
        errorStack: decryptError.stack?.substring(0, 500),
        walletAddress: walletAddress,
        walletAddressType: typeof walletAddress,
        walletAddressLength: walletAddress?.length,
        hasCiphertext: !!walletData.encrypted_private_key,
        hasIv: !!walletData.key_iv,
        hasAuthTag: !!walletData.key_auth_tag,
        hasSalt: !!walletData.key_salt,
        ciphertextLength: walletData.encrypted_private_key?.length || 0,
        ivLength: walletData.key_iv?.length || 0,
        authTagLength: walletData.key_auth_tag?.length || 0,
        saltLength: walletData.key_salt?.length || 0,
        hasMasterSecret: !!(process.env.TRADING_KEY_SECRET || process.env.WALLET_ENCRYPTION_SECRET),
        masterSecretLength: (process.env.TRADING_KEY_SECRET || process.env.WALLET_ENCRYPTION_SECRET || '').length,
        masterSecretFirstChars: (process.env.TRADING_KEY_SECRET || process.env.WALLET_ENCRYPTION_SECRET || '').substring(0, 10),
      })
      
      // Provide more specific error message
      let errorMessage = 'Failed to decrypt wallet.'
      if (decryptError.message?.includes('Authentication tag mismatch') || 
          decryptError.message?.includes('unable to authenticate') ||
          decryptError.message?.includes('Decryption failed')) {
        errorMessage = 'Wallet decryption failed: The encryption key may have changed or the wallet data is corrupted. Please contact support.'
      } else if (decryptError.message?.includes('Invalid base64')) {
        errorMessage = 'Wallet decryption failed: Encrypted data format is invalid.'
      } else if (!process.env.TRADING_KEY_SECRET && !process.env.WALLET_ENCRYPTION_SECRET) {
        errorMessage = 'Wallet decryption failed: Encryption secret is not configured.'
      } else if (decryptError.message?.includes('not set')) {
        errorMessage = 'Wallet decryption failed: Encryption secret is missing.'
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }

    // Create wallet and provider
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL)
    const wallet = new ethers.Wallet(privateKey, provider)

    // Verify wallet address matches
    if (wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: 'Wallet address mismatch' },
        { status: 500 }
      )
    }

    let txHash: string

    if (tokenType === 'POL') {
      // Native POL transfer
      const amountWei = ethers.parseEther(amountNum.toString())
      const tx = await wallet.sendTransaction({
        to: recipientAddress,
        value: amountWei,
      })
      txHash = tx.hash
    } else {
      // USDC.e token transfer
      const tokenContract = new ethers.Contract(USDC_E_ADDRESS, ERC20_ABI, wallet)
      const amountUnits = ethers.parseUnits(amountNum.toString(), USDC_DECIMALS)
      const tx = await tokenContract.transfer(recipientAddress, amountUnits)
      txHash = tx.hash
    }

    // Wait for transaction confirmation (1 block)
    const receipt = await provider.waitForTransaction(txHash, 1)

    if (!receipt || receipt.status !== 1) {
      return NextResponse.json(
        { error: 'Transaction failed' },
        { status: 500 }
      )
    }

    // Update balances in database (non-blocking - if this fails, transaction already succeeded)
    try {
    if (tokenType === 'USDC') {
      await db.query(
        `UPDATE user_balances 
         SET usdc_balance = usdc_balance - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [amountNum, userId]
      )
    } else {
      await db.query(
        `UPDATE user_balances 
         SET pol_balance = pol_balance - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [amountNum, userId]
      )
      }
    } catch (updateError: any) {
      // Log but don't fail - transaction already succeeded on blockchain
      console.error('[Withdraw] Failed to update database balance (transaction succeeded):', updateError)
    }

    return NextResponse.json({
      success: true,
      txHash,
      tokenType,
      amount: amountNum,
      recipientAddress,
    })
  } catch (error: any) {
    console.error('[Withdraw] Error:', error)
    
    // Handle specific errors
    if (error.message?.includes('insufficient funds')) {
      return NextResponse.json(
        { error: 'Insufficient balance for withdrawal (including gas fees)' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process withdrawal' },
      { status: 500 }
    )
  }
}

