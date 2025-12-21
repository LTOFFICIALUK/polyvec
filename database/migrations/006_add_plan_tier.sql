-- Migration: Add plan tier support to users table
-- This allows users to have free or pro plans with different feature access

-- Add plan tier column (defaults to 'free')
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro'));

-- Add plan updated timestamp
ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan_updated_at TIMESTAMP WITH TIME ZONE;

-- Create index for plan tier lookups
CREATE INDEX IF NOT EXISTS idx_users_plan_tier ON users(plan_tier) WHERE plan_tier IS NOT NULL;

-- Set existing users to free tier if not set
UPDATE users SET plan_tier = 'free' WHERE plan_tier IS NULL;

