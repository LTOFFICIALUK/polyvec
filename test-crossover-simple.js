/**
 * Simple test to verify the exact issue with crossover detection
 */

const API_BASE = 'http://206.189.70.100:8081';

async function test() {
  console.log('Testing with indicator ID: macd1 (not indicator_macd1)');
  
  // Test with the indicator ID as "macd1" (what gets stored)
  const testStrategy = {
    name: 'MACD Test Simple',
    direction: 'UP',
    timeframe: '15m',
    asset: 'BTC',
    indicators: [
      {
        id: 'macd1',  // This is what gets stored in the map
        type: 'MACD',
        timeframe: '15m',
        parameters: { fast: 12, slow: 26, signal: 9 },
        useInConditions: true,
      },
    ],
    conditions: [
      {
        id: 'cond1',
        sourceA: 'indicator_macd1.macd',  // Frontend sends this
        operator: 'crosses above',
        sourceB: 'indicator_macd1.signal',  // Frontend sends this
        candle: 'current',
      },
    ],
    conditionLogic: 'all',
    orderbookRules: [],
    orderLadder: [
      { id: '1', price: 50, shares: 100 },
    ],
  };

  console.log('\nStrategy:');
  console.log('  Indicator ID: macd1');
  console.log('  Condition sourceA: indicator_macd1.macd');
  console.log('  Condition sourceB: indicator_macd1.signal');
  console.log('\nExpected parsing:');
  console.log('  sourceA "indicator_macd1.macd" -> ID: "macd1", field: "macd"');
  console.log('  sourceB "indicator_macd1.signal" -> ID: "macd1", field: "signal"');
  console.log('\nRunning backtest...\n');
  
  try {
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: testStrategy,
        numberOfMarkets: 3,
        exitPrice: 99,
        initialBalance: 1000,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Backtest completed`);
      console.log(`  Trades: ${result.result.totalTrades}`);
      console.log(`  Conditions Triggered: ${result.result.conditionsTriggered}`);
      
      if (result.result.totalTrades === 0) {
        console.log('\n❌ Still no trades! The issue is confirmed.');
        console.log('\nPossible causes:');
        console.log('  1. Indicator ID mismatch (stored as "macd1" but condition looks for different ID)');
        console.log('  2. getIndicatorValue not finding values by timestamp');
        console.log('  3. Crossover logic not working correctly');
        console.log('  4. Candle close detection not working');
      }
    } else {
      console.log('❌ Backtest failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
