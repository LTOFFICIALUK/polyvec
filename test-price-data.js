// Test to check actual price data in database
const { Pool } = require('pg');

const pool = new Pool({
  host: '206.189.70.100',
  port: 5432,
  database: 'polytrade',
  user: 'postgres',
  password: process.env.DB_PASSWORD || 'your_password_here',
});

async function checkPriceData() {
  try {
    console.log('=== CHECKING PRICE DATA IN DATABASE ===\n');
    
    // Get recent markets that were used in backtest
    const result = await pool.query(`
      SELECT 
        market_id,
        event_start,
        event_end,
        jsonb_array_length(prices) as price_count,
        (
          SELECT MAX((p->>'yb')::int)
          FROM jsonb_array_elements(prices) p
        ) as max_yes_bid,
        (
          SELECT MIN((p->>'yb')::int)
          FROM jsonb_array_elements(prices) p
        ) as min_yes_bid
      FROM price_events
      WHERE event_end < NOW() - INTERVAL '5 minutes'
        AND jsonb_array_length(prices) > 100
      ORDER BY event_start DESC
      LIMIT 10
    `);
    
    console.log(`Found ${result.rows.length} recent markets\n`);
    
    for (const row of result.rows) {
      console.log(`Market: ${row.market_id.substring(0, 25)}...`);
      console.log(`  Event: ${new Date(row.event_start).toISOString()} - ${new Date(row.event_end).toISOString()}`);
      console.log(`  Price points: ${row.price_count}`);
      console.log(`  Price range: ${row.min_yes_bid}¢ - ${row.max_yes_bid}¢`);
      
      // Check if max price reached 99¢
      if (row.max_yes_bid >= 99) {
        console.log(`  ✅ REACHED 99¢+ (max: ${row.max_yes_bid}¢)`);
      } else {
        console.log(`  ❌ Never reached 99¢ (max: ${row.max_yes_bid}¢)`);
      }
      console.log('');
    }
    
    // Check specific markets that had losses
    console.log('=== CHECKING MARKETS FROM BACKTEST ===\n');
    const backtestResult = await pool.query(`
      SELECT DISTINCT market_id
      FROM price_events
      WHERE event_start >= '2025-12-19 07:00:00'
        AND event_start <= '2025-12-20 03:15:00'
        AND jsonb_array_length(prices) > 100
      ORDER BY event_start DESC
      LIMIT 10
    `);
    
    for (const row of backtestResult.rows) {
      const priceResult = await pool.query(`
        SELECT 
          MAX((p->>'yb')::int) as max_price,
          MIN((p->>'yb')::int) as min_price,
          COUNT(*) as count
        FROM price_events, jsonb_array_elements(prices) p
        WHERE market_id = $1
      `, [row.market_id]);
      
      if (priceResult.rows.length > 0) {
        const stats = priceResult.rows[0];
        console.log(`Market ${row.market_id.substring(0, 25)}...`);
        console.log(`  Max price: ${stats.max_price}¢, Min: ${stats.min_price}¢, Points: ${stats.count}`);
        if (stats.max_price >= 99) {
          console.log(`  ✅ SHOULD HAVE WON (reached ${stats.max_price}¢)`);
        }
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkPriceData().catch(console.error);
