'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsCodeBlock, DocsSubheading } from '@/components/DocsPage'

export default function DevelopersOverviewPage() {
  return (
    <DocsPage
      breadcrumb="API Reference"
      title="API Overview"
      description="PolyTrade provides a comprehensive API for accessing market data, managing orders, and receiving real-time updates via WebSocket. All endpoints return JSON responses."
      tableOfContents={[
        { name: 'Base URLs', href: '#base-urls' },
        { name: 'Response Format', href: '#response-format' },
        { name: 'Rate Limits', href: '#rate-limits' },
        { name: 'Error Handling', href: '#errors' },
      ]}
      prevPage={{ name: 'Reading the Order Book', href: '/docs/learn/trading/orderbook' }}
      nextPage={{ name: 'Authentication', href: '/docs/developers/authentication' }}
    >
      <DocsNote type="info">
        <strong>WebSocket Service Required:</strong> Most API endpoints require the WebSocket 
        service to be running. See the Configuration section for setup instructions.
      </DocsNote>

      <DocsSection id="base-urls" title="Base URLs">
        <DocsParagraph>
          PolyTrade uses multiple endpoints for different services:
        </DocsParagraph>

        <DocsSubheading>Next.js API (Port 3000)</DocsSubheading>
        <DocsParagraph>
          Frontend API routes for market data and user information.
        </DocsParagraph>
        <DocsCodeBlock language="text" code="http://localhost:3000/api" />

        <DocsSubheading>WebSocket Service HTTP (Port 8081)</DocsSubheading>
        <DocsParagraph>
          Direct access to the WebSocket service HTTP endpoints.
        </DocsParagraph>
        <DocsCodeBlock language="text" code="http://localhost:8081" />

        <DocsSubheading>WebSocket Connection (Port 8081)</DocsSubheading>
        <DocsParagraph>
          Real-time data streaming via WebSocket protocol.
        </DocsParagraph>
        <DocsCodeBlock language="text" code="ws://localhost:8081/ws" />
      </DocsSection>

      <DocsSection id="response-format" title="Response Format">
        <DocsParagraph>
          All API responses follow a consistent JSON format:
        </DocsParagraph>

        <DocsCodeBlock
          language="json"
          code={`// Success response
{
  "data": { ... },
  "success": true
}

// Error response
{
  "error": "Error message description",
  "success": false
}`}
        />
      </DocsSection>

      <DocsSection id="rate-limits" title="Rate Limits">
        <DocsParagraph>
          API endpoints have rate limits to ensure fair usage:
        </DocsParagraph>

        <DocsSubheading>Public Endpoints</DocsSubheading>
        <DocsParagraph>
          100 requests per minute per IP address. Market data and prices.
        </DocsParagraph>

        <DocsSubheading>Authenticated Endpoints</DocsSubheading>
        <DocsParagraph>
          300 requests per minute per API key. Trading and user data.
        </DocsParagraph>

        <DocsNote type="warning">
          Check response headers for <code>X-RateLimit-Remaining</code> and 
          <code>X-RateLimit-Reset</code> to monitor your usage.
        </DocsNote>
      </DocsSection>

      <DocsSection id="errors" title="Error Handling">
        <DocsParagraph>
          The API uses standard HTTP status codes:
        </DocsParagraph>

        <DocsParagraph>
          <strong>200 OK</strong> — Request succeeded. Response body contains the requested data.<br />
          <strong>400 Bad Request</strong> — Invalid request parameters. Check the error message for details.<br />
          <strong>401 Unauthorized</strong> — Missing or invalid authentication. Verify your API credentials.<br />
          <strong>429 Too Many Requests</strong> — Rate limit exceeded. Wait before retrying.<br />
          <strong>500 Internal Server Error</strong> — Server-side error. Retry with exponential backoff.
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}
