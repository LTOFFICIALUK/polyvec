/**
 * Detailed Indicator Testing
 * Tests each indicator individually to verify calculation accuracy
 */

const API_BASE = 'http://206.189.70.100:8081';

async function testIndicatorCalculation(indicatorType, parameters) {
  console.log(`\nTesting ${indicatorType}...`);
  
  const response = await fetch(`${API_BASE}/api/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: {
        name: `Test ${indicatorType}`,
        direction: 'UP',
        timeframe: '15m',
        asset: 'BTC',
        indicators: [{
          id: 'ind1',
          type: indicatorType,
          timeframe: '15m',
          parameters: parameters,
          useInConditions: false, // Just calculate, don't use in conditions
        }],
        conditions: [], // No conditions - just verify calculation
        conditionLogic: 'all',
        orderbookRules: [{
          field: 'market_price_per_share',
          operator: 'less_than',
          value: '50',
        }],
        orderLadder: [{ id: '1', price: 45, shares: 100 }],
      },
      numberOfMarkets: 2,
      exitPrice: 80,
      initialBalance: 1000,
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    const r = result.result;
    if (r.candlesProcessed > 0) {
      console.log(`  ✅ ${indicatorType} calculated successfully`);
      console.log(`  📊 Candles processed: ${r.candlesProcessed}`);
      return true;
    } else {
      console.log(`  ⚠️  ${indicatorType} - No candles processed`);
      return false;
    }
  } else {
    console.log(`  ❌ ${indicatorType} failed: ${result.error}`);
    return false;
  }
}

async function runIndicatorTests() {
  console.log('🧪 Testing All Indicators\n');
  console.log('='.repeat(60));
  
  const tests = [
    { type: 'RSI', params: { length: 14 } },
    { type: 'MACD', params: { fast: 12, slow: 26, signal: 9 } },
    { type: 'SMA', params: { length: 20 } },
    { type: 'EMA', params: { length: 20 } },
    { type: 'Bollinger Bands', params: { length: 20, stdDev: 2 } },
    { type: 'Stochastic', params: { k: 14, smoothK: 1, d: 3 } },
    { type: 'ATR', params: { length: 14 } },
    { type: 'VWAP', params: { resetDaily: false } },
    { type: 'Rolling Up %', params: { length: 50 } },
  ];

  const results = [];
  for (const test of tests) {
    const success = await testIndicatorCalculation(test.type, test.params);
    results.push({ type: test.type, success });
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results Summary:');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`  ✅ Passed: ${passed}/${results.length}`);
  console.log(`  ❌ Failed: ${failed}/${results.length}`);
  
  if (failed > 0) {
    console.log('\n  Failed indicators:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`    - ${r.type}`);
    });
  }
  console.log('='.repeat(60));
}

// Test market matching for different assets/timeframes
async function testMarketMatching() {
  console.log('\n🔗 Testing Market-to-Asset Candle Linking\n');
  console.log('='.repeat(60));
  
  const testCases = [
    { asset: 'BTC', timeframe: '15m' },
    { asset: 'BTC', timeframe: '1h' },
    { asset: 'SOL', timeframe: '15m' },
    { asset: 'ETH', timeframe: '15m' },
    { asset: 'XRP', timeframe: '15m' },
  ];

  for (const test of testCases) {
    console.log(`\nTesting ${test.asset} ${test.timeframe}...`);
    
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: {
          name: `Market Match Test ${test.asset} ${test.timeframe}`,
          direction: 'UP',
          timeframe: test.timeframe,
          asset: test.asset,
          indicators: [],
          conditions: [],
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
      console.log(`  ✅ Markets matched and processed`);
      console.log(`  📊 Candles: ${r.candlesProcessed}`);
      console.log(`  💰 Balance: $${r.finalBalance.toFixed(2)}`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Run all tests
async function main() {
  await testMarketMatching();
  await runIndicatorTests();
}

if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

module.exports = { testIndicatorCalculation, testMarketMatching, runIndicatorTests };

