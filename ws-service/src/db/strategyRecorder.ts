/**
 * Strategy recorder for TimescaleDB
 *
 * Manages CRUD operations for trading strategies, their trades, and analytics.
 * Uses the same database connection as priceRecorder for efficiency.
 */

import { Pool } from 'pg'

let pool: Pool | null = null
let isInitialized = false
let migrationRun = false

// ============================================
// Types
// ============================================

export interface Indicator {
  id: string
  type: string
  timeframe: string
  parameters: Record<string, number>
  useInConditions: boolean
  preset?: string
}

export interface Condition {
  id: string
  sourceA: string
  operator: string
  sourceB: string
  value?: number
  value2?: number
  candle: 'current' | 'previous'
}

export interface Action {
  id: string
  conditionId: string
  action: string
  direction: string
  market: string
  orderType: string
  orderPrice?: number
  sizing: string
  sizingValue?: number
}

export interface OrderbookRule {
  id: string
  field: string
  operator: string
  value: string
  value2?: string
  action: string
}

export interface OrderLadderItem {
  id: string
  price: string
  shares: string
}

export interface TimeRange {
  start: string
  end: string
}

export interface Strategy {
  id?: string
  userAddress: string
  name: string
  description?: string
  asset: string
  direction: string
  timeframe: string
  isLive: boolean
  isActive: boolean
  indicators: Indicator[]
  conditionLogic: 'all' | 'any'
  conditions: Condition[]
  actions: Action[]
  tradeOnEventsCount: number
  market?: string
  side?: string
  orderType?: string
  orderbookRules: OrderbookRule[]
  orderSizeMode: 'fixed_dollar' | 'fixed_shares' | 'percentage'
  fixedDollarAmount?: number
  fixedSharesAmount?: number
  percentageOfBalance?: number
  dynamicBaseSize?: number
  dynamicMaxSize?: number
  limitOrderPrice: 'best_ask' | 'best_bid' | 'mid_price' | 'custom'
  customLimitPrice?: number
  adjustPriceAboveBid: boolean
  adjustPriceBelowAsk: boolean
  maxTradesPerEvent?: number
  maxOpenOrders?: number
  dailyTradeCap?: number
  maxDailyLoss?: number
  maxOrdersPerHour?: number
  maxPositionShares?: number
  maxPositionDollar?: number
  useTakeProfit: boolean
  takeProfitPercent?: number
  useStopLoss: boolean
  stopLossPercent?: number
  unfilledOrderBehavior: 'keep_open' | 'cancel_after_seconds' | 'cancel_at_candle' | 'replace_market'
  cancelAfterSeconds?: number
  useOrderLadder: boolean
  orderLadder: OrderLadderItem[]
  selectedDays: string[]
  timeRange: TimeRange
  runOnNewCandle: boolean
  pauseOnSettlement: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface StrategyTrade {
  id?: string
  strategyId: string
  userAddress: string
  marketId: string
  tokenId: string
  side: 'buy' | 'sell'
  direction: 'YES' | 'NO'
  entryPrice?: number
  exitPrice?: number
  shares: number
  pnl?: number
  fees?: number
  orderType: 'market' | 'limit'
  orderId?: string
  status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'expired'
  triggerCondition?: Record<string, unknown>
  executedAt?: Date
  settledAt?: Date
  createdAt?: Date
}

export interface StrategyAnalytics {
  id?: string
  strategyId: string
  totalTrades: number
  winCount: number
  lossCount: number
  winRate: number
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  avgTradePnl: number
  bestTrade: number
  worstTrade: number
  sharpeRatio?: number
  maxDrawdown: number
  maxDrawdownPercent: number
  profitFactor: number
  totalVolume: number
  avgTradeSize: number
  avgPositionTimeSeconds: number
  tradesToday: number
  pnlToday: number
  periodStart?: Date
  periodEnd?: Date
  calculatedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

// ============================================
// Database Migrations
// ============================================

const runMigrations = async (dbPool: Pool): Promise<void> => {
  if (migrationRun) return

  try {
    console.log('[StrategyRecorder] Running database migrations...')

    // Enable UUID extension
    await dbPool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    // Create strategies table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS strategies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_address TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        asset TEXT NOT NULL,
        direction TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        is_live BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT FALSE,
        indicators JSONB DEFAULT '[]',
        condition_logic TEXT DEFAULT 'all',
        conditions JSONB DEFAULT '[]',
        actions JSONB DEFAULT '[]',
        trade_on_events_count INTEGER DEFAULT 1,
        market TEXT,
        side TEXT,
        order_type TEXT,
        orderbook_rules JSONB DEFAULT '[]',
        order_size_mode TEXT DEFAULT 'fixed_dollar',
        fixed_dollar_amount DECIMAL(12, 2),
        fixed_shares_amount INTEGER,
        percentage_of_balance DECIMAL(5, 2),
        dynamic_base_size DECIMAL(12, 2),
        dynamic_max_size DECIMAL(12, 2),
        limit_order_price TEXT DEFAULT 'best_ask',
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
        unfilled_order_behavior TEXT DEFAULT 'keep_open',
        cancel_after_seconds INTEGER,
        use_order_ladder BOOLEAN DEFAULT FALSE,
        order_ladder JSONB DEFAULT '[]',
        selected_days JSONB DEFAULT '[]',
        time_range JSONB DEFAULT '{"start": "09:00", "end": "22:00"}',
        run_on_new_candle BOOLEAN DEFAULT FALSE,
        pause_on_settlement BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create strategy_trades table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS strategy_trades (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
        user_address TEXT NOT NULL,
        market_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        side TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price DECIMAL(5, 4),
        exit_price DECIMAL(5, 4),
        shares INTEGER NOT NULL,
        pnl DECIMAL(12, 4),
        fees DECIMAL(12, 4) DEFAULT 0,
        order_type TEXT NOT NULL,
        order_id TEXT,
        status TEXT DEFAULT 'pending',
        trigger_condition JSONB,
        executed_at TIMESTAMPTZ,
        settled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create strategy_analytics table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS strategy_analytics (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
        total_trades INTEGER DEFAULT 0,
        win_count INTEGER DEFAULT 0,
        loss_count INTEGER DEFAULT 0,
        win_rate DECIMAL(5, 2) DEFAULT 0,
        total_pnl DECIMAL(12, 4) DEFAULT 0,
        realized_pnl DECIMAL(12, 4) DEFAULT 0,
        unrealized_pnl DECIMAL(12, 4) DEFAULT 0,
        avg_trade_pnl DECIMAL(12, 4) DEFAULT 0,
        best_trade DECIMAL(12, 4) DEFAULT 0,
        worst_trade DECIMAL(12, 4) DEFAULT 0,
        sharpe_ratio DECIMAL(6, 3),
        max_drawdown DECIMAL(12, 4) DEFAULT 0,
        max_drawdown_percent DECIMAL(5, 2) DEFAULT 0,
        profit_factor DECIMAL(6, 3) DEFAULT 0,
        total_volume DECIMAL(16, 4) DEFAULT 0,
        avg_trade_size DECIMAL(12, 4) DEFAULT 0,
        avg_position_time_seconds INTEGER DEFAULT 0,
        trades_today INTEGER DEFAULT 0,
        pnl_today DECIMAL(12, 4) DEFAULT 0,
        period_start TIMESTAMPTZ,
        period_end TIMESTAMPTZ,
        calculated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (strategy_id)
      )
    `)

    // Create indexes
    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies (user_address);
      CREATE INDEX IF NOT EXISTS idx_strategies_active ON strategies (is_active) WHERE is_active = TRUE;
      CREATE INDEX IF NOT EXISTS idx_strategies_created ON strategies (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_strategy_trades_strategy ON strategy_trades (strategy_id);
      CREATE INDEX IF NOT EXISTS idx_strategy_trades_user ON strategy_trades (user_address);
      CREATE INDEX IF NOT EXISTS idx_strategy_trades_executed ON strategy_trades (executed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_strategy_analytics_strategy ON strategy_analytics (strategy_id);
    `)

    // Create update trigger function
    await dbPool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    // Create triggers
    await dbPool.query(`
      DROP TRIGGER IF EXISTS strategies_updated_at ON strategies;
      CREATE TRIGGER strategies_updated_at
        BEFORE UPDATE ON strategies
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `)

    await dbPool.query(`
      DROP TRIGGER IF EXISTS strategy_analytics_updated_at ON strategy_analytics;
      CREATE TRIGGER strategy_analytics_updated_at
        BEFORE UPDATE ON strategy_analytics
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `)

    migrationRun = true
    console.log('[StrategyRecorder] ✅ Database migrations completed')
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Migration error:', errorMessage)
  }
}

// ============================================
// Initialization
// ============================================

export const initializeStrategyRecorder = async (): Promise<void> => {
  if (isInitialized) return

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.log('[StrategyRecorder] No DATABASE_URL - strategy recording disabled')
    return
  }

  try {
    const useSSL = databaseUrl.includes('proxy.rlwy.net') || databaseUrl.includes('railway.app')

    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    })

    await pool.query('SELECT 1')
    isInitialized = true
    console.log('[StrategyRecorder] Initialized database connection pool')

    await runMigrations(pool)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Failed to initialize:', errorMessage)
  }
}

// ============================================
// Strategy CRUD Operations
// ============================================

/**
 * Create a new strategy
 */
export const createStrategy = async (strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Strategy | null> => {
  if (!pool) {
    console.error('[StrategyRecorder] No database connection')
    return null
  }

  try {
    const result = await pool.query(
      `INSERT INTO strategies (
        user_address, name, description, asset, direction, timeframe, is_live, is_active,
        indicators, condition_logic, conditions, actions, trade_on_events_count,
        market, side, order_type, orderbook_rules,
        order_size_mode, fixed_dollar_amount, fixed_shares_amount, percentage_of_balance,
        dynamic_base_size, dynamic_max_size, limit_order_price, custom_limit_price,
        adjust_price_above_bid, adjust_price_below_ask, max_trades_per_event, max_open_orders,
        daily_trade_cap, max_daily_loss, max_orders_per_hour, max_position_shares, max_position_dollar,
        use_take_profit, take_profit_percent, use_stop_loss, stop_loss_percent,
        unfilled_order_behavior, cancel_after_seconds, use_order_ladder, order_ladder,
        selected_days, time_range, run_on_new_candle, pause_on_settlement
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
        $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46
      ) RETURNING *`,
      [
        strategy.userAddress,
        strategy.name,
        strategy.description || null,
        strategy.asset,
        strategy.direction,
        strategy.timeframe,
        strategy.isLive,
        strategy.isActive,
        JSON.stringify(strategy.indicators),
        strategy.conditionLogic,
        JSON.stringify(strategy.conditions),
        JSON.stringify(strategy.actions),
        strategy.tradeOnEventsCount,
        strategy.market || null,
        strategy.side || null,
        strategy.orderType || null,
        JSON.stringify(strategy.orderbookRules),
        strategy.orderSizeMode,
        strategy.fixedDollarAmount || null,
        strategy.fixedSharesAmount || null,
        strategy.percentageOfBalance || null,
        strategy.dynamicBaseSize || null,
        strategy.dynamicMaxSize || null,
        strategy.limitOrderPrice,
        strategy.customLimitPrice || null,
        strategy.adjustPriceAboveBid,
        strategy.adjustPriceBelowAsk,
        strategy.maxTradesPerEvent || null,
        strategy.maxOpenOrders || null,
        strategy.dailyTradeCap || null,
        strategy.maxDailyLoss || null,
        strategy.maxOrdersPerHour || null,
        strategy.maxPositionShares || null,
        strategy.maxPositionDollar || null,
        strategy.useTakeProfit,
        strategy.takeProfitPercent || null,
        strategy.useStopLoss,
        strategy.stopLossPercent || null,
        strategy.unfilledOrderBehavior,
        strategy.cancelAfterSeconds || null,
        strategy.useOrderLadder,
        JSON.stringify(strategy.orderLadder),
        JSON.stringify(strategy.selectedDays),
        JSON.stringify(strategy.timeRange),
        strategy.runOnNewCandle,
        strategy.pauseOnSettlement,
      ]
    )

    // Create initial analytics record
    await pool.query(
      `INSERT INTO strategy_analytics (strategy_id) VALUES ($1)`,
      [result.rows[0].id]
    )

    console.log(`[StrategyRecorder] Created strategy: ${strategy.name}`)
    return mapRowToStrategy(result.rows[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Create strategy error:', errorMessage)
    return null
  }
}

/**
 * Get a strategy by ID
 */
export const getStrategy = async (strategyId: string): Promise<Strategy | null> => {
  if (!pool) return null

  try {
    const result = await pool.query(
      'SELECT * FROM strategies WHERE id = $1',
      [strategyId]
    )

    if (result.rows.length === 0) return null
    return mapRowToStrategy(result.rows[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Get strategy error:', errorMessage)
    return null
  }
}

/**
 * Get all strategies for a user
 */
export const getUserStrategies = async (userAddress: string): Promise<Strategy[]> => {
  if (!pool) return []

  try {
    const result = await pool.query(
      'SELECT * FROM strategies WHERE user_address = $1 ORDER BY created_at DESC',
      [userAddress]
    )

    return result.rows.map(mapRowToStrategy)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Get user strategies error:', errorMessage)
    return []
  }
}

/**
 * Get all public/active strategies (for browsing)
 */
export const getAllStrategies = async (limit = 50, offset = 0): Promise<Strategy[]> => {
  if (!pool) return []

  try {
    const result = await pool.query(
      'SELECT * FROM strategies ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    )

    return result.rows.map(mapRowToStrategy)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Get all strategies error:', errorMessage)
    return []
  }
}

/**
 * Update a strategy
 */
export const updateStrategy = async (
  strategyId: string,
  updates: Partial<Strategy>
): Promise<Strategy | null> => {
  if (!pool) return null

  try {
    // Build dynamic update query
    const setClauses: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      asset: 'asset',
      direction: 'direction',
      timeframe: 'timeframe',
      isLive: 'is_live',
      isActive: 'is_active',
      indicators: 'indicators',
      conditionLogic: 'condition_logic',
      conditions: 'conditions',
      actions: 'actions',
      tradeOnEventsCount: 'trade_on_events_count',
      market: 'market',
      side: 'side',
      orderType: 'order_type',
      orderbookRules: 'orderbook_rules',
      orderSizeMode: 'order_size_mode',
      fixedDollarAmount: 'fixed_dollar_amount',
      fixedSharesAmount: 'fixed_shares_amount',
      percentageOfBalance: 'percentage_of_balance',
      dynamicBaseSize: 'dynamic_base_size',
      dynamicMaxSize: 'dynamic_max_size',
      limitOrderPrice: 'limit_order_price',
      customLimitPrice: 'custom_limit_price',
      adjustPriceAboveBid: 'adjust_price_above_bid',
      adjustPriceBelowAsk: 'adjust_price_below_ask',
      maxTradesPerEvent: 'max_trades_per_event',
      maxOpenOrders: 'max_open_orders',
      dailyTradeCap: 'daily_trade_cap',
      maxDailyLoss: 'max_daily_loss',
      maxOrdersPerHour: 'max_orders_per_hour',
      maxPositionShares: 'max_position_shares',
      maxPositionDollar: 'max_position_dollar',
      useTakeProfit: 'use_take_profit',
      takeProfitPercent: 'take_profit_percent',
      useStopLoss: 'use_stop_loss',
      stopLossPercent: 'stop_loss_percent',
      unfilledOrderBehavior: 'unfilled_order_behavior',
      cancelAfterSeconds: 'cancel_after_seconds',
      useOrderLadder: 'use_order_ladder',
      orderLadder: 'order_ladder',
      selectedDays: 'selected_days',
      timeRange: 'time_range',
      runOnNewCandle: 'run_on_new_candle',
      pauseOnSettlement: 'pause_on_settlement',
    }

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${dbField} = $${paramIndex}`)
        const value = (updates as Record<string, unknown>)[key]
        // JSON stringify arrays and objects
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
          values.push(JSON.stringify(value))
        } else {
          values.push(value)
        }
        paramIndex++
      }
    }

    if (setClauses.length === 0) return null

    values.push(strategyId)
    const query = `UPDATE strategies SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`

    const result = await pool.query(query, values)

    if (result.rows.length === 0) return null
    console.log(`[StrategyRecorder] Updated strategy: ${strategyId}`)
    return mapRowToStrategy(result.rows[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Update strategy error:', errorMessage)
    return null
  }
}

/**
 * Delete a strategy
 */
export const deleteStrategy = async (strategyId: string): Promise<boolean> => {
  if (!pool) return false

  try {
    const result = await pool.query(
      'DELETE FROM strategies WHERE id = $1 RETURNING id',
      [strategyId]
    )

    if (result.rows.length > 0) {
      console.log(`[StrategyRecorder] Deleted strategy: ${strategyId}`)
      return true
    }
    return false
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Delete strategy error:', errorMessage)
    return false
  }
}

/**
 * Toggle strategy active status
 */
export const toggleStrategyActive = async (strategyId: string): Promise<Strategy | null> => {
  if (!pool) return null

  try {
    const result = await pool.query(
      'UPDATE strategies SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [strategyId]
    )

    if (result.rows.length === 0) return null
    return mapRowToStrategy(result.rows[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Toggle strategy error:', errorMessage)
    return null
  }
}

// ============================================
// Trade Recording
// ============================================

/**
 * Record a trade executed by a strategy
 */
export const recordTrade = async (trade: Omit<StrategyTrade, 'id' | 'createdAt'>): Promise<StrategyTrade | null> => {
  if (!pool) return null

  try {
    const result = await pool.query(
      `INSERT INTO strategy_trades (
        strategy_id, user_address, market_id, token_id, side, direction,
        entry_price, exit_price, shares, pnl, fees, order_type, order_id,
        status, trigger_condition, executed_at, settled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        trade.strategyId,
        trade.userAddress,
        trade.marketId,
        trade.tokenId,
        trade.side,
        trade.direction,
        trade.entryPrice || null,
        trade.exitPrice || null,
        trade.shares,
        trade.pnl || null,
        trade.fees || 0,
        trade.orderType,
        trade.orderId || null,
        trade.status,
        trade.triggerCondition ? JSON.stringify(trade.triggerCondition) : null,
        trade.executedAt || null,
        trade.settledAt || null,
      ]
    )

    // Update analytics after recording trade
    await updateStrategyAnalytics(trade.strategyId)

    return mapRowToTrade(result.rows[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Record trade error:', errorMessage)
    return null
  }
}

/**
 * Get trades for a strategy
 */
export const getStrategyTrades = async (
  strategyId: string,
  limit = 100,
  offset = 0
): Promise<StrategyTrade[]> => {
  if (!pool) return []

  try {
    const result = await pool.query(
      'SELECT * FROM strategy_trades WHERE strategy_id = $1 ORDER BY executed_at DESC LIMIT $2 OFFSET $3',
      [strategyId, limit, offset]
    )

    return result.rows.map(mapRowToTrade)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Get strategy trades error:', errorMessage)
    return []
  }
}

// ============================================
// Analytics
// ============================================

/**
 * Get analytics for a strategy
 */
export const getStrategyAnalytics = async (strategyId: string): Promise<StrategyAnalytics | null> => {
  if (!pool) return null

  try {
    const result = await pool.query(
      'SELECT * FROM strategy_analytics WHERE strategy_id = $1',
      [strategyId]
    )

    if (result.rows.length === 0) return null
    return mapRowToAnalytics(result.rows[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Get strategy analytics error:', errorMessage)
    return null
  }
}

/**
 * Recalculate and update analytics for a strategy
 */
export const updateStrategyAnalytics = async (strategyId: string): Promise<StrategyAnalytics | null> => {
  if (!pool) return null

  try {
    // Calculate analytics from trades
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_trades,
        COUNT(CASE WHEN pnl > 0 THEN 1 END) as win_count,
        COUNT(CASE WHEN pnl <= 0 THEN 1 END) as loss_count,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(AVG(pnl), 0) as avg_trade_pnl,
        COALESCE(MAX(pnl), 0) as best_trade,
        COALESCE(MIN(pnl), 0) as worst_trade,
        COALESCE(SUM(shares * entry_price), 0) as total_volume,
        COALESCE(AVG(shares * entry_price), 0) as avg_trade_size
      FROM strategy_trades
      WHERE strategy_id = $1 AND status = 'filled'`,
      [strategyId]
    )

    const stats = statsResult.rows[0]
    const totalTrades = parseInt(stats.total_trades) || 0
    const winCount = parseInt(stats.win_count) || 0
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0

    // Calculate profit factor
    const profitResult = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END), 0) as gross_profit,
        COALESCE(ABS(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)), 0) as gross_loss
      FROM strategy_trades
      WHERE strategy_id = $1 AND status = 'filled'`,
      [strategyId]
    )

    const profitStats = profitResult.rows[0]
    const grossProfit = parseFloat(profitStats.gross_profit) || 0
    const grossLoss = parseFloat(profitStats.gross_loss) || 0
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0

    // Today's stats
    const todayResult = await pool.query(
      `SELECT
        COUNT(*) as trades_today,
        COALESCE(SUM(pnl), 0) as pnl_today
      FROM strategy_trades
      WHERE strategy_id = $1 AND executed_at >= CURRENT_DATE`,
      [strategyId]
    )

    const todayStats = todayResult.rows[0]

    // Upsert analytics
    const result = await pool.query(
      `INSERT INTO strategy_analytics (
        strategy_id, total_trades, win_count, loss_count, win_rate,
        total_pnl, avg_trade_pnl, best_trade, worst_trade,
        profit_factor, total_volume, avg_trade_size, trades_today, pnl_today,
        calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (strategy_id) DO UPDATE SET
        total_trades = EXCLUDED.total_trades,
        win_count = EXCLUDED.win_count,
        loss_count = EXCLUDED.loss_count,
        win_rate = EXCLUDED.win_rate,
        total_pnl = EXCLUDED.total_pnl,
        avg_trade_pnl = EXCLUDED.avg_trade_pnl,
        best_trade = EXCLUDED.best_trade,
        worst_trade = EXCLUDED.worst_trade,
        profit_factor = EXCLUDED.profit_factor,
        total_volume = EXCLUDED.total_volume,
        avg_trade_size = EXCLUDED.avg_trade_size,
        trades_today = EXCLUDED.trades_today,
        pnl_today = EXCLUDED.pnl_today,
        calculated_at = NOW()
      RETURNING *`,
      [
        strategyId,
        totalTrades,
        winCount,
        stats.loss_count,
        winRate,
        stats.total_pnl,
        stats.avg_trade_pnl,
        stats.best_trade,
        stats.worst_trade,
        profitFactor,
        stats.total_volume,
        stats.avg_trade_size,
        todayStats.trades_today,
        todayStats.pnl_today,
      ]
    )

    return mapRowToAnalytics(result.rows[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[StrategyRecorder] Update analytics error:', errorMessage)
    return null
  }
}

// ============================================
// Helper Functions
// ============================================

const mapRowToStrategy = (row: Record<string, unknown>): Strategy => ({
  id: row.id as string,
  userAddress: row.user_address as string,
  name: row.name as string,
  description: row.description as string | undefined,
  asset: row.asset as string,
  direction: row.direction as string,
  timeframe: row.timeframe as string,
  isLive: row.is_live as boolean,
  isActive: row.is_active as boolean,
  indicators: row.indicators as Indicator[],
  conditionLogic: row.condition_logic as 'all' | 'any',
  conditions: row.conditions as Condition[],
  actions: row.actions as Action[],
  tradeOnEventsCount: row.trade_on_events_count as number,
  market: row.market as string | undefined,
  side: row.side as string | undefined,
  orderType: row.order_type as string | undefined,
  orderbookRules: row.orderbook_rules as OrderbookRule[],
  orderSizeMode: row.order_size_mode as 'fixed_dollar' | 'fixed_shares' | 'percentage',
  fixedDollarAmount: row.fixed_dollar_amount ? parseFloat(row.fixed_dollar_amount as string) : undefined,
  fixedSharesAmount: row.fixed_shares_amount ? parseInt(row.fixed_shares_amount as string) : undefined,
  percentageOfBalance: row.percentage_of_balance ? parseFloat(row.percentage_of_balance as string) : undefined,
  dynamicBaseSize: row.dynamic_base_size ? parseFloat(row.dynamic_base_size as string) : undefined,
  dynamicMaxSize: row.dynamic_max_size ? parseFloat(row.dynamic_max_size as string) : undefined,
  limitOrderPrice: row.limit_order_price as 'best_ask' | 'best_bid' | 'mid_price' | 'custom',
  customLimitPrice: row.custom_limit_price ? parseFloat(row.custom_limit_price as string) : undefined,
  adjustPriceAboveBid: row.adjust_price_above_bid as boolean,
  adjustPriceBelowAsk: row.adjust_price_below_ask as boolean,
  maxTradesPerEvent: row.max_trades_per_event ? parseInt(row.max_trades_per_event as string) : undefined,
  maxOpenOrders: row.max_open_orders ? parseInt(row.max_open_orders as string) : undefined,
  dailyTradeCap: row.daily_trade_cap ? parseInt(row.daily_trade_cap as string) : undefined,
  maxDailyLoss: row.max_daily_loss ? parseFloat(row.max_daily_loss as string) : undefined,
  maxOrdersPerHour: row.max_orders_per_hour ? parseInt(row.max_orders_per_hour as string) : undefined,
  maxPositionShares: row.max_position_shares ? parseInt(row.max_position_shares as string) : undefined,
  maxPositionDollar: row.max_position_dollar ? parseFloat(row.max_position_dollar as string) : undefined,
  useTakeProfit: row.use_take_profit as boolean,
  takeProfitPercent: row.take_profit_percent ? parseFloat(row.take_profit_percent as string) : undefined,
  useStopLoss: row.use_stop_loss as boolean,
  stopLossPercent: row.stop_loss_percent ? parseFloat(row.stop_loss_percent as string) : undefined,
  unfilledOrderBehavior: row.unfilled_order_behavior as 'keep_open' | 'cancel_after_seconds' | 'cancel_at_candle' | 'replace_market',
  cancelAfterSeconds: row.cancel_after_seconds ? parseInt(row.cancel_after_seconds as string) : undefined,
  useOrderLadder: row.use_order_ladder as boolean,
  orderLadder: row.order_ladder as OrderLadderItem[],
  selectedDays: row.selected_days as string[],
  timeRange: row.time_range as TimeRange,
  runOnNewCandle: row.run_on_new_candle as boolean,
  pauseOnSettlement: row.pause_on_settlement as boolean,
  createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
})

const mapRowToTrade = (row: Record<string, unknown>): StrategyTrade => ({
  id: row.id as string,
  strategyId: row.strategy_id as string,
  userAddress: row.user_address as string,
  marketId: row.market_id as string,
  tokenId: row.token_id as string,
  side: row.side as 'buy' | 'sell',
  direction: row.direction as 'YES' | 'NO',
  entryPrice: row.entry_price ? parseFloat(row.entry_price as string) : undefined,
  exitPrice: row.exit_price ? parseFloat(row.exit_price as string) : undefined,
  shares: parseInt(row.shares as string),
  pnl: row.pnl ? parseFloat(row.pnl as string) : undefined,
  fees: row.fees ? parseFloat(row.fees as string) : undefined,
  orderType: row.order_type as 'market' | 'limit',
  orderId: row.order_id as string | undefined,
  status: row.status as 'pending' | 'filled' | 'partial' | 'cancelled' | 'expired',
  triggerCondition: row.trigger_condition as Record<string, unknown> | undefined,
  executedAt: row.executed_at ? new Date(row.executed_at as string) : undefined,
  settledAt: row.settled_at ? new Date(row.settled_at as string) : undefined,
  createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
})

const mapRowToAnalytics = (row: Record<string, unknown>): StrategyAnalytics => ({
  id: row.id as string,
  strategyId: row.strategy_id as string,
  totalTrades: parseInt(row.total_trades as string) || 0,
  winCount: parseInt(row.win_count as string) || 0,
  lossCount: parseInt(row.loss_count as string) || 0,
  winRate: parseFloat(row.win_rate as string) || 0,
  totalPnl: parseFloat(row.total_pnl as string) || 0,
  realizedPnl: parseFloat(row.realized_pnl as string) || 0,
  unrealizedPnl: parseFloat(row.unrealized_pnl as string) || 0,
  avgTradePnl: parseFloat(row.avg_trade_pnl as string) || 0,
  bestTrade: parseFloat(row.best_trade as string) || 0,
  worstTrade: parseFloat(row.worst_trade as string) || 0,
  sharpeRatio: row.sharpe_ratio ? parseFloat(row.sharpe_ratio as string) : undefined,
  maxDrawdown: parseFloat(row.max_drawdown as string) || 0,
  maxDrawdownPercent: parseFloat(row.max_drawdown_percent as string) || 0,
  profitFactor: parseFloat(row.profit_factor as string) || 0,
  totalVolume: parseFloat(row.total_volume as string) || 0,
  avgTradeSize: parseFloat(row.avg_trade_size as string) || 0,
  avgPositionTimeSeconds: parseInt(row.avg_position_time_seconds as string) || 0,
  tradesToday: parseInt(row.trades_today as string) || 0,
  pnlToday: parseFloat(row.pnl_today as string) || 0,
  periodStart: row.period_start ? new Date(row.period_start as string) : undefined,
  periodEnd: row.period_end ? new Date(row.period_end as string) : undefined,
  calculatedAt: row.calculated_at ? new Date(row.calculated_at as string) : undefined,
  createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
})

// ============================================
// Cleanup
// ============================================

export const closeStrategyRecorder = async (): Promise<void> => {
  if (pool) {
    await pool.end()
    pool = null
    isInitialized = false
    console.log('[StrategyRecorder] Closed database connection pool')
  }
}
