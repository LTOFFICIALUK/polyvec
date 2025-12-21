/**
 * Comprehensive step-by-step test to find the exact issue
 */

const API_BASE = 'http://206.189.70.100:8081';

async function testStepByStep() {
  console.log('\n=== COMPREHENSIVE MACD CROSSOVER TEST ===\n');
  
  const testStrategy = {
    name: 'MACD Test',
    direction: 'UP',
    timeframe: '15m',
    asset: 'BTC',
    indicators: [
      {
        id: 'ind_1766207333682',
        type: 'MACD',
        timeframe: '15m',
        parameters: { fast: 12, slow: 26, signal: 9 },
        useInConditions: true,
      },
    ],
    conditions: [
      {
        id: 'cond1',
        sourceA: 'indicator_ind_1766207333682.macd',
        operator: 'crosses above',
        sourceB: 'indicator_ind_1766207333682.signal',
        candle: 'current',
      },
    ],
    conditionLogic: 'all',
    orderbookRules: [],
    orderLadder: [
      { id: '1', price: 50, shares: 99 },
    ],
  };

  console.log('Step 1: Testing with 1 market first to see detailed logs...\n');
  
  try {
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: testStrategy,
        numberOfMarkets: 1, // Start with 1 to see detailed logs
        exitPrice: 99,
        initialBalance: 1000,
      }),
    });

    const result = await response.json();
    
    console.log('\n=== RESULTS ===');
    console.log(`Trades: ${result.result?.totalTrades || 0}`);
    console.log(`Conditions Triggered: ${result.result?.conditionsTriggered || 0}`);
    console.log(`Candles Processed: ${result.result?.candlesProcessed || 0}`);
    
    if (result.result?.totalTrades === 0) {
      console.log('\n❌ NO TRADES - Checking backend logs...\n');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testStepByStep();

