'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function UnderstandingMarketsPage() {
  return (
    <DocsPage
      breadcrumb="Trading"
      title="Understanding Markets"
      description="Learn how prediction markets work, how prices reflect probabilities, and how to interpret market data for better trading decisions."
      tableOfContents={[
        { name: 'How Markets Work', href: '#how-markets-work' },
        { name: 'Price as Probability', href: '#price-probability' },
        { name: 'Market Resolution', href: '#resolution' },
        { name: 'Market Selection', href: '#selection' },
      ]}
      prevPage={{ name: 'Terminal Overview', href: '/docs/learn/trading/terminal' }}
      nextPage={{ name: 'Order Types', href: '/docs/learn/trading/order-types' }}
    >
      <DocsSection id="how-markets-work" title="How Prediction Markets Work">
        <DocsParagraph>
          Prediction markets are exchanges where you trade shares based on the outcome 
          of future events. Each market has two outcomes: YES and NO.
        </DocsParagraph>

        <DocsSubheading>Binary Outcomes</DocsSubheading>
        <DocsParagraph>
          Every market resolves to either YES (1.00) or NO (0.00). 
          There are no partial outcomes — it&apos;s all or nothing.
        </DocsParagraph>

        <DocsSubheading>Full Collateralization</DocsSubheading>
        <DocsParagraph>
          YES + NO shares always equal $1.00. If you own both a YES and NO share, 
          you&apos;re guaranteed to receive $1.00 regardless of outcome.
        </DocsParagraph>

        <DocsNote type="info">
          In a &quot;Will BTC close above $100k?&quot; market, YES shares pay $1.00 if BTC closes above $100k, 
          and NO shares pay $1.00 if it doesn&apos;t.
        </DocsNote>
      </DocsSection>

      <DocsSection id="price-probability" title="Price as Probability">
        <DocsParagraph>
          Market prices directly reflect the crowd&apos;s estimated probability of each outcome:
        </DocsParagraph>

        <DocsSubheading>Interpreting Prices</DocsSubheading>
        <DocsParagraph>
          A YES share priced at $0.65 means the market estimates a 65% probability 
          that the event will occur. A NO share would be priced at $0.35.
        </DocsParagraph>

        <DocsSubheading>Finding Value</DocsSubheading>
        <DocsParagraph>
          If you believe the true probability is higher than the market price, 
          buying that share has positive expected value.
        </DocsParagraph>

        <DocsNote type="tip">
          If you think an event has 80% chance but YES trades at $0.65, your expected value is 
          (0.80 × $1.00) - $0.65 = $0.15 per share.
        </DocsNote>
      </DocsSection>

      <DocsSection id="resolution" title="Market Resolution">
        <DocsParagraph>
          Markets resolve when the predicted event either occurs or the deadline passes:
        </DocsParagraph>

        <DocsSubheading>Automatic Resolution</DocsSubheading>
        <DocsParagraph>
          Crypto price markets resolve automatically based on oracle data 
          at the specified candle close time.
        </DocsParagraph>

        <DocsSubheading>Payout</DocsSubheading>
        <DocsParagraph>
          Winning shares receive $1.00 USDC.e each. Losing shares expire worthless. 
          Payouts are automatic — no action required.
        </DocsParagraph>

        <DocsSubheading>Redemption</DocsSubheading>
        <DocsParagraph>
          After resolution, you can redeem your winning shares for USDC.e 
          through the trading panel or automatically.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="selection" title="Market Selection">
        <DocsParagraph>
          PolyVec offers various crypto price prediction markets:
        </DocsParagraph>

        <DocsSubheading>Asset Pairs</DocsSubheading>
        <DocsParagraph>
          Trade predictions on BTC, ETH, SOL, and other major cryptocurrencies.
        </DocsParagraph>

        <DocsSubheading>Timeframes</DocsSubheading>
        <DocsParagraph>
          Choose from 15-minute, 1-hour, 4-hour, or daily prediction windows. 
          Shorter timeframes are more volatile but resolve faster.
        </DocsParagraph>

        <DocsNote type="warning">
          Some markets may have thin orderbooks. Check the spread and depth before placing large orders.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
