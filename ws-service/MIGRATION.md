# Migration from Old WebSocket Server

The new WebSocket service (`ws-service/`) replaces the old `server/test-websocket-server.js` with a proper layered architecture following best practices.

## Key Changes

### Architecture
- **Old**: Single file with mixed concerns
- **New**: Layered architecture with separate modules for Polymarket connector, state management, and WebSocket server

### Protocol
- **Old**: Topic-based subscriptions (`subscribe`/`unsubscribe` with `topic`)
- **New**: Market-based subscriptions (`subscribe_markets`/`unsubscribe_markets` with `markets` array)

### Message Types
- **Old**: Generic `{ topic, payload }` format
- **New**: Explicit message types: `market_snapshot`, `orderbook_update`, `trade`, `heartbeat`

### Features Added
- ✅ Exponential backoff reconnection
- ✅ Update throttling (max 10 updates/sec per market)
- ✅ Health endpoint (`/health`)
- ✅ Helper functions: `getCurrentEvent()`, `getNextEvent()`
- ✅ Proper state management with `MarketState` interface
- ✅ EventEmitter pattern for Polymarket connector

## Migration Steps

1. **Install dependencies:**
```bash
cd ws-service
npm install
```

2. **Build the service:**
```bash
npm run build
# or from root:
npm run ws:build
```

3. **Update environment variables:**
```env
NEXT_PUBLIC_WEBSOCKET_SERVER_URL=http://localhost:8081
WEBSOCKET_SERVER_HTTP_URL=http://localhost:8081
```

Note: The new service uses `/ws` path for WebSocket connections, so the client automatically appends `/ws` to the URL.

4. **Start the new service:**
```bash
npm run ws:start
# or from root:
npm run ws:start
```

5. **Update client code:**
The `WebSocketContext` has been updated to support both old and new protocols. For new code, use:
```tsx
const { subscribeMarkets, getMarketData } = useWebSocket()

useEffect(() => {
  const unsubscribe = subscribeMarkets(['BTC_15M_UP'], (data) => {
    // data.type will be 'market_snapshot', 'orderbook_update', or 'trade'
    console.log('Market update:', data)
  })
  return unsubscribe
}, [])
```

## Backward Compatibility

The old `server/test-websocket-server.js` is still available for testing. The new service maintains backward compatibility with the old topic-based protocol where possible, but new features require the new protocol.

## Testing

1. Start the new service:
```bash
npm run ws:dev
```

2. Check health:
```bash
curl http://localhost:8081/health
```

3. Test WebSocket connection (use browser console or a WebSocket client):
```javascript
const ws = new WebSocket('ws://localhost:8081/ws')
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe_markets',
    markets: ['BTC_15M_UP']
  }))
}
ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data))
}
```

