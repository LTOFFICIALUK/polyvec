// Comprehensive test to diagnose exit detection and early loss issues
const http = require('http');

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
      orderLadder: [{ id: "1", price: 50, shares: 100 }]
    },
    numberOfMarkets: 5,
    exitPrice: 99,
    initialBalance: 1000
  };

  console.log('=== RUNNING BACKTEST ===\n');
  
  const response = await new Promise((resolve, reject) => {
    const req = http.request(`${API_URL}/api/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(config));
    req.end();
  });
  
  if (response.error) {
    console.log('ERROR:', response.error);
    return;
  }
  
  const result = response.result;
  console.log('=== BACKTEST RESULTS ===');
  console.log(`Total Trades: ${result.totalTrades}`);
  console.log(`Final Balance: $${result.finalBalance.toFixed(2)}`);
  console.log(`Total P&L: $${result.totalPnl.toFixed(2)}`);
  console.log(`Win Rate: ${result.winRate.toFixed(1)}%`);
  console.log(`Winning Trades: ${result.winningTrades}`);
  console.log(`Losing Trades: ${result.losingTrades}`);
  console.log('');
  
  console.log('=== ALL TRADES (with time analysis) ===');
  const trades = result.trades || [];
  
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const date = new Date(trade.timestamp);
    const timeStr = date.toISOString().replace('T', ' ').substring(0, 19);
    const price = (trade.price * 100).toFixed(0);
    const reason = trade.triggerReason || '';
    
    // Calculate time difference from previous trade
    let timeDiff = '';
    if (i > 0) {
      const prevTrade = trades[i - 1];
      const diffMs = trade.timestamp - prevTrade.timestamp;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
      timeDiff = ` (+${diffMins}m ${diffSecs}s)`;
    }
    
    console.log(`${timeStr}${timeDiff} | ${trade.side.padEnd(4)} | ${price.padStart(3)}¢ | ${trade.shares} | $${trade.value.toFixed(2)} | ${trade.pnl !== undefined ? (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2) : '-'} | ${reason.substring(0, 70)}`);
  }
  
  console.log('\n=== ANALYSIS ===');
  const buys = trades.filter(t => t.side === 'BUY');
  const sells = trades.filter(t => t.side === 'SELL');
  const losses = trades.filter(t => t.side === 'LOSS');
  
  console.log(`BUY trades: ${buys.length}`);
  console.log(`SELL trades: ${sells.length} (wins)`);
  console.log(`LOSS trades: ${losses.length}`);
  
  // Check for quick losses (within 5 minutes)
  console.log('\n=== QUICK LOSSES (within 5 minutes) ===');
  for (let i = 0; i < trades.length; i++) {
    if (trades[i].side === 'BUY' && i + 1 < trades.length && trades[i + 1].side === 'LOSS') {
      const buyTime = trades[i].timestamp;
      const lossTime = trades[i + 1].timestamp;
      const diffMs = lossTime - buyTime;
      const diffMins = diffMs / (1000 * 60);
      
      if (diffMins < 5) {
        console.log(`⚠️  Quick loss: BUY at ${new Date(buyTime).toISOString()} -> LOSS at ${new Date(lossTime).toISOString()} (${diffMins.toFixed(1)} minutes)`);
        console.log(`   Reason: ${trades[i + 1].triggerReason}`);
      }
    }
  }
  
  // Check if any trades should have won
  console.log('\n=== CHECKING FOR MISSED WINS ===');
  for (let i = 0; i < trades.length; i++) {
    if (trades[i].side === 'BUY') {
      const buy = trades[i];
      const loss = i + 1 < trades.length && trades[i + 1].side === 'LOSS' ? trades[i + 1] : null;
      
      if (loss) {
        // Extract max price from trigger reason
        const maxPriceMatch = loss.triggerReason.match(/max price: (\d+)¢/);
        if (maxPriceMatch) {
          const maxPrice = parseInt(maxPriceMatch[1]);
          if (maxPrice >= 99) {
            console.log(`❌ MISSED WIN: Trade reached ${maxPrice}¢ (above exit 99¢) but recorded as LOSS`);
            console.log(`   BUY: ${new Date(buy.timestamp).toISOString()} at ${(buy.price * 100).toFixed(0)}¢`);
            console.log(`   LOSS: ${new Date(loss.timestamp).toISOString()}`);
            console.log(`   Reason: ${loss.triggerReason}`);
          }
        }
      }
    }
  }
}

testBacktest().catch(console.error);
