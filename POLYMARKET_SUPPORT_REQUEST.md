# Polymarket API Support Request: Finding Active Markets with Trading Prices (10-90c)

## Problem Summary

We are building a trading application that needs to identify and display **currently active** markets for crypto UP/DOWN pairs (BTC, SOL, ETH, XRP) with 15-minute and 1-hour timeframes. The challenge is finding markets that have **active trading prices between 10-90 cents** (0.10-0.90), not settled markets showing 0.01/0.99 prices.

## Current Implementation

### API Endpoints Used
- **Market Search**: `GET https://gamma-api.polymarket.com/markets?closed=false&limit=500&order=id&ascending=false`
- **Orderbook Data**: `GET https://clob.polymarket.com/book?token_id={tokenId}`
- **Batch Orderbooks**: `POST https://clob.polymarket.com/books`

### What We're Doing

1. **Fetching Markets**: Using Gamma API with `closed=false` filter to get active markets
2. **Filtering**: Looking for markets matching:
   - Pair: BTC, SOL, ETH, or XRP
   - Timeframe: 15m or 1h
   - Pattern: "Up or Down" markets
3. **Time Parsing**: Extracting precise 15-minute event windows from question strings (e.g., "November 27, 11:00AM-11:15AM ET")
4. **Price Checking**: Fetching orderbook data and checking if `bestBid` and `bestAsk` are between 0.10-0.90

### Current Behavior

**What Works:**
- ✅ Successfully finding markets matching pair/timeframe criteria
- ✅ Correctly parsing event times from question strings
- ✅ Accurately determining if current time is within event window
- ✅ Successfully fetching orderbook data from CLOB API

**What Doesn't Work:**
- ❌ All markets found have settled prices (0.01/0.99) even when in the correct time window
- ❌ Cannot identify which markets have active trading prices (10-90c)
- ❌ No way to distinguish between:
  - Markets that haven't started trading yet (pre-market)
  - Markets that are actively trading (what we want)
  - Markets that have already settled (outcome known)

## Example Log Output

```
[Market Filter] ✓ ACTIVE MARKET: Solana Up or Down - November 27, 11:00AM-11:15AM ET...
[Market Filter]   Event Start: 2025-11-26T16:00:00.000Z (11/26/2025, 11:00:00 AM)
[Market Filter]   Event End:   2025-11-26T16:15:00.000Z (11/26/2025, 11:15:00 AM)
[Market Filter]   Now:         2025-11-26T16:08:50.895Z (11/26/2025, 11:08:50 AM)
[Market Filter]   Time until start: -8.8 minutes, Time until end: 6.2 minutes
[Market Filter]   Prices: bid=0.01, ask=0.99
[Market Filter]   ✗ REJECTED: Market is settled (bid=0.01, ask=0.99)
```

This shows:
- Market is correctly identified as in the event window
- Current time is within the 15-minute trading window
- But prices are settled (0.01/0.99), not active (10-90c)

## Questions for Polymarket Support

### 1. Market Lifecycle & Status

**Q: How do we identify when a market is actively trading vs. pre-market vs. settled?**

- Is there a field in the Market object that indicates trading status?
- Does the `active` field mean "actively trading" or just "not closed"?
- Is there a difference between `active=true` and markets with prices in the 10-90c range?

**Q: When do markets start showing active prices (10-90c)?**

- Do prices become active when the event window starts?
- Is there a pre-market period where prices are still 0.01/0.99?
- How long before the event window do prices typically become active?

### 2. API Filtering

**Q: Can we filter markets by price range or trading status?**

- Is there a way to filter markets that have active prices (10-90c)?
- Can we filter by `liquidity_num_min` to find markets with trading activity?
- Should we use `volume_num_min` instead?

**Q: Are we using the correct API endpoints?**

- Should we use `/markets` or `/events` endpoint?
- Should we use the search endpoint instead?
- Are there other endpoints better suited for finding active trading markets?

### 3. Market Identification

**Q: How do we identify the "current" market for a given pair/timeframe?**

- For recurring daily markets (e.g., "BTC Up or Down - 15m"), how do we find today's instance?
- Should we match by date in the question string, or use `startDate`/`endDate` fields?
- Are there unique identifiers for each 15-minute window, or do they share the same market ID?

**Q: What fields should we use to determine if a market is currently active?**

- `active` field: What does this indicate?
- `closed` field: Does `closed=false` mean actively trading?
- `acceptingOrders`: Does this indicate active trading?
- `startDate`/`endDate`: Are these for the full market duration or the specific event window?

### 4. Price Data

**Q: Why are all markets showing settled prices (0.01/0.99)?**

- Are we querying the wrong tokens?
- Should we use different token IDs (UP vs DOWN tokens)?
- Is there a delay between when a market "starts" and when prices become active?

**Q: How do we get real-time prices for active markets?**

- Should we use RTDS (Real-Time Data Stream) WebSocket?
- Is the CLOB orderbook API the right source for current prices?
- Are there other endpoints that provide current market prices?

## Technical Details

### Market Format Example
```
Question: "Solana Up or Down - November 27, 11:00AM-11:15AM ET"
Market ID: 705696
Token IDs: ["0x123...", "0x456..."] (UP and DOWN tokens)
Start Date: 2025-11-26T16:02:47.453Z
End Date: 2025-11-27T16:15:00.000Z
```

### Current Filtering Logic
1. Fetch all markets with `closed=false`
2. Filter by pair (BTC/SOL/ETH/XRP) and timeframe (15m/1h)
3. Parse event time from question string (e.g., "11:00AM-11:15AM ET")
4. Check if current time is within event window
5. Fetch orderbook and check if prices are 10-90c
6. Reject if prices are settled (0.01/0.99)

### What We Need

A reliable way to:
1. **Identify** the currently active market for a pair/timeframe
2. **Determine** if that market has active trading prices (10-90c)
3. **Distinguish** between:
   - Pre-market (not yet trading)
   - Active trading (what we want)
   - Settled (outcome known)

## Documentation References

- [Gamma Structure](https://docs.polymarket.com/developers/gamma-markets-api/gamma-structure)
- [Fetch Markets Guide](https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide)
- [List Markets API](https://docs.polymarket.com/api-reference/markets/list-markets)
- [CLOB Orderbook API](https://docs.polymarket.com/api-reference/orderbook/get-order-book-summary)

## Sample API Request

```bash
curl "https://gamma-api.polymarket.com/markets?closed=false&limit=500&order=id&ascending=false"
```

## Sample Market Response

```json
{
  "id": "705696",
  "question": "Solana Up or Down - November 27, 11:00AM-11:15AM ET",
  "active": true,
  "closed": false,
  "acceptingOrders": true,
  "startDate": "2025-11-26T16:02:47.453Z",
  "endDate": "2025-11-27T16:15:00.000Z",
  "clobTokenIds": ["0x123...", "0x456..."],
  "liquidity": "1000",
  "volume": "5000"
}
```

## Next Steps

We would appreciate guidance on:
1. Which fields/endpoints to use for identifying actively trading markets
2. How to filter for markets with prices in the 10-90c range
3. Best practices for finding the "current" market for recurring events
4. Any additional documentation or examples for this use case

Thank you for your assistance!

