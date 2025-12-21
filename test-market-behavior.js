// Test to understand current backtest behavior
const fetch = require('node-fetch');

const API_URL = 'http://206.189.70.100:8081';

async function testBacktest() {
  const config = {
    strategy: {
      name: "MACD Test",
      direction: "UP",
      timeframe: "15m",
      asset: "BTC",
      indicators: [{
        id: "ind_macd",
        type: "MACD",
        timeframe: "15m",
        parameters: { fast: 12, slow: 26, signal: 9 },
        useInConditions: true
      }],
      conditions: [{
        id: "cond1",
        sourceA: "indicator_ind_macd.macd",
        operator: "crosses above",
        sourceB: "indicator_ind_macd.signal",
        candle: "current"
      }],
      conditionLogic: "all",
      orderbookRules: [],
      orderLadder: [{ id: "1", price: 40, shares: 100 }]
    },
    numberOfMarkets: 5,
    exitPrice: 99,
    initialBalance: 1000
  };

  console.log('Running backtest with 5 markets...\n');
  
  const response = await fetch(`${API_URL}/api/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  
  const data = await response.json();
  
  if (data.error) {
    console.log('ERROR:', data.error);
    return;
  }
  
  const result = data.result;
  console.log('=== BACKTEST RESULTS ===');
  console.log(`Total Trades: ${result.totalTrades}`);
  console.log(`Conditions Triggered: ${result.conditionsTriggered}`);
  console.log(`Final Balance: $${result.finalBalance.toFixed(2)}`);
  console.log(`Total P&L: $${result.totalPnl.toFixed(2)}`);
  console.log(`Win Rate: ${result.winRate.toFixed(1)}%`);
  console.log(`Candles Processed: ${result.candlesProcessed}`);
  console.log('');
  
  console.log('=== TRADE DETAILS ===');
  if (result.trades && result.trades.length > 0) {
    for (const trade of result.trades) {
      const date = new Date(trade.timestamp).toISOString();
      const price = (trade.price * 100).toFixed(0);
      console.log(`${date} | ${trade.side.padEnd(4)} | ${price}¢ | ${trade.shares} shares | $${trade.balance.toFixed(2)} | ${trade.triggerReason.substring(0, 60)}...`);
    }
  } else {
    console.log('No trades executed');
  }
  
  console.log('\n=== ANALYSIS ===');
  const buys = result.trades?.filter(t => t.side === 'BUY') || [];
  const sells = result.trades?.filter(t => t.side === 'SELL') || [];
  console.log(`BUY trades: ${buys.length}`);
  console.log(`SELL trades: ${sells.length}`);
  
  // Check if buys and sells are paired correctly
  if (buys.length > 0 && sells.length > 0) {
    console.log('\nBuy/Sell pairing:');
    for (let i = 0; i < Math.max(buys.length, sells.length); i++) {
      const buy = buys[i];
      const sell = sells[i];
      if (buy && sell) {
        const buyTime = new Date(buy.timestamp);
        const sellTime = new Date(sell.timestamp);
        const timeDiff = (sellTime - buyTime) / (1000 * 60); // minutes
        console.log(`  Pair ${i+1}: BUY at ${buyTime.toISOString()} → SELL at ${sellTime.toISOString()} (${timeDiff.toFixed(1)} min apart)`);
      } else if (buy) {
        console.log(`  Pair ${i+1}: BUY at ${new Date(buy.timestamp).toISOString()} → NO MATCHING SELL`);
      } else if (sell) {
        console.log(`  Pair ${i+1}: NO MATCHING BUY → SELL at ${new Date(sell.timestamp).toISOString()}`);
      }
    }
  }
}

testBacktest().catch(console.error);
