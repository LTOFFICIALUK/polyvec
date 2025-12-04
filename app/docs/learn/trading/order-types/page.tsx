'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function OrderTypesPage() {
  return (
    <DocsPage
      breadcrumb="Trading"
      title="Order Types"
      description="Master the different order types available on PolyTrade. Learn when to use market orders vs limit orders for optimal execution."
      tableOfContents={[
        { name: 'Market Orders', href: '#market-orders' },
        { name: 'Limit Orders', href: '#limit-orders' },
        { name: 'Order Management', href: '#management' },
        { name: 'Best Practices', href: '#best-practices' },
      ]}
      prevPage={{ name: 'Understanding Markets', href: '/docs/learn/trading/understanding-markets' }}
      nextPage={{ name: 'Reading the Order Book', href: '/docs/learn/trading/orderbook' }}
    >
      <DocsSection id="market-orders" title="Market Orders">
        <DocsParagraph>
          Market orders execute immediately at the best available price in the orderbook.
        </DocsParagraph>

        <DocsSubheading>How They Work</DocsSubheading>
        <DocsParagraph>
          Your order fills against existing limit orders in the orderbook, 
          starting with the best price and moving through the book until filled.
        </DocsParagraph>

        <DocsSubheading>When to Use</DocsSubheading>
        <DocsParagraph>
          Use market orders when you need guaranteed execution and are less 
          concerned about the exact price — for example, to quickly exit a position.
        </DocsParagraph>

        <DocsNote type="warning">
          Large market orders may experience slippage if there isn&apos;t enough liquidity at the best price. 
          The final execution price may be worse than displayed.
        </DocsNote>
      </DocsSection>

      <DocsSection id="limit-orders" title="Limit Orders">
        <DocsParagraph>
          Limit orders let you specify the exact price at which you&apos;re willing to trade.
        </DocsParagraph>

        <DocsSubheading>How They Work</DocsSubheading>
        <DocsParagraph>
          Your order is placed in the orderbook and waits until another trader 
          matches your price. The order may partially fill over time.
        </DocsParagraph>

        <DocsSubheading>When to Use</DocsSubheading>
        <DocsParagraph>
          Use limit orders when you have a specific price target and are willing 
          to wait for the market to come to you.
        </DocsParagraph>

        <DocsSubheading>Advantages</DocsSubheading>
        <DocsParagraph>
          No slippage — you always get your specified price or better. 
          You can also provide liquidity and potentially earn the spread.
        </DocsParagraph>

        <DocsNote type="tip">
          Place limit orders slightly inside the spread to increase fill probability 
          while still getting a better price than market orders.
        </DocsNote>
      </DocsSection>

      <DocsSection id="management" title="Order Management">
        <DocsParagraph>
          Manage your pending orders through the trading panel:
        </DocsParagraph>

        <DocsSubheading>View Open Orders</DocsSubheading>
        <DocsParagraph>
          All your pending limit orders are displayed in the &quot;Open Orders&quot; section 
          of the trading panel with price, size, and fill status.
        </DocsParagraph>

        <DocsSubheading>Cancel Orders</DocsSubheading>
        <DocsParagraph>
          Click the cancel button next to any order to remove it from the orderbook. 
          This frees up your capital for other trades.
        </DocsParagraph>

        <DocsSubheading>Modify Orders</DocsSubheading>
        <DocsParagraph>
          To change an order&apos;s price or size, cancel it and place a new one. 
          Order modifications aren&apos;t supported directly.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="best-practices" title="Best Practices">
        <DocsSubheading>Check the Spread</DocsSubheading>
        <DocsParagraph>
          Always check the bid-ask spread before trading. Wide spreads mean 
          higher trading costs regardless of order type.
        </DocsParagraph>

        <DocsSubheading>Use Limit Orders for Size</DocsSubheading>
        <DocsParagraph>
          For larger positions, use limit orders to avoid moving the market 
          against yourself with slippage.
        </DocsParagraph>

        <DocsSubheading>Set Realistic Prices</DocsSubheading>
        <DocsParagraph>
          Don&apos;t set limit orders too far from the current price if you want 
          them filled before market resolution.
        </DocsParagraph>

        <DocsNote type="info">
          Each order placement and cancellation requires a blockchain transaction. 
          Batch your order management when possible.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
