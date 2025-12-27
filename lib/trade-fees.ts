/**
 * Trade Fee Calculation and Management
 * 
 * Handles platform fee collection (2.5% of trade volume)
 */

// Platform fee rate (2.5% = 0.025)
export const PLATFORM_FEE_RATE = 0.025

/**
 * Calculate platform fee for a trade
 * @param tradeAmount - The dollar amount of the trade
 * @returns The fee amount in dollars
 */
export const calculatePlatformFee = (tradeAmount: number): number => {
  return tradeAmount * PLATFORM_FEE_RATE
}

/**
 * Calculate total amount needed (trade + fee)
 * @param tradeAmount - The dollar amount of the trade
 * @returns Total amount needed including fee
 */
export const calculateTotalWithFee = (tradeAmount: number): number => {
  const fee = calculatePlatformFee(tradeAmount)
  return tradeAmount + fee
}

/**
 * Get platform fee wallet address from environment
 */
export const getPlatformFeeWallet = (): string | null => {
  return process.env.PLATFORM_FEE_WALLET_ADDRESS || null
}

/**
 * Validate that platform fee wallet is configured
 */
export const isPlatformFeeConfigured = (): boolean => {
  return !!getPlatformFeeWallet()
}

