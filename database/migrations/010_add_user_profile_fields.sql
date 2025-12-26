-- Migration: Add user profile fields (username, profile picture)
-- This allows users to customize their profile display

-- Add username column (unique, optional)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Add profile picture URL column (optional)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Add profile updated timestamp
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP WITH TIME ZONE;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Create index for wallet address to username mapping (for profile lookups)
CREATE INDEX IF NOT EXISTS idx_users_wallet_for_profile ON users(wallet_address) WHERE wallet_address IS NOT NULL;

