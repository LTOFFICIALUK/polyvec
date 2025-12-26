-- Migration: Create market_insights_cache table
-- This table stores pre-computed market insights for instant retrieval

CREATE TABLE IF NOT EXISTS market_insights_cache (
  id SERIAL PRIMARY KEY,
  asset TEXT NOT NULL,  -- BTC, ETH, SOL, XRP
  timeframe TEXT NOT NULL,  -- 15m, 1h
  market_quality JSONB NOT NULL,  -- Pre-computed market quality metrics
  timing_context JSONB,  -- Timing context (can be null, computed per market)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one cache entry per asset/timeframe combination
  UNIQUE (asset, timeframe)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_market_insights_cache_asset_timeframe 
  ON market_insights_cache (asset, timeframe);

-- Index for cleanup of old entries
CREATE INDEX IF NOT EXISTS idx_market_insights_cache_updated_at 
  ON market_insights_cache (updated_at DESC);

-- Add comment
COMMENT ON TABLE market_insights_cache IS 'Pre-computed market insights for instant retrieval. Updated by background job.';

