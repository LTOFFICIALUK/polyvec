-- Migration: Add Polymarket API credentials storage to users table
-- This allows automatic authentication with Polymarket during account creation

-- Add Polymarket API credentials columns (encrypted)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS polymarket_api_key TEXT,
ADD COLUMN IF NOT EXISTS polymarket_api_secret TEXT,
ADD COLUMN IF NOT EXISTS polymarket_api_passphrase TEXT,
ADD COLUMN IF NOT EXISTS polymarket_credentials_created_at TIMESTAMP WITH TIME ZONE;

-- Create index for credential lookups
CREATE INDEX IF NOT EXISTS idx_users_polymarket_credentials ON users(id) 
WHERE polymarket_api_key IS NOT NULL;

