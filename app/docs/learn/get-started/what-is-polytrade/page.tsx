'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsList, DocsSubheading } from '@/components/DocsPage'

export default function WhatIsPolyTradePage() {
  return (
    <DocsPage
      breadcrumb="Get Started"
      title="What is PolyTrade?"
      description="PolyTrade is a professional trading terminal for Polymarket, the world's largest prediction market. It provides advanced tools for trading crypto price prediction events with real-time data, historical charts, and sophisticated order management."
      tableOfContents={[
        { name: 'Quick Overview', href: '#quick-overview' },
        { name: 'Understanding Prices', href: '#understanding-prices' },
        { name: 'Making Money', href: '#making-money' },
        { name: 'Key Features', href: '#key-features' },
      ]}
      nextPage={{ name: 'How to Sign-Up', href: '/docs/learn/get-started/how-to-sign-up' }}
    >
      <DocsParagraph>
        Unlike basic trading interfaces, PolyTrade offers a terminal-style experience with live orderbook data, 
        WebSocket price streaming, and deep market analysis tools. Our platform connects directly to Polymarket&apos;s 
        CLOB (Central Limit Order Book) for lightning-fast trade execution.
      </DocsParagraph>

      <DocsSection id="quick-overview" title="Quick Overview">
        <DocsList items={[
          { title: 'Buy and sell shares', description: 'representing crypto price prediction outcomes (e.g., "Will BTC close above $100k in the next hour?")' },
          { title: 'Always priced between 0.00 and 1.00 USDC.e', description: 'every pair of event outcomes (YES + NO shares) is fully collateralized by $1.00 USDC.e' },
          { title: 'Shares created on agreement', description: 'when opposing sides come to an agreement on odds, such that the sum equals $1.00' },
          { title: 'Market resolution payout', description: 'shares representing the correct outcome are paid out $1.00 USDC.e each' },
        ]} />
      </DocsSection>

      <DocsSection id="understanding-prices" title="Understanding Prices">
        <DocsParagraph>
          Prices on PolyTrade represent the market&apos;s belief in the probability of an outcome. A YES share 
          priced at $0.75 means the market thinks there&apos;s approximately a 75% chance that outcome will occur.
        </DocsParagraph>
        
        <DocsNote type="tip">
          <strong>Example Trade:</strong> If you buy a YES share at $0.35 and the outcome is YES, you receive $1.00 — 
          a profit of $0.65 (186% return). If the outcome is NO, you lose your $0.35 investment.
        </DocsNote>

        <DocsParagraph>
          The orderbook shows all available buy and sell orders at different price levels, allowing you 
          to see market depth and liquidity before placing your trade.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="making-money" title="Making Money on Markets">
        <DocsParagraph>
          There are several strategies for profitable trading on PolyTrade:
        </DocsParagraph>

        <DocsSubheading>Directional Trading</DocsSubheading>
        <DocsParagraph>
          Buy YES or NO shares based on your prediction of the outcome. If you believe BTC will rise, 
          buy YES on &quot;BTC up&quot; markets at favorable prices.
        </DocsParagraph>

        <DocsSubheading>Market Making</DocsSubheading>
        <DocsParagraph>
          Provide liquidity by placing both buy and sell orders. Earn the spread between bid and ask prices 
          when both sides of your orders are filled.
        </DocsParagraph>

        <DocsSubheading>Arbitrage</DocsSubheading>
        <DocsParagraph>
          When YES + NO prices sum to less than $1.00, buy both sides for a guaranteed profit upon resolution. 
          PolyTrade shows spread analysis to help identify these opportunities.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="key-features" title="Key Features">
        <DocsList items={[
          { title: 'Real-Time WebSocket Data', description: 'live price updates and orderbook changes streamed directly to your browser' },
          { title: 'Historical Charts', description: 'price history stored in TimescaleDB for comprehensive market analysis' },
          { title: 'Advanced Order Types', description: 'market orders, limit orders, and sophisticated order management' },
          { title: 'Secure Authentication', description: 'connect with MetaMask or Phantom wallets for secure trading' },
        ]} />
      </DocsSection>
    </DocsPage>
  )
}
