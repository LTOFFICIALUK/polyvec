/**
 * Polymarket Position Redemption
 * 
 * Redeems positions from resolved markets using the CTF (Conditional Token Framework) contract.
 * This is an on-chain operation that burns conditional tokens and returns USDC.e collateral.
 * 
 * For winning positions: Returns full collateral value
 * For losing positions: Returns $0 but clears the position from your portfolio
 */

import { ethers } from 'ethers'

// Contract addresses on Polygon
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045' // Conditional Token Framework
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // Collateral token

// CTF Contract ABI (only the functions we need)
const CTF_ABI = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external',
  'function balanceOf(address owner, uint256 id) view returns (uint256)',
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
  'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
]

// Index sets for binary markets
// For Polymarket binary markets (Yes/No or Up/Down):
// - Index 0 (Yes/Up) → indexSet = 1 (binary: 01)
// - Index 1 (No/Down) → indexSet = 2 (binary: 10)
// - Both outcomes → indexSets = [1, 2]
const BINARY_INDEX_SETS = [1, 2]

export interface RedeemablePosition {
  conditionId: string
  outcomeIndex: number
  size: number
  title: string
  asset: string
}

/**
 * Get the index set for a given outcome index
 * For binary markets:
 * - Outcome 0 (Yes/Up) → indexSet = 1 (binary: 01)
 * - Outcome 1 (No/Down) → indexSet = 2 (binary: 10)
 */
function getIndexSet(outcomeIndex: number): number {
  return 1 << outcomeIndex
}

/**
 * Check if a market has resolved (condition is settled)
 */
export async function isMarketResolved(
  provider: ethers.Provider,
  conditionId: string
): Promise<boolean> {
  try {
    const contract = new ethers.Contract(CTF_CONTRACT, CTF_ABI, provider)
    const denominator = await contract.payoutDenominator(conditionId)
    return denominator > BigInt(0)
  } catch (error) {
    console.error('[Redeem] Error checking if market resolved:', error)
    return false
  }
}

/**
 * Check if a position can be redeemed (market resolved and user won)
 */
export async function canRedeem(
  provider: ethers.Provider,
  conditionId: string,
  outcomeIndex: number
): Promise<boolean> {
  try {
    const contract = new ethers.Contract(CTF_CONTRACT, CTF_ABI, provider)
    
    // Check if the condition has been resolved
    const denominator = await contract.payoutDenominator(conditionId)
    if (denominator === BigInt(0)) {
      console.log('[Redeem] Condition not yet resolved')
      return false
    }
    
    // Check if the user's outcome won
    const numerator = await contract.payoutNumerators(conditionId, outcomeIndex)
    const canRedeem = numerator > BigInt(0)
    
    console.log('[Redeem] Payout check:', { 
      conditionId: conditionId.slice(0, 10) + '...', 
      outcomeIndex, 
      numerator: numerator.toString(), 
      denominator: denominator.toString(),
      canRedeem 
    })
    
    return canRedeem
  } catch (error) {
    console.error('[Redeem] Error checking redemption:', error)
    return false
  }
}

/**
 * Redeem a position from a resolved market
 * 
 * This calls redeemPositions on the CTF contract which:
 * - Burns your conditional tokens
 * - Returns USDC.e collateral (full value for winners, $0 for losers)
 * - Clears the position from your portfolio
 * 
 * @param provider - Ethers BrowserProvider with signer (or object with getSigner method)
 * @param conditionId - The market's condition ID
 * @param outcomeIndex - The outcome index (0 for Yes/Up, 1 for No/Down)
 * @param redeemAll - If true, redeem all outcomes [1, 2] (default: false, only redeem specific outcome)
 * @returns Transaction hash
 */
export async function redeemPosition(
  provider: ethers.BrowserProvider | { getSigner: () => Promise<ethers.Signer> },
  conditionId: string,
  outcomeIndex: number,
  redeemAll: boolean = false
): Promise<string> {
  console.log('[Redeem] Starting position redemption...', { 
    conditionId: conditionId.slice(0, 10) + '...', 
    outcomeIndex,
    redeemAll 
  })
  
  const signer = await provider.getSigner()
  const contract = new ethers.Contract(CTF_CONTRACT, CTF_ABI, signer)
  
  // Parent collection ID is bytes32(0) for Polymarket root conditions
  const parentCollectionId = ethers.ZeroHash
  
  // Determine index sets to redeem
  // - Single outcome: [1] or [2] based on outcomeIndex
  // - All outcomes: [1, 2] for binary markets
  const indexSets = redeemAll ? BINARY_INDEX_SETS : [getIndexSet(outcomeIndex)]
  
  console.log('[Redeem] Calling CTF.redeemPositions...', {
    ctfContract: CTF_CONTRACT,
    collateralToken: USDC_E,
    parentCollectionId,
    conditionId,
    indexSets
  })
  
  // Call redeemPositions on the CTF contract
  // This burns conditional tokens and returns USDC.e collateral
  const tx = await contract.redeemPositions(
    USDC_E,
    parentCollectionId,
    conditionId,
    indexSets
  )
  
  console.log('[Redeem] Transaction submitted:', tx.hash)
  
  // Wait for confirmation
  const receipt = await tx.wait()
  console.log('[Redeem] Transaction confirmed in block:', receipt.blockNumber)
  
  return tx.hash
}

/**
 * Close a position from a resolved market (works for both winners and losers)
 * 
 * This redeems ALL outcomes [1, 2] which ensures the position is fully closed.
 * - Winners: Receive USDC.e collateral
 * - Losers: Receive $0 but position is cleared from portfolio
 * 
 * @param provider - Ethers BrowserProvider with signer (or object with getSigner method)
 * @param conditionId - The market's condition ID
 * @returns Transaction hash
 */
export async function closePosition(
  provider: ethers.BrowserProvider | { getSigner: () => Promise<ethers.Signer> },
  conditionId: string
): Promise<string> {
  console.log('[Close] Closing position for condition:', conditionId.slice(0, 10) + '...')
  
  // First check if the market is resolved on-chain
  // For JsonRpcProvider wrapper, use the provider property if available
  const readProvider = 'provider' in provider && provider.provider
    ? provider.provider as ethers.Provider
    : (await provider.getSigner()).provider as ethers.Provider
  const resolved = await isMarketResolved(readProvider, conditionId)
  if (!resolved) {
    console.log('[Close] Market not resolved yet:', conditionId.slice(0, 10) + '...')
    throw new Error('Market not yet resolved on-chain. Please wait for the oracle to settle the market.')
  }
  
  const signer = await provider.getSigner()
  const contract = new ethers.Contract(CTF_CONTRACT, CTF_ABI, signer)
  
  // Parent collection ID is bytes32(0) for Polymarket
  const parentCollectionId = ethers.ZeroHash
  
  console.log('[Close] Calling CTF.redeemPositions with all outcomes...', {
    ctfContract: CTF_CONTRACT,
    collateralToken: USDC_E,
    parentCollectionId,
    conditionId,
    indexSets: BINARY_INDEX_SETS
  })
  
  // Redeem all outcomes [1, 2] to fully close the position
  const tx = await contract.redeemPositions(
    USDC_E,
    parentCollectionId,
    conditionId,
    BINARY_INDEX_SETS
  )
  
  console.log('[Close] Transaction submitted:', tx.hash)
  
  // Wait for confirmation
  const receipt = await tx.wait()
  console.log('[Close] Transaction confirmed in block:', receipt.blockNumber)
  
  return tx.hash
}

/**
 * Redeem multiple winning positions at once
 */
export async function redeemMultiplePositions(
  provider: ethers.BrowserProvider,
  positions: RedeemablePosition[]
): Promise<{ success: string[]; failed: string[] }> {
  const results = { success: [] as string[], failed: [] as string[] }
  
  for (const position of positions) {
    try {
      const txHash = await redeemPosition(provider, position.conditionId, position.outcomeIndex)
      results.success.push(txHash)
      console.log(`[Redeem] ✓ Redeemed ${position.title}`)
    } catch (error: any) {
      console.error(`[Redeem] ✗ Failed to redeem ${position.title}:`, error.message)
      results.failed.push(position.conditionId)
    }
  }
  
  return results
}

