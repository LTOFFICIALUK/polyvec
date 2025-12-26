'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsCodeBlock, DocsSubheading } from '@/components/DocsPage'

export default function WebSocketConnectionPage() {
  return (
    <DocsPage
      breadcrumb="WebSocket"
      title="WebSocket Connection"
      description="Connect to the PolyVec WebSocket server for real-time price updates, orderbook changes, and trade notifications."
      tableOfContents={[
        { name: 'Connection', href: '#connection' },
        { name: 'Health Check', href: '#health' },
        { name: 'Reconnection', href: '#reconnection' },
        { name: 'Example', href: '#example' },
      ]}
      prevPage={{ name: 'User Data', href: '/docs/developers/api/user-data' }}
      nextPage={{ name: 'Subscriptions', href: '/docs/developers/websocket/subscriptions' }}
    >
      <DocsSection id="connection" title="Establishing Connection">
        <DocsParagraph>
          Connect to the WebSocket server at <code>ws://localhost:8081/ws</code>:
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`const ws = new WebSocket('ws://localhost:8081/ws')

ws.onopen = () => {
  console.log('Connected to PolyVec WebSocket')
}

ws.onerror = (error) => {
  console.error('WebSocket error:', error)
}

ws.onclose = (event) => {
  console.log('WebSocket closed:', event.code, event.reason)
}`}
        />

        <DocsNote type="info">
          The WebSocket connection itself doesn&apos;t require authentication. However, some message types may require credentials.
        </DocsNote>
      </DocsSection>

      <DocsSection id="health" title="Health Check">
        <DocsParagraph>
          Verify the WebSocket service is running before attempting to connect:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`curl http://localhost:8081/health

# Response
{"status":"ok"}`}
        />

        <DocsParagraph>
          If the health check fails, start the WebSocket service:
        </DocsParagraph>

        <DocsCodeBlock language="bash" code="cd ws-service && npm run start" />
      </DocsSection>

      <DocsSection id="reconnection" title="Reconnection Strategy">
        <DocsParagraph>
          Implement automatic reconnection for robust applications:
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`class WebSocketClient {
  constructor(url) {
    this.url = url
    this.reconnectDelay = 1000
    this.maxReconnectDelay = 30000
    this.connect()
  }

  connect() {
    this.ws = new WebSocket(this.url)
    
    this.ws.onopen = () => {
      console.log('Connected')
      this.reconnectDelay = 1000 // Reset on success
      this.resubscribe()
    }
    
    this.ws.onclose = () => {
      console.log(\`Reconnecting in \${this.reconnectDelay}ms\`)
      setTimeout(() => this.connect(), this.reconnectDelay)
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay
      )
    }
  }
  
  resubscribe() {
    // Re-subscribe to previously subscribed channels
  }
}`}
        />

        <DocsNote type="tip">
          Double the reconnection delay on each failure (up to a maximum) to avoid overwhelming the server.
        </DocsNote>
      </DocsSection>

      <DocsSection id="example" title="Complete Example">
        <DocsCodeBlock
          language="javascript"
          code={`const ws = new WebSocket('ws://localhost:8081/ws')

ws.onopen = () => {
  console.log('Connected!')
  
  // Subscribe to market data
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'prices',
    marketId: 'YOUR_MARKET_ID'
  }))
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  
  switch (data.type) {
    case 'price_update':
      console.log('Price:', data.price)
      break
    case 'orderbook_update':
      console.log('Orderbook:', data.bids, data.asks)
      break
  }
}

ws.onclose = () => {
  console.log('Disconnected')
}`}
        />
      </DocsSection>
    </DocsPage>
  )
}
