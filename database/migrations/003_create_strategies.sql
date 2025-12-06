-- Migration: Create strategies and analytics tables
-- This migration creates tables for storing user strategies and their performance analytics

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. STRATEGIES TABLE
-- Stores user-created trading strategies
-- ============================================
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_address TEXT NOT NULL,  -- Wallet address of the creator
  
  -- Basic Info
  name TEXT NOT NULL,
  description TEXT,
  asset TEXT NOT NULL,  -- BTC, SOL, ETH, XRP
  direction TEXT NOT NULL,  -- UP, DOWN
  timeframe TEXT NOT NULL,  -- 15m, 1h
  is_live BOOLEAN DEFAULT FALSE,  -- Live trading vs Paper trading
  is_active BOOLEAN DEFAULT FALSE,  -- Currently running
  
  -- TradingView Signals
  indicators JSONB DEFAULT '[]',  -- Array of indicator configs
  condition_logic TEXT DEFAULT 'all',  -- 'all' or 'any'
  conditions JSONB DEFAULT '[]',  -- Array of conditions
  actions JSONB DEFAULT '[]',  -- Array of actions
  trade_on_events_count INTEGER DEFAULT 1,
  
  -- Polymarket Logic
  market TEXT,
  side TEXT,
  order_type TEXT,
  orderbook_rules JSONB DEFAULT '[]',
  
  -- Risk & Sizing
  order_size_mode TEXT DEFAULT 'fixed_dollar',  -- 'fixed_dollar', 'fixed_shares', 'percentage'
  fixed_dollar_amount DECIMAL(12, 2),
  fixed_shares_amount INTEGER,
  percentage_of_balance DECIMAL(5, 2),
  dynamic_base_size DECIMAL(12, 2),
  dynamic_max_size DECIMAL(12, 2),
  limit_order_price TEXT DEFAULT 'best_ask',  -- 'best_ask', 'best_bid', 'mid_price', 'custom'
  custom_limit_price DECIMAL(5, 2),
  adjust_price_above_bid BOOLEAN DEFAULT FALSE,
  adjust_price_below_ask BOOLEAN DEFAULT FALSE,
  max_trades_per_event INTEGER,
  max_open_orders INTEGER,
  daily_trade_cap INTEGER,
  max_daily_loss DECIMAL(12, 2),
  max_orders_per_hour INTEGER,
  max_position_shares INTEGER,
  max_position_dollar DECIMAL(12, 2),
  use_take_profit BOOLEAN DEFAULT FALSE,
  take_profit_percent DECIMAL(5, 2),
  use_stop_loss BOOLEAN DEFAULT FALSE,
  stop_loss_percent DECIMAL(5, 2),
  unfilled_order_behavior TEXT DEFAULT 'keep_open',  -- 'keep_open', 'cancel_after_seconds', 'cancel_at_candle', 'replace_market'
  cancel_after_seconds INTEGER,
  use_order_ladder BOOLEAN DEFAULT FALSE,
  order_ladder JSONB DEFAULT '[]',  -- Array of { price, shares }
  
  -- Schedule
  selected_days JSONB DEFAULT '[]',  -- Array of day names
  time_range JSONB DEFAULT '{"start": "09:00", "end": "22:00"}',
  run_on_new_candle BOOLEAN DEFAULT FALSE,
  pause_on_settlement BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for strategies
CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies (user_address);
CREATE INDEX IF NOT EXISTS idx_strategies_active ON strategies (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_strategies_asset ON strategies (asset);
CREATE INDEX IF NOT EXISTS idx_strategies_created ON strategies (created_at DESC);

-- ============================================
-- 2. STRATEGY_TRADES TABLE
-- Records individual trades executed by strategies
-- ============================================
CREATE TABLE IF NOT EXISTS strategy_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  
  -- Trade Details
  market_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  side TEXT NOT NULL,  -- 'buy' or 'sell'
  direction TEXT NOT NULL,  -- 'YES' or 'NO'
  entry_price DECIMAL(5, 4),  -- Price per share (0.01 to 0.99)
  exit_price DECIMAL(5, 4),
  shares INTEGER NOT NULL,
  pnl DECIMAL(12, 4),
  fees DECIMAL(12, 4) DEFAULT 0,
  
  -- Order Details
  order_type TEXT NOT NULL,  -- 'market', 'limit'
  order_id TEXT,  -- Polymarket order ID
  status TEXT DEFAULT 'pending',  -- 'pending', 'filled', 'partial', 'cancelled', 'expired'
  
  -- Condition that triggered the trade
  trigger_condition JSONB,
  
  -- Timestamps
  executed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for strategy_trades
CREATE INDEX IF NOT EXISTS idx_strategy_trades_strategy ON strategy_trades (strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_trades_user ON strategy_trades (user_address);
CREATE INDEX IF NOT EXISTS idx_strategy_trades_status ON strategy_trades (status);
CREATE INDEX IF NOT EXISTS idx_strategy_trades_executed ON strategy_trades (executed_at DESC);

-- ============================================
-- 3. STRATEGY_ANALYTICS TABLE
-- Cached analytics snapshots for each strategy
-- ============================================
CREATE TABLE IF NOT EXISTS strategy_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  
  -- Trade Statistics
  total_trades INTEGER DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0,  -- Percentage
  
  -- PnL Statistics
  total_pnl DECIMAL(12, 4) DEFAULT 0,
  realized_pnl DECIMAL(12, 4) DEFAULT 0,
  unrealized_pnl DECIMAL(12, 4) DEFAULT 0,
  avg_trade_pnl DECIMAL(12, 4) DEFAULT 0,
  best_trade DECIMAL(12, 4) DEFAULT 0,
  worst_trade DECIMAL(12, 4) DEFAULT 0,
  
  -- Risk Metrics
  sharpe_ratio DECIMAL(6, 3),
  max_drawdown DECIMAL(12, 4) DEFAULT 0,
  max_drawdown_percent DECIMAL(5, 2) DEFAULT 0,
  profit_factor DECIMAL(6, 3) DEFAULT 0,
  
  -- Volume Statistics
  total_volume DECIMAL(16, 4) DEFAULT 0,
  avg_trade_size DECIMAL(12, 4) DEFAULT 0,
  avg_position_time_seconds INTEGER DEFAULT 0,
  
  -- Daily Statistics (rolling)
  trades_today INTEGER DEFAULT 0,
  pnl_today DECIMAL(12, 4) DEFAULT 0,
  
  -- Timestamps
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to have one analytics record per strategy
  UNIQUE (strategy_id)
);

-- Indexes for strategy_analytics
CREATE INDEX IF NOT EXISTS idx_strategy_analytics_strategy ON strategy_analytics (strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_analytics_calculated ON strategy_analytics (calculated_at DESC);

-- ============================================
-- 4. TRIGGER: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers if they exist and recreate
DROP TRIGGER IF EXISTS strategies_updated_at ON strategies;
CREATE TRIGGER strategies_updated_at
  BEFORE UPDATE ON strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS strategy_analytics_updated_at ON strategy_analytics;
CREATE TRIGGER strategy_analytics_updated_at
  BEFORE UPDATE ON strategy_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
