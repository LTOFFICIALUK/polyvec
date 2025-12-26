# PolyVec WebSocket Service

Real-time data bus between Polymarket and the PolyVec frontend/strategy engine.

## Architecture

This service follows a layered architecture:

```
/ws-service/src
  /polymarket
    clobClient.ts      - HTTP client for Polymarket APIs
    subscriptions.ts   - WebSocket connections to Polymarket (RTDS + CLOB)
  /state
    marketsState.ts    - In-memory state store for market data
    orderbookCache.ts - Orderbook cache
  /ws
    server.ts         - WebSocket server for frontend connections
    messageTypes.ts   - Protocol message definitions
  index.ts            - Main entry point
```

## Features

- ✅ Connects to Polymarket RTDS and CLOB WebSocket endpoints
- ✅ Maintains in-memory state for all tracked markets
- ✅ Broadcasts real-time updates to connected clients
- ✅ Throttles updates (max 10 updates/sec per market)
- ✅ Exponential backoff reconnection
- ✅ Health endpoint for monitoring
- ✅ Helper functions: `getCurrentEvent()`, `getNextEvent()`

## Setup

1. Install dependencies:
```bash
cd ws-service
npm install
```

2. Build:
```bash
npm run build
```

3. Run:
```bash
npm start
# or for development:
npm run dev
```

## Environment Variables

```env
PORT=8080              # WebSocket port (not used, server uses HTTP_PORT)
HTTP_PORT=8081         # HTTP server port (also serves WebSocket on /ws)
POLYMARKET_CLOB_API=https://clob.polymarket.com
POLYMARKET_API=https://api.polymarket.com
POLYMARKET_DATA_API=https://data-api.polymarket.com
POLYMARKET_CLOB_WS=wss://ws-subscriptions-clob.polymarket.com/ws/
POLYMARKET_RTDS_WS=wss://ws-live-data.polymarket.com
```

## WebSocket Protocol

### Client → Server

```json
// Subscribe to markets
{ "type": "subscribe_markets", "markets": ["BTC_15M_UP", "BTC_15M_DOWN"] }

// Unsubscribe
{ "type": "unsubscribe_markets", "markets": ["BTC_15M_UP"] }

// Ping
{ "type": "ping" }
```

### Server → Client

```json
// Market snapshot
{
  "type": "market_snapshot",
  "marketId": "BTC_15M_UP",
  "bestBid": 0.32,
  "bestAsk": 0.33,
  "lastPrice": 0.31,
  "ts": 1732624000
}

// Orderbook update
{
  "type": "orderbook_update",
  "marketId": "BTC_15M_UP",
  "bids": [{ "price": 0.32, "size": 100 }],
  "asks": [{ "price": 0.33, "size": 150 }],
  "ts": 1732624000
}

// Trade
{
  "type": "trade",
  "marketId": "BTC_15M_UP",
  "price": 0.31,
  "size": 50,
  "side": "buy",
  "ts": 1732624000
}

// Heartbeat
{ "type": "heartbeat", "ts": 1732624000 }
```

## HTTP Endpoints

### Health Check

```
GET /health
```

Returns:
```json
{
  "polymarket_connection": "up",
  "markets_tracked": 42,
  "last_update_age_ms": {
    "BTC_15M_UP": 120,
    "BTC_15M_DOWN": 95
  },
  "clients_connected": 3
}
```

## Integration

### Frontend

The React `WebSocketContext` automatically connects to this service. Use:

```tsx
const { subscribeMarkets, getMarketData } = useWebSocket()

useEffect(() => {
  const unsubscribe = subscribeMarkets(['BTC_15M_UP'], (data) => {
    console.log('Market update:', data)
  })
  return unsubscribe
}, [])
```

### Strategy Engine

The state store can be accessed directly (same process) or via Redis pub/sub (separate service).

## Development

```bash
# Watch mode
npm run watch

# Development mode (with ts-node)
npm run dev
```

## Production

```bash
npm run build
npm start
```

