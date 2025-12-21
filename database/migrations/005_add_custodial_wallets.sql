-- Migration: Add custodial wallet support to users table
-- This allows each user to have a unique wallet controlled by the platform

-- Add wallet address column (unique per user)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS wallet_address TEXT UNIQUE;

-- Add encrypted private key storage (using same structure as trading_keys table)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT,
ADD COLUMN IF NOT EXISTS key_iv TEXT,
ADD COLUMN IF NOT EXISTS key_auth_tag TEXT,
ADD COLUMN IF NOT EXISTS key_salt TEXT;

-- Add wallet creation timestamp
ALTER TABLE users
ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMP WITH TIME ZONE;

-- Create index for wallet address lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address) WHERE wallet_address IS NOT NULL;

-- Create user_balances table to track USDC.e and POL balances
CREATE TABLE IF NOT EXISTS user_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  usdc_balance NUMERIC(20, 6) DEFAULT 0 CHECK (usdc_balance >= 0),
  pol_balance NUMERIC(20, 6) DEFAULT 0 CHECK (pol_balance >= 0),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, wallet_address)
);

-- Create index for balance lookups
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_wallet ON user_balances(wallet_address);

-- Create deposit history table
CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('USDC', 'POL')),
  amount NUMERIC(20, 6) NOT NULL CHECK (amount > 0),
  transaction_hash TEXT,
  block_number BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for deposit lookups
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_wallet ON deposits(wallet_address);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposits(transaction_hash) WHERE transaction_hash IS NOT NULL;

-- Create function to update balance updated_at timestamp
CREATE OR REPLACE FUNCTION update_balance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update balance updated_at
DROP TRIGGER IF EXISTS update_user_balances_updated_at ON user_balances;
CREATE TRIGGER update_user_balances_updated_at BEFORE UPDATE ON user_balances
    FOR EACH ROW EXECUTE FUNCTION update_balance_updated_at();

