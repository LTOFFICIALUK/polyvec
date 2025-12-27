-- Migration: Create trading_fees table for tracking platform fee collections
-- This provides an audit trail for all trading fees collected from users

-- Create trading_fees table
CREATE TABLE IF NOT EXISTS trading_fees (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  
  -- Trade Details
  trade_amount NUMERIC(20, 6) NOT NULL CHECK (trade_amount > 0), -- Original trade amount in USDC
  fee_amount NUMERIC(20, 6) NOT NULL CHECK (fee_amount > 0), -- Fee collected (2.5% of trade)
  fee_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.025, -- Fee rate (0.025 = 2.5%)
  
  -- Transaction Details
  transaction_hash TEXT UNIQUE, -- Blockchain transaction hash for fee transfer
  order_id TEXT, -- Polymarket order ID associated with this trade
  
  -- Trade Information
  token_id TEXT, -- Polymarket token ID
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')), -- Trade side
  shares NUMERIC(20, 6), -- Number of shares traded
  price NUMERIC(10, 4), -- Price per share
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'failed')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  collected_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}' -- Store additional fee collection data
);

-- Create indexes for trading_fees
CREATE INDEX IF NOT EXISTS idx_trading_fees_user_id ON trading_fees(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_fees_wallet ON trading_fees(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trading_fees_status ON trading_fees(status);
CREATE INDEX IF NOT EXISTS idx_trading_fees_created_at ON trading_fees(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_fees_order_id ON trading_fees(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trading_fees_tx_hash ON trading_fees(transaction_hash) WHERE transaction_hash IS NOT NULL;

-- Create index for date range queries
CREATE INDEX IF NOT EXISTS idx_trading_fees_date_range ON trading_fees(created_at DESC, status);

