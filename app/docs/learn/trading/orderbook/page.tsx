'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function OrderBookPage() {
  return (
    <DocsPage
      breadcrumb="Trading"
      title="Reading the Order Book"
      description="The order book is essential for understanding market dynamics. Learn to read depth, identify support/resistance, and spot trading opportunities."
      tableOfContents={[
        { name: 'Order Book Basics', href: '#basics' },
        { name: 'Reading Depth', href: '#depth' },
        { name: 'Spread Analysis', href: '#spread' },
        { name: 'Trading Signals', href: '#signals' },
      ]}
      prevPage={{ name: 'Order Types', href: '/docs/learn/trading/order-types' }}
      nextPage={{ name: 'API Overview', href: '/docs/developers/overview' }}
    >
      <DocsSection id="basics" title="Order Book Basics">
        <DocsParagraph>
          The order book displays all pending buy and sell orders organized by price level:
        </DocsParagraph>

        <DocsSubheading>Bids (Buy Orders)</DocsSubheading>
        <DocsParagraph>
          Displayed in green, these are orders to buy shares. Arranged from 
          highest price (top) to lowest. The top bid is the best price to sell at.
        </DocsParagraph>

        <DocsSubheading>Asks (Sell Orders)</DocsSubheading>
        <DocsParagraph>
          Displayed in red, these are orders to sell shares. Arranged from 
          lowest price (top) to highest. The top ask is the best price to buy at.
        </DocsParagraph>

        <DocsSubheading>Size Column</DocsSubheading>
        <DocsParagraph>
          Shows how many shares are available at each price level. 
          Larger sizes indicate stronger interest at that price.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="depth" title="Reading Market Depth">
        <DocsParagraph>
          Market depth shows the cumulative size of orders at and below each price level:
        </DocsParagraph>

        <DocsSubheading>Depth Visualization</DocsSubheading>
        <DocsParagraph>
          The colored bars behind prices show relative depth. Longer bars indicate 
          more liquidity at that price level.
        </DocsParagraph>

        <DocsSubheading>Support Levels</DocsSubheading>
        <DocsParagraph>
          Large buy orders clustered at certain prices act as support — 
          they absorb selling pressure and can prevent price drops.
        </DocsParagraph>

        <DocsSubheading>Resistance Levels</DocsSubheading>
        <DocsParagraph>
          Large sell orders act as resistance — they need to be filled 
          before price can move higher.
        </DocsParagraph>

        <DocsNote type="tip">
          Before placing large orders, scroll through the orderbook to ensure there&apos;s enough depth 
          to fill your order without excessive slippage.
        </DocsNote>
      </DocsSection>

      <DocsSection id="spread" title="Spread Analysis">
        <DocsParagraph>
          The spread is the difference between the best bid and best ask:
        </DocsParagraph>

        <DocsSubheading>Tight Spread</DocsSubheading>
        <DocsParagraph>
          A small spread (1-2 cents) indicates high liquidity and efficient markets. 
          Trading costs are lower.
        </DocsParagraph>

        <DocsSubheading>Wide Spread</DocsSubheading>
        <DocsParagraph>
          A large spread suggests low liquidity. You&apos;ll pay more to enter and exit 
          positions. Consider using limit orders.
        </DocsParagraph>

        <DocsNote type="info">
          If YES + NO mid-prices sum to less than $1.00, there may be an arbitrage opportunity 
          by buying both sides.
        </DocsNote>
      </DocsSection>

      <DocsSection id="signals" title="Trading Signals">
        <DocsParagraph>
          The orderbook can provide valuable trading signals:
        </DocsParagraph>

        <DocsSubheading>Order Imbalance</DocsSubheading>
        <DocsParagraph>
          Significantly more bids than asks (or vice versa) may indicate 
          directional pressure and potential price movement.
        </DocsParagraph>

        <DocsSubheading>Large Orders</DocsSubheading>
        <DocsParagraph>
          Sudden appearance of large orders can signal institutional interest 
          or informed traders entering the market.
        </DocsParagraph>

        <DocsSubheading>Order Removal</DocsSubheading>
        <DocsParagraph>
          Large orders being pulled from the book may indicate changing sentiment 
          or preparation for a large market order.
        </DocsParagraph>

        <DocsNote type="warning">
          Large orders aren&apos;t always real intent — some traders place and cancel orders to manipulate others. 
          Don&apos;t rely solely on orderbook signals for trading decisions.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
