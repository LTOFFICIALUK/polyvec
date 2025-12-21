/**
 * Manual test to verify MACD crossover detection
 * This will call the backtest API and check if crossovers are being detected
 */

const API_BASE = 'http://206.189.70.100:8081';

async function testCrossoverDetection() {
  console.log('\n=== Testing MACD Crossover Detection ===\n');
  
  // Test strategy with MACD bullish crossover
  const testStrategy = {
    name: 'MACD Crossover Test',
    direction: 'UP',
    timeframe: '15m',
    asset: 'BTC',
    indicators: [
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
        sourceA: 'indicator_macd1.macd',
        operator: 'crosses above',
        sourceB: 'indicator_macd1.signal',
        candle: 'current',
      },
    ],
    conditionLogic: 'all',
    orderbookRules: [],
    orderLadder: [
      { id: '1', price: 50, shares: 100 },
    ],
  };

  console.log('Running backtest with MACD crossover condition...');
  console.log('Condition: indicator_macd1.macd crosses above indicator_macd1.signal\n');
  
  try {
    const response = await fetch(`${API_BASE}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: testStrategy,
        numberOfMarkets: 5, // Test with just 5 markets
        exitPrice: 99,
        initialBalance: 1000,
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      const r = result.result;
      console.log('✅ Backtest completed successfully');
      console.log(`\nResults:`);
      console.log(`  - Total Trades: ${r.totalTrades}`);
      console.log(`  - Conditions Triggered: ${r.conditionsTriggered}`);
      console.log(`  - Candles Processed: ${r.candlesProcessed}`);
      console.log(`  - Final Balance: $${r.finalBalance.toFixed(2)}`);
      console.log(`  - Total P&L: $${r.totalPnl.toFixed(2)}`);
      
      if (r.totalTrades === 0) {
        console.log('\n❌ PROBLEM: No trades executed despite crossovers!');
        console.log('\nThis suggests:');
        console.log('  1. Crossovers are not being detected');
        console.log('  2. Conditions are detected but trades are not executing');
        console.log('  3. Indicator values are not being calculated correctly');
      } else {
        console.log(`\n✅ SUCCESS: ${r.totalTrades} trades executed`);
        if (r.trades && r.trades.length > 0) {
          console.log('\nFirst few trades:');
          r.trades.slice(0, 5).forEach((trade, i) => {
            console.log(`  ${i + 1}. ${trade.side} at ${(trade.price * 100).toFixed(0)}¢ - ${trade.triggerReason}`);
          });
        }
      }
    } else {
      console.log('❌ Backtest failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error running backtest:', error.message);
  }
}

// Also test the chart data endpoint to see actual MACD values
async function testMACDValues() {
  console.log('\n=== Testing MACD Indicator Values ===\n');
  
  try {
    const response = await fetch(`${API_BASE}/api/backtest/chart-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset: 'BTC',
        timeframe: '15m',
        direction: 'UP',
        indicatorType: 'MACD',
        indicatorParameters: { fast: 12, slow: 26, signal: 9 },
        marketIds: [], // Will use recent markets
      }),
    });

    const result = await response.json();
    
    if (result.success && result.candles && result.indicatorData) {
      console.log(`✅ Retrieved ${result.candles.length} candles and ${result.indicatorData.length} indicator values`);
      
      // Find crossovers manually
      let crossovers = [];
      for (let i = 1; i < result.indicatorData.length; i++) {
        const prev = result.indicatorData[i - 1];
        const curr = result.indicatorData[i];
        
        if (prev && curr && prev.values && curr.values) {
          const prevMacd = prev.values.macd;
          const prevSignal = prev.values.signal;
          const currMacd = curr.values.macd;
          const currSignal = curr.values.signal;
          
          if (prevMacd !== null && prevSignal !== null && currMacd !== null && currSignal !== null) {
            // Check for bullish crossover: MACD was <= Signal, now MACD > Signal
            if (prevMacd <= prevSignal && currMacd > currSignal) {
              const timestamp = new Date(curr.timestamp).toISOString();
              crossovers.push({
                type: 'bullish',
                timestamp,
                prevMacd: prevMacd.toFixed(2),
                prevSignal: prevSignal.toFixed(2),
                currMacd: currMacd.toFixed(2),
                currSignal: currSignal.toFixed(2),
              });
            }
          }
        }
      }
      
      console.log(`\nFound ${crossovers.length} bullish MACD crossovers:`);
      crossovers.slice(0, 10).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.timestamp}: MACD ${c.prevMacd}->${c.currMacd}, Signal ${c.prevSignal}->${c.currSignal}`);
      });
      
      if (crossovers.length === 0) {
        console.log('\n❌ PROBLEM: No crossovers found in indicator data!');
        console.log('\nSample indicator values:');
        result.indicatorData.slice(0, 10).forEach((ind, i) => {
          if (ind.values) {
            console.log(`  ${i + 1}. MACD: ${ind.values.macd?.toFixed(2) || 'null'}, Signal: ${ind.values.signal?.toFixed(2) || 'null'}`);
          }
        });
      }
    } else {
      console.log('❌ Failed to retrieve chart data:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error fetching chart data:', error.message);
  }
}

// Run both tests
(async () => {
  await testMACDValues();
  await testCrossoverDetection();
})();
