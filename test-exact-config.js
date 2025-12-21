/**
 * Test with user's exact backtest configuration
 */

const API_BASE = 'http://206.189.70.100:8081';

async function testExactConfig() {
  console.log('\n=== Testing with EXACT User Configuration ===\n');
  
  // User's exact config
  const testStrategy = {
    name: 'MACD Crossover Test',
    direction: 'UP',
    timeframe: '15m',
    asset: 'BTC',
    indicators: [
      {
        id: 'ind_1766207333682',  // User's indicator ID
        type: 'MACD',
        timeframe: '15m',
        parameters: { fast: 12, slow: 26, signal: 9 },
        useInConditions: true,
      },
    ],
    conditions: [
      {
        id: 'cond1',
        sourceA: 'indicator_ind_1766207333682.macd',  // User's condition
        operator: 'crosses above',
        sourceB: 'indicator_ind_1766207333682.signal',  // User's condition
        candle: 'current',
      },
    ],
    conditionLogic: 'all',
    orderbookRules: [],
    orderLadder: [
      { id: '1', price: 50, shares: 99 },
    ],
  };

  console.log('Configuration:');
  console.log('  Indicator ID: ind_1766207333682');
  console.log('  Condition sourceA: indicator_ind_1766207333682.macd');
  console.log('  Condition sourceB: indicator_ind_1766207333682.signal');
  console.log('  Markets: 50');
  console.log('  Exit Price: 99¢');
  console.log('  Order Ladder: 50¢ @ 99 shares\n');
  
  console.log('Expected parsing:');
  console.log('  sourceA "indicator_ind_1766207333682.macd" -> ID: "ind_1766207333682", field: "macd"');
  console.log('  sourceB "indicator_ind_1766207333682.signal" -> ID: "ind_1766207333682", field: "signal"\n');
  
  try {
    console.log('Running backtest...\n');
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: testStrategy,
        numberOfMarkets: 50,
        exitPrice: 99,
        initialBalance: 1000,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      const r = result.result;
      console.log('✅ Backtest completed');
      console.log(`\nResults:`);
      console.log(`  Trades: ${r.totalTrades}`);
      console.log(`  Conditions Triggered: ${r.conditionsTriggered}`);
      console.log(`  Candles Processed: ${r.candlesProcessed}`);
      console.log(`  Final Balance: $${r.finalBalance.toFixed(2)}`);
      console.log(`  Total P&L: $${r.totalPnl.toFixed(2)}`);
      
      if (r.totalTrades === 0) {
        console.log('\n❌ PROBLEM CONFIRMED: No trades executed!');
        console.log('\nThis means:');
        console.log('  1. Either crossovers are not being detected');
        console.log('  2. Or conditions are detected but trades are not executing');
        console.log('  3. Or indicator values are not being found');
      } else {
        console.log(`\n✅ SUCCESS: ${r.totalTrades} trades executed!`);
        if (r.trades && r.trades.length > 0) {
          console.log('\nFirst 5 trades:');
          r.trades.slice(0, 5).forEach((trade, i) => {
            console.log(`  ${i + 1}. ${trade.side} at ${(trade.price * 100).toFixed(0)}¢ - ${trade.triggerReason}`);
          });
        }
      }
    } else {
      console.log('❌ Backtest failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testExactConfig();
