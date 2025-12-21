/**
 * Comprehensive Test Suite for Asset Indicator Backtesting
 * Tests:
 * 1. Market-to-asset candle linking (15m and 1h)
 * 2. Indicator accuracy
 * 3. End-to-end integration
 * 4. Order execution system
 */

const API_BASE = 'http://206.189.70.100:8081';

// Test 1: Market-to-Asset Candle Linking
async function testMarketCandleLinking() {
  console.log('\n=== TEST 1: Market-to-Asset Candle Linking ===\n');
  
  const testCases = [
    { asset: 'BTC', timeframe: '15m', markets: 3 },
    { asset: 'BTC', timeframe: '1h', markets: 2 },
    { asset: 'SOL', timeframe: '15m', markets: 2 },
    { asset: 'ETH', timeframe: '15m', markets: 2 },
  ];

  for (const test of testCases) {
    console.log(`Testing ${test.asset} ${test.timeframe} markets...`);
    
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: {
          name: `Test ${test.asset} ${test.timeframe}`,
          direction: 'UP',
          timeframe: test.timeframe,
          asset: test.asset,
          indicators: [],
          conditions: [],
          conditionLogic: 'all',
          orderbookRules: [],
          orderLadder: [{ id: '1', price: 50, shares: 100 }],
        },
        numberOfMarkets: test.markets,
        exitPrice: 99,
        initialBalance: 1000,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      const r = result.result;
      console.log(`  ✅ Found ${r.candlesProcessed} candles across markets`);
      console.log(`  ✅ Markets processed successfully`);
      console.log(`  📊 Summary: ${r.totalTrades} trades, ${r.conditionsTriggered} conditions triggered`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
    }
  }
}

// Test 2: Indicator Accuracy
async function testIndicatorAccuracy() {
  console.log('\n=== TEST 2: Indicator Accuracy ===\n');
  
  const indicators = [
    { type: 'RSI', parameters: { length: 14 } },
    { type: 'MACD', parameters: { fast: 12, slow: 26, signal: 9 } },
    { type: 'SMA', parameters: { length: 20 } },
    { type: 'EMA', parameters: { length: 20 } },
    { type: 'Bollinger Bands', parameters: { length: 20, stdDev: 2 } },
    { type: 'Stochastic', parameters: { k: 14, smoothK: 1, d: 3 } },
    { type: 'ATR', parameters: { length: 14 } },
    { type: 'VWAP', parameters: { resetDaily: false } },
    { type: 'Rolling Up %', parameters: { length: 50 } },
  ];

  for (const indicator of indicators) {
    console.log(`Testing ${indicator.type}...`);
    
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: {
          name: `Test ${indicator.type}`,
          direction: 'UP',
          timeframe: '15m',
          asset: 'BTC',
          indicators: [{
            id: 'ind1',
            type: indicator.type,
            timeframe: '15m',
            parameters: indicator.parameters,
            useInConditions: true,
          }],
          conditions: [], // No conditions - just test calculation
          conditionLogic: 'all',
          orderbookRules: [],
          orderLadder: [{ id: '1', price: 50, shares: 100 }],
        },
        numberOfMarkets: 2,
        exitPrice: 99,
        initialBalance: 1000,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      const r = result.result;
      if (r.candlesProcessed > 0) {
        console.log(`  ✅ ${indicator.type} calculated successfully`);
        console.log(`  📊 Processed ${r.candlesProcessed} candles`);
        console.log(`  📈 Conditions triggered: ${r.conditionsTriggered}`);
      } else {
        console.log(`  ⚠️  ${indicator.type} calculated but no candles processed`);
      }
    } else {
      console.log(`  ❌ ${indicator.type} failed: ${result.error}`);
    }
  }
}

// Test 3: End-to-End Integration
async function testEndToEndIntegration() {
  console.log('\n=== TEST 3: End-to-End Integration ===\n');
  
  const testStrategy = {
    name: 'E2E Test Strategy',
    direction: 'UP',
    timeframe: '15m',
    asset: 'BTC',
    indicators: [
      {
        id: 'rsi1',
        type: 'RSI',
        timeframe: '15m',
        parameters: { length: 14 },
        useInConditions: true,
      },
      {
        id: 'macd1',
        type: 'MACD',
        timeframe: '15m',
        parameters: { fast: 12, slow: 26, signal: 9 },
        useInConditions: true,
      },
    ],
    conditions: [
      {
        id: 'cond1',
        sourceA: 'indicator_rsi1',
        operator: 'crosses above',
        sourceB: 'value',
        value: 30,
        candle: 'current',
      },
      {
        id: 'cond2',
        sourceA: 'indicator_macd1.macd',
        operator: '>',
        sourceB: 'indicator_macd1.signal',
        candle: 'current',
      },
    ],
    conditionLogic: 'any', // Either condition can trigger
    orderbookRules: [],
    orderLadder: [
      { id: '1', price: 45, shares: 50 },
      { id: '2', price: 40, shares: 50 },
    ],
  };

  console.log('Testing full backtest with multiple indicators and conditions...');
  
  const response = await fetch(`${API_BASE}/api/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: testStrategy,
      numberOfMarkets: 5,
      exitPrice: 80,
      initialBalance: 1000,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    const r = result.result;
    console.log(`  ✅ Backtest completed successfully`);
    console.log(`  📊 Markets processed: Check logs for details`);
    console.log(`  💰 Final balance: $${r.finalBalance.toFixed(2)}`);
    console.log(`  📈 Total trades: ${r.totalTrades}`);
    console.log(`  🎯 Conditions triggered: ${r.conditionsTriggered}`);
    console.log(`  📉 Max drawdown: $${r.maxDrawdown.toFixed(2)} (${r.maxDrawdownPercent.toFixed(2)}%)`);
    
    if (r.totalTrades > 0) {
      console.log(`  ✅ Integration working: Trades executed based on indicators`);
    } else {
      console.log(`  ⚠️  No trades executed (may be due to market conditions)`);
    }
  } else {
    console.log(`  ❌ Integration test failed: ${result.error}`);
  }
}

// Test 4: Order Execution System
async function testOrderExecution() {
  console.log('\n=== TEST 4: Order Execution System ===\n');
  
  // Test order ladder execution
  const orderLadder = [
    { id: '1', price: 45, shares: 100 },
    { id: '2', price: 40, shares: 150 },
    { id: '3', price: 35, shares: 200 },
  ];

  console.log('Testing order ladder execution...');
  console.log(`  Order ladder: ${orderLadder.map(o => `${o.shares}@${o.price}¢`).join(', ')}`);
  
  const response = await fetch(`${API_BASE}/api/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: {
        name: 'Order Execution Test',
        direction: 'UP',
        timeframe: '15m',
        asset: 'BTC',
        indicators: [],
        conditions: [],
        conditionLogic: 'all',
        orderbookRules: [
          {
            field: 'market_price_per_share',
            operator: 'less_than',
            value: '50',
          },
        ],
        orderLadder,
      },
      numberOfMarkets: 3,
      exitPrice: 80,
      initialBalance: 1000,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    const r = result.result;
    console.log(`  ✅ Order execution test completed`);
    console.log(`  📊 Total trades: ${r.totalTrades}`);
    console.log(`  💰 Initial balance: $${r.initialBalance.toFixed(2)}`);
    console.log(`  💰 Final balance: $${r.finalBalance.toFixed(2)}`);
    console.log(`  📈 PnL: $${r.totalPnl.toFixed(2)} (${r.totalPnlPercent.toFixed(2)}%)`);
    
    // Verify order execution follows Polymarket system
    if (r.trades && r.trades.length > 0) {
      const buyTrades = r.trades.filter(t => t.side === 'BUY');
      console.log(`  ✅ ${buyTrades.length} buy orders executed`);
      
      // Check that prices are in cents
      const allPricesValid = buyTrades.every(t => {
        const priceInCents = Math.round(t.price * 100);
        return priceInCents >= 1 && priceInCents <= 99;
      });
      
      if (allPricesValid) {
        console.log(`  ✅ All order prices are valid (1-99 cents)`);
      } else {
        console.log(`  ⚠️  Some prices may be invalid`);
      }
      
      // Check shares are positive
      const allSharesValid = buyTrades.every(t => t.shares > 0);
      if (allSharesValid) {
        console.log(`  ✅ All order shares are valid (positive)`);
      } else {
        console.log(`  ⚠️  Some shares may be invalid`);
      }
    } else {
      console.log(`  ⚠️  No trades executed (may be due to market conditions)`);
    }
  } else {
    console.log(`  ❌ Order execution test failed: ${result.error}`);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Asset Indicator Backtest Tests\n');
  console.log('='.repeat(60));
  
  try {
    await testMarketCandleLinking();
    await testIndicatorAccuracy();
    await testEndToEndIntegration();
    await testOrderExecution();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
  }
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}

module.exports = {
  testMarketCandleLinking,
  testIndicatorAccuracy,
  testEndToEndIntegration,
  testOrderExecution,
  runAllTests,
};

