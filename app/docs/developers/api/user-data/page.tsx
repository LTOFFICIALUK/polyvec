'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsEndpointCard, DocsCodeBlock, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function UserDataPage() {
  return (
    <DocsPage
      breadcrumb="API Reference"
      title="User Data API"
      description="Access user-specific data including balances, positions, orders, and trade history."
      tableOfContents={[
        { name: 'Endpoints', href: '#endpoints' },
        { name: 'Get Balance', href: '#balance' },
        { name: 'Get Positions', href: '#positions' },
        { name: 'Get Orders', href: '#orders' },
      ]}
      prevPage={{ name: 'Market Data', href: '/docs/developers/api/market-data' }}
      nextPage={{ name: 'WebSocket Connection', href: '/docs/developers/websocket/connection' }}
    >
      <DocsNote type="warning">
        All user data endpoints require valid Polymarket API credentials. See the Authentication section.
      </DocsNote>

      <DocsSection id="endpoints" title="Available Endpoints">
        <div className="border border-gray-800/50 rounded-lg overflow-hidden mb-6">
          <DocsEndpointCard method="GET" path="/api/user/balance" description="Portfolio balance" />
          <DocsEndpointCard method="GET" path="/api/user/positions" description="Open positions" />
          <DocsEndpointCard method="GET" path="/api/user/orders" description="Active orders" />
          <DocsEndpointCard method="GET" path="/api/user/trades" description="Trade history" />
          <DocsEndpointCard method="GET" path="/api/user/history" description="Full history" />
        </div>
      </DocsSection>

      <DocsSection id="balance" title="Get Balance">
        <DocsParagraph>
          Retrieve the user&apos;s portfolio and cash balances:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`curl "http://localhost:3000/api/user/balance?address=0xYourAddress"`}
        />

        <DocsSubheading>Response</DocsSubheading>
        <DocsCodeBlock
          language="json"
          code={`{
  "portfolioValue": 1250.50,
  "cashBalance": 500.00,
  "totalValue": 1750.50
}`}
        />
      </DocsSection>

      <DocsSection id="positions" title="Get Positions">
        <DocsParagraph>
          Retrieve all open positions for a user:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`curl "http://localhost:3000/api/user/positions?address=0xYourAddress"`}
        />

        <DocsSubheading>Response</DocsSubheading>
        <DocsCodeBlock
          language="json"
          code={`{
  "positions": [
    {
      "marketId": "...",
      "outcome": "YES",
      "size": 100,
      "avgPrice": 0.45,
      "currentPrice": 0.65,
      "unrealizedPnl": 20.00
    }
  ]
}`}
        />
      </DocsSection>

      <DocsSection id="orders" title="Get Orders">
        <DocsParagraph>
          Retrieve all active (unfilled) orders:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`curl "http://localhost:3000/api/user/orders?address=0xYourAddress&credentials=ENCODED_CREDENTIALS"`}
        />

        <DocsSubheading>Response</DocsSubheading>
        <DocsCodeBlock
          language="json"
          code={`{
  "orders": [
    {
      "orderId": "...",
      "marketId": "...",
      "side": "BUY",
      "outcome": "YES",
      "price": 0.60,
      "size": 50,
      "filledSize": 0,
      "status": "OPEN",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}`}
        />

        <DocsNote type="info">
          Pass API credentials as a URL-encoded JSON object in the <code>credentials</code> query parameter.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
