# Debug Endpoints for 15m and 1h Markets

This document lists all the API endpoints used to find and fetch data for BTC, XRP, SOL, and ETH markets with 15m and 1h timeframes.

## Step 1: Gamma Search - Finding Markets

### For 15m Markets

The code searches using these query variations for each pair (BTC, SOL, ETH, XRP):

**Base URL:** `https://gamma-api.polymarket.com/search`

**Query Parameters:**
- `type=market`
- `closed=false`
- `limit=100` (in clobClient.ts) or `limit=50` (in market-search/route.ts)
- `q={query}` (in clobClient.ts) or `query={query}` (in market-search/route.ts)

**15m Search Queries (for each pair: BTC, SOL, ETH, XRP):**
1. `{pair} 15m up down`
2. `{pair} 15m up or down`
3. `{pair} 15m`

**Example URLs for BTC 15m:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%2015m%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%2015m%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%2015m
```

**Example URLs for SOL 15m:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%2015m%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%2015m%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%2015m
```

**Example URLs for ETH 15m:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%2015m%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%2015m%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%2015m
```

**Example URLs for XRP 15m:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%2015m%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%2015m%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%2015m
```

### For 1h Markets

**1h Search Queries (for each pair: BTC, SOL, ETH, XRP):**
1. `{pair} 1h up down`
2. `{pair} 1h up or down`
3. `{pair} 1h`
4. `{pair} hourly up down`
5. `{pair} hourly up or down`
6. `{pair} hourly`
7. `{pair} up or down`
8. `{pair} up-or-down`

**Example URLs for BTC 1h:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%201h%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%201h%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%201h
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%20hourly%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%20hourly%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%20hourly
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=BTC%20up-or-down
```

**Example URLs for SOL 1h:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%201h%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%201h%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%201h
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%20hourly%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%20hourly%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%20hourly
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=SOL%20up-or-down
```

**Example URLs for ETH 1h:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%201h%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%201h%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%201h
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%20hourly%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%20hourly%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%20hourly
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=ETH%20up-or-down
```

**Example URLs for XRP 1h:**
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%201h%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%201h%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%201h
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%20hourly%20up%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%20hourly%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%20hourly
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%20up%20or%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q=XRP%20up-or-down
```

**Note:** There's also a difference in the query parameter name:
- `clobClient.ts` uses: `q={query}`
- `market-search/route.ts` uses: `query={query}`

So you may also want to try with `query=` instead of `q=`:
```
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=50&query=BTC%2015m%20up
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=50&query=BTC%2015m%20down
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=50&query=BTC%2015m%20next%20candle
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=50&query=BTC%2015m%20candle
https://gamma-api.polymarket.com/search?type=market&closed=false&limit=50&query=BTC%2015m
```

## Step 2: Gamma Markets Endpoint (Fallback)

This endpoint is used as a fallback to fetch all active markets, then filtered client-side.

**URL (same for both 15m and 1h):**
```
https://gamma-api.polymarket.com/markets?closed=false&limit=2000&order=id&ascending=false
```

**Alternative (from market-search/route.ts):**
```
https://gamma-api.polymarket.com/markets?closed=false&limit=500&order=id&ascending=false
```

## Step 3: Extract Token IDs from Market Response

From the Gamma search/markets response, you need to extract `clobTokenIds` from each market object. The response structure can be:
- Direct array: `[{...market1...}, {...market2...}]`
- Wrapped: `{ markets: [...] }`
- Wrapped: `{ results: [...] }`
- Wrapped: `{ data: [...] }`

Each market should have a `clobTokenIds` field which is either:
- An array: `["token1", "token2"]`
- A JSON string: `"[\"token1\", \"token2\"]"`

**Example market object structure:**
```json
{
  "id": "market-id",
  "slug": "btc-updown-15m-1764211500",
  "question": "Bitcoin Up or Down - November 27, 11:00AM-11:15AM ET",
  "clobTokenIds": ["0x123...", "0x456..."],
  "active": true,
  "closed": false,
  "acceptingOrders": true
}
```

## Step 4: Fetch Orderbooks for Token IDs

Once you have the token IDs from Step 3, fetch orderbooks using the CLOB API.

### Single Token Orderbook

**Base URL:** `https://clob.polymarket.com/book`

**Query Parameter:**
- `token_id={tokenId}`

**Example URLs:**
```
https://clob.polymarket.com/book?token_id=0x123...
https://clob.polymarket.com/book?token_id=0x456...
```

### Batch Orderbooks (Multiple Tokens)

**Base URL:** `https://clob.polymarket.com/books`

**Method:** `POST`

**Headers:**
- `Content-Type: application/json`
- `Accept: application/json`

**Body:**
```json
[
  { "token_id": "0x123..." },
  { "token_id": "0x456..." }
]
```

**Example using curl:**
```bash
curl -X POST https://clob.polymarket.com/books \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '[{"token_id":"0x123..."},{"token_id":"0x456..."}]'
```

## Step 5: Fetch Full Market Details by Slug (Optional)

If you need additional market details (like `eventStartTime`), you can fetch by slug:

**Base URL:** `https://gamma-api.polymarket.com/markets/slug/{slug}`

**Example URLs:**
```
https://gamma-api.polymarket.com/markets/slug/btc-updown-15m-1764211500
https://gamma-api.polymarket.com/markets/slug/solana-up-or-down-november-27-2pm-et
```

## Summary: Quick Reference

### 15m Markets Flow:
1. **Search:** `https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q={PAIR}%2015m%20up%20down`
2. **Extract:** `clobTokenIds` from market response
3. **Orderbook:** `https://clob.polymarket.com/book?token_id={TOKEN_ID}`

### 1h Markets Flow:
1. **Search:** `https://gamma-api.polymarket.com/search?type=market&closed=false&limit=100&q={PAIR}%201h%20up%20down` (or try hourly variations)
2. **Extract:** `clobTokenIds` from market response
3. **Orderbook:** `https://clob.polymarket.com/book?token_id={TOKEN_ID}`

### Key Differences Between 15m and 1h:
- **15m:** Uses 3 search query variations
- **1h:** Uses 8 search query variations (includes "hourly", "up or down", "up-or-down")
- **15m slug format:** `{pair}-updown-15m-{timestamp}`
- **1h slug format:** `{pair-full-name}-up-or-down-{month}-{day}-{time}-et` (e.g., `solana-up-or-down-november-27-2pm-et`)

