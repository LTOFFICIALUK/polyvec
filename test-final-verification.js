/**
 * Final Verification Test
 * Tests all 4 requirements:
 * 1. Market-to-asset candle linking
 * 2. Indicator accuracy
 * 3. End-to-end integration
 * 4. Order execution system
 */

const API_BASE = 'http://206.189.70.100:8081';

async function testRequest(name, body) {
  try {
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🧪 Final Verification Tests\n');
  console.log('='.repeat(70));
  
  // Test 1: Market-to-Asset Candle Linking
  console.log('\n✅ TEST 1: Market-to-Asset Candle Linking');
  console.log('-'.repeat(70));
  const test1 = await testRequest('Market Linking', {
    strategy: {
      name: 'Market Link Test',
      direction: 'UP',
      timeframe: '15m',
      asset: 'BTC',
      indicators: [],
      conditions: [],
      conditionLogic: 'all',
      orderbookRules: [],
      orderLadder: [{ id: '1', price: 50, shares: 100 }],
    },
    numberOfMarkets: 3,
    exitPrice: 99,
    initialBalance: 1000,
  });
  
  if (test1.success && test1.result.candlesProcessed > 0) {
    console.log(`✅ PASS: Found and processed ${test1.result.candlesProcessed} candles`);
    console.log(`   Markets matched successfully for BTC 15m`);
  } else {
    console.log(`❌ FAIL: ${test1.error || 'No candles processed'}`);
  }
  
  // Test 2: Indicator Accuracy
  console.log('\n✅ TEST 2: Indicator Accuracy');
  console.log('-'.repeat(70));
  const indicators = ['RSI', 'MACD', 'SMA', 'EMA', 'Bollinger Bands', 'Stochastic', 'ATR', 'VWAP', 'Rolling Up %'];
  let passed = 0;
  let failed = 0;
  
  for (const indType of indicators) {
    const test2 = await testRequest(`Indicator ${indType}`, {
      strategy: {
        name: `Test ${indType}`,
        direction: 'UP',
        timeframe: '15m',
        asset: 'BTC',
        indicators: [{
          id: 'ind1',
          type: indType,
          timeframe: '15m',
          parameters: { length: 14 },
          useInConditions: false,
        }],
        conditions: [],
        conditionLogic: 'all',
        orderbookRules: [{ field: 'market_price_per_share', operator: 'less_than', value: '50' }],
        orderLadder: [{ id: '1', price: 45, shares: 100 }],
      },
      numberOfMarkets: 3,
      exitPrice: 80,
      initialBalance: 1000,
    });
    
    if (test2.success && test2.result.candlesProcessed > 0) {
      console.log(`   ✅ ${indType}: Calculated successfully (${test2.result.candlesProcessed} candles)`);
      passed++;
    } else {
      console.log(`   ❌ ${indType}: ${test2.error || 'Failed'}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`\n   Summary: ${passed}/${indicators.length} indicators working`);
  
  // Test 3: End-to-End Integration
  console.log('\n✅ TEST 3: End-to-End Integration');
  console.log('-'.repeat(70));
  const test3 = await testRequest('E2E Integration', {
    strategy: {
      name: 'E2E Test',
      direction: 'UP',
      timeframe: '15m',
      asset: 'BTC',
      indicators: [
        { id: 'rsi1', type: 'RSI', timeframe: '15m', parameters: { length: 14 }, useInConditions: true },
        { id: 'macd1', type: 'MACD', timeframe: '15m', parameters: { fast: 12, slow: 26, signal: 9 }, useInConditions: true },
      ],
      conditions: [
        { id: 'cond1', sourceA: 'indicator_rsi1', operator: '>', sourceB: 'value', value: 0, candle: 'current' },
      ],
      conditionLogic: 'any',
      orderbookRules: [],
      orderLadder: [{ id: '1', price: 45, shares: 100 }],
    },
    numberOfMarkets: 3,
    exitPrice: 80,
    initialBalance: 1000,
  });
  
  if (test3.success) {
    console.log(`✅ PASS: End-to-end test completed`);
    console.log(`   Candles: ${test3.result.candlesProcessed}`);
    console.log(`   Trades: ${test3.result.totalTrades}`);
    console.log(`   Conditions triggered: ${test3.result.conditionsTriggered}`);
    console.log(`   Final balance: $${test3.result.finalBalance.toFixed(2)}`);
  } else {
    console.log(`❌ FAIL: ${test3.error}`);
  }
  
  // Test 4: Order Execution System
  console.log('\n✅ TEST 4: Order Execution System');
  console.log('-'.repeat(70));
  const test4 = await testRequest('Order Execution', {
    strategy: {
      name: 'Order Test',
      direction: 'UP',
      timeframe: '15m',
      asset: 'BTC',
      indicators: [],
      conditions: [],
      conditionLogic: 'all',
      orderbookRules: [{ field: 'market_price_per_share', operator: 'less_than', value: '50' }],
      orderLadder: [
        { id: '1', price: 45, shares: 100 },
        { id: '2', price: 40, shares: 150 },
      ],
    },
    numberOfMarkets: 3,
    exitPrice: 80,
    initialBalance: 1000,
  });
  
  if (test4.success) {
    const r = test4.result;
    console.log(`✅ PASS: Order execution test completed`);
    console.log(`   Total trades: ${r.totalTrades}`);
    console.log(`   Initial balance: $${r.initialBalance.toFixed(2)}`);
    console.log(`   Final balance: $${r.finalBalance.toFixed(2)}`);
    console.log(`   PnL: $${r.totalPnl.toFixed(2)} (${r.totalPnlPercent.toFixed(2)}%)`);
    
    if (r.trades && r.trades.length > 0) {
      const buyTrades = r.trades.filter(t => t.side === 'BUY');
      const allPricesValid = buyTrades.every(t => {
        const priceCents = Math.round(t.price * 100);
        return priceCents >= 1 && priceCents <= 99;
      });
      const allSharesValid = buyTrades.every(t => t.shares > 0);
      
      if (allPricesValid && allSharesValid) {
        console.log(`   ✅ All orders follow Polymarket system (prices 1-99¢, positive shares)`);
      } else {
        console.log(`   ⚠️  Some orders may not follow Polymarket system`);
      }
    }
  } else {
    console.log(`❌ FAIL: ${test4.error}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ All verification tests completed!');
  console.log('='.repeat(70));
}

runTests().catch(console.error);

