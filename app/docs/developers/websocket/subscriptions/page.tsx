'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsCodeBlock, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function WebSocketSubscriptionsPage() {
  return (
    <DocsPage
      breadcrumb="WebSocket"
      title="Subscriptions"
      description="Learn how to subscribe and unsubscribe to real-time data channels for prices, orderbooks, and trades."
      tableOfContents={[
        { name: 'Subscribe', href: '#subscribe' },
        { name: 'Unsubscribe', href: '#unsubscribe' },
        { name: 'Channels', href: '#channels' },
        { name: 'Examples', href: '#examples' },
      ]}
      prevPage={{ name: 'Connection', href: '/docs/developers/websocket/connection' }}
      nextPage={{ name: 'Message Types', href: '/docs/developers/websocket/messages' }}
    >
      <DocsSection id="subscribe" title="Subscribe to Channels">
        <DocsParagraph>
          Subscribe to receive real-time updates for specific markets:
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'prices',        // Channel type
  marketId: 'MARKET_ID'     // Market to subscribe to
}))`}
        />

        <DocsParagraph>
          You&apos;ll receive a confirmation message:
        </DocsParagraph>

        <DocsCodeBlock
          language="json"
          code={`{"type": "subscribed", "channel": "prices", "marketId": "..."}`}
        />
      </DocsSection>

      <DocsSection id="unsubscribe" title="Unsubscribe from Channels">
        <DocsParagraph>
          Stop receiving updates for a specific channel:
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`ws.send(JSON.stringify({
  type: 'unsubscribe',
  channel: 'prices',
  marketId: 'MARKET_ID'
}))`}
        />

        <DocsNote type="info">
          All subscriptions are automatically cleaned up when the WebSocket connection closes.
        </DocsNote>
      </DocsSection>

      <DocsSection id="channels" title="Available Channels">
        <DocsSubheading>prices</DocsSubheading>
        <DocsParagraph>
          Real-time price updates for YES and NO tokens. Updates on every trade or significant price change.
        </DocsParagraph>

        <DocsSubheading>orderbook</DocsSubheading>
        <DocsParagraph>
          Orderbook changes including new orders, fills, and cancellations. Provides bid/ask depth up to 20 levels.
        </DocsParagraph>

        <DocsSubheading>trades</DocsSubheading>
        <DocsParagraph>
          Individual trade notifications with price, size, and side. Useful for trade tape displays.
        </DocsParagraph>

        <DocsSubheading>market</DocsSubheading>
        <DocsParagraph>
          Market-level updates including status changes and resolutions. Subscribe to receive resolution notifications.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="examples" title="Subscription Examples">
        <DocsParagraph>
          Subscribe to multiple channels for comprehensive data:
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`const marketId = 'YOUR_MARKET_ID'
const channels = ['prices', 'orderbook', 'trades']

channels.forEach(channel => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel,
    marketId
  }))
})

// Track subscriptions
const subscriptions = new Map()

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  
  if (data.type === 'subscribed') {
    subscriptions.set(data.channel, data.marketId)
    console.log(\`Subscribed to \${data.channel}\`)
  }
}`}
        />
      </DocsSection>
    </DocsPage>
  )
}
