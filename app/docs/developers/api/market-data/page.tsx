'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsEndpointCard, DocsCodeBlock, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function MarketDataPage() {
  return (
    <DocsPage
      breadcrumb="API Reference"
      title="Market Data API"
      description="Access real-time and historical market data including prices, orderbooks, and market information."
      tableOfContents={[
        { name: 'Endpoints', href: '#endpoints' },
        { name: 'Get Prices', href: '#get-prices' },
        { name: 'Get Orderbook', href: '#get-orderbook' },
        { name: 'Price History', href: '#price-history' },
      ]}
      prevPage={{ name: 'Authentication', href: '/docs/developers/authentication' }}
      nextPage={{ name: 'User Data', href: '/docs/developers/api/user-data' }}
    >
      <DocsSection id="endpoints" title="Available Endpoints">
        <div className="border border-gray-800/50 rounded-lg overflow-hidden mb-6">
          <DocsEndpointCard method="GET" path="/api/polymarket/market-search" description="Search markets" />
          <DocsEndpointCard method="GET" path="/api/polymarket/prices" description="Get token prices" />
          <DocsEndpointCard method="GET" path="/api/polymarket/orderbook" description="Get orderbook" />
          <DocsEndpointCard method="GET" path="/api/polymarket/price-history" description="Price history" />
          <DocsEndpointCard method="GET" path="/api/polymarket/spreads" description="Bid-ask spreads" />
          <DocsEndpointCard method="GET" path="/api/polymarket/market-details" description="Market info" />
        </div>
      </DocsSection>

      <DocsSection id="get-prices" title="Get Market Prices">
        <DocsParagraph>
          Retrieve current prices for one or more tokens:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`# Single token
curl "http://localhost:3000/api/polymarket/prices?tokenId=TOKEN_ID"

# Multiple tokens
curl "http://localhost:3000/api/polymarket/prices?tokenIds=TOKEN1,TOKEN2"`}
        />

        <DocsSubheading>Response</DocsSubheading>
        <DocsCodeBlock
          language="json"
          code={`{
  "price": 0.65,
  "timestamp": "2024-01-15T10:30:00Z",
  "tokenId": "TOKEN_ID"
}`}
        />
      </DocsSection>

      <DocsSection id="get-orderbook" title="Get Orderbook">
        <DocsParagraph>
          Retrieve the current orderbook for a market:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`curl "http://localhost:3000/api/polymarket/orderbook?tokenId=TOKEN_ID"`}
        />

        <DocsSubheading>Response</DocsSubheading>
        <DocsCodeBlock
          language="json"
          code={`{
  "bids": [
    { "price": 0.64, "size": 1000 },
    { "price": 0.63, "size": 500 }
  ],
  "asks": [
    { "price": 0.66, "size": 800 },
    { "price": 0.67, "size": 1200 }
  ],
  "spread": 0.02
}`}
        />

        <DocsNote type="tip">
          The orderbook returns up to 20 levels by default. Use <code>?depth=50</code> for more levels.
        </DocsNote>
      </DocsSection>

      <DocsSection id="price-history" title="Price History">
        <DocsParagraph>
          Retrieve historical price data for charting:
        </DocsParagraph>

        <DocsCodeBlock
          language="bash"
          code={`curl "http://localhost:3000/api/polymarket/price-history?tokenId=TOKEN_ID&startDate=2024-01-01&endDate=2024-01-15"`}
        />

        <DocsSubheading>Response</DocsSubheading>
        <DocsCodeBlock
          language="json"
          code={`{
  "history": [
    {
      "timestamp": "2024-01-15T10:00:00Z",
      "price": 0.65,
      "volume": 5000
    },
    {
      "timestamp": "2024-01-15T09:00:00Z",
      "price": 0.63,
      "volume": 3200
    }
  ]
}`}
        />
      </DocsSection>
    </DocsPage>
  )
}
