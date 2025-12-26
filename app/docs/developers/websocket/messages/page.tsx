'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsCodeBlock, DocsSubheading } from '@/components/DocsPage'

export default function WebSocketMessagesPage() {
  return (
    <DocsPage
      breadcrumb="WebSocket"
      title="Message Types"
      description="Reference for all WebSocket message types sent and received by the PolyVec server."
      tableOfContents={[
        { name: 'Server Messages', href: '#server-messages' },
        { name: 'Client Messages', href: '#client-messages' },
        { name: 'Message Format', href: '#format' },
        { name: 'Handling Example', href: '#handling' },
      ]}
      prevPage={{ name: 'Subscriptions', href: '/docs/developers/websocket/subscriptions' }}
      nextPage={{ name: 'Environment Setup', href: '/docs/setup/environment' }}
    >
      <DocsSection id="server-messages" title="Server to Client Messages">
        <DocsSubheading>price_update</DocsSubheading>
        <DocsParagraph>
          Sent when market prices change:
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          code={`{
  "type": "price_update",
  "marketId": "...",
  "yesPrice": 0.65,
  "noPrice": 0.35,
  "timestamp": "2024-01-15T10:30:00Z"
}`}
        />

        <DocsSubheading>orderbook_update</DocsSubheading>
        <DocsParagraph>
          Sent when orderbook changes:
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          code={`{
  "type": "orderbook_update",
  "marketId": "...",
  "bids": [{"price": 0.64, "size": 1000}],
  "asks": [{"price": 0.66, "size": 800}],
  "timestamp": "2024-01-15T10:30:00Z"
}`}
        />

        <DocsSubheading>trade</DocsSubheading>
        <DocsParagraph>
          Sent when a trade executes:
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          code={`{
  "type": "trade",
  "marketId": "...",
  "price": 0.65,
  "size": 100,
  "side": "BUY",
  "outcome": "YES",
  "timestamp": "2024-01-15T10:30:00Z"
}`}
        />

        <DocsSubheading>market_resolved</DocsSubheading>
        <DocsParagraph>
          Sent when a market resolves:
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          code={`{
  "type": "market_resolved",
  "marketId": "...",
  "outcome": "YES",
  "timestamp": "2024-01-15T10:30:00Z"
}`}
        />
      </DocsSection>

      <DocsSection id="client-messages" title="Client to Server Messages">
        <DocsSubheading>subscribe</DocsSubheading>
        <DocsParagraph>
          Subscribe to a channel:
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          code={`{
  "type": "subscribe",
  "channel": "prices",
  "marketId": "..."
}`}
        />

        <DocsSubheading>unsubscribe</DocsSubheading>
        <DocsParagraph>
          Unsubscribe from a channel:
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          code={`{
  "type": "unsubscribe",
  "channel": "prices",
  "marketId": "..."
}`}
        />

        <DocsSubheading>ping</DocsSubheading>
        <DocsParagraph>
          Keep connection alive:
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          code={`{
  "type": "ping"
}`}
        />
      </DocsSection>

      <DocsSection id="format" title="Message Format">
        <DocsParagraph>
          All messages are JSON objects with a required <code>type</code> field:
        </DocsParagraph>

        <DocsCodeBlock
          language="typescript"
          code={`interface WebSocketMessage {
  type: string
  marketId?: string
  channel?: string
  timestamp?: string
  [key: string]: unknown
}`}
        />
      </DocsSection>

      <DocsSection id="handling" title="Message Handling Example">
        <DocsCodeBlock
          language="javascript"
          code={`ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  
  switch (message.type) {
    case 'price_update':
      updatePriceDisplay(message.yesPrice, message.noPrice)
      break
      
    case 'orderbook_update':
      updateOrderbook(message.bids, message.asks)
      break
      
    case 'trade':
      addToTradeTape(message)
      break
      
    case 'market_resolved':
      handleResolution(message.outcome)
      break
      
    case 'subscribed':
      console.log(\`Subscribed to \${message.channel}\`)
      break
      
    case 'error':
      console.error('WebSocket error:', message.error)
      break
      
    default:
      console.log('Unknown message type:', message.type)
  }
}`}
        />
      </DocsSection>
    </DocsPage>
  )
}
