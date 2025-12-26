'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function TerminalPage() {
  return (
    <DocsPage
      breadcrumb="Trading"
      title="Terminal Overview"
      description="The PolyVec terminal is your command center for prediction market trading. Learn about each component and how to use them effectively."
      tableOfContents={[
        { name: 'Layout Overview', href: '#layout' },
        { name: 'Chart Panel', href: '#chart' },
        { name: 'Order Book', href: '#orderbook' },
        { name: 'Trading Panel', href: '#trading-panel' },
      ]}
      prevPage={{ name: 'Making Your First Trade', href: '/docs/learn/get-started/first-trade' }}
      nextPage={{ name: 'Understanding Markets', href: '/docs/learn/trading/understanding-markets' }}
    >
      <DocsSection id="layout" title="Layout Overview">
        <DocsParagraph>
          The terminal is divided into three main sections designed for efficient trading:
        </DocsParagraph>

        <DocsSubheading>Left Panel: Price Chart</DocsSubheading>
        <DocsParagraph>
          Displays historical price movements and helps you analyze market trends 
          before making trading decisions.
        </DocsParagraph>

        <DocsSubheading>Center Panel: Order Book</DocsSubheading>
        <DocsParagraph>
          Shows all active buy and sell orders in the market, giving you insight 
          into supply, demand, and liquidity.
        </DocsParagraph>

        <DocsSubheading>Right Panel: Trading Interface</DocsSubheading>
        <DocsParagraph>
          Where you execute trades, view your positions, and manage orders.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="chart" title="Chart Panel">
        <DocsParagraph>
          The chart displays price history for the selected market with color-coded candles:
        </DocsParagraph>

        <DocsSubheading>Green Candles</DocsSubheading>
        <DocsParagraph>
          Indicate markets that resolved YES — the predicted event occurred.
        </DocsParagraph>

        <DocsSubheading>Red Candles</DocsSubheading>
        <DocsParagraph>
          Indicate markets that resolved NO — the predicted event did not occur.
        </DocsParagraph>

        <DocsNote type="tip">
          Use the timeframe selector above the chart to switch between different prediction intervals. 
          Historical data helps identify patterns.
        </DocsNote>
      </DocsSection>

      <DocsSection id="orderbook" title="Order Book">
        <DocsParagraph>
          The order book displays all pending orders in the market:
        </DocsParagraph>

        <DocsSubheading>Bid Side (Green)</DocsSubheading>
        <DocsParagraph>
          Shows buy orders — traders willing to buy at these prices. 
          The highest bid is the best price you can sell at immediately.
        </DocsParagraph>

        <DocsSubheading>Ask Side (Red)</DocsSubheading>
        <DocsParagraph>
          Shows sell orders — traders willing to sell at these prices. 
          The lowest ask is the best price you can buy at immediately.
        </DocsParagraph>

        <DocsSubheading>Spread</DocsSubheading>
        <DocsParagraph>
          The difference between best bid and best ask. A tighter spread 
          indicates better liquidity and lower trading costs.
        </DocsParagraph>

        <DocsNote type="info">
          Click on any price level in the orderbook to pre-fill that price in the trading panel.
        </DocsNote>
      </DocsSection>

      <DocsSection id="trading-panel" title="Trading Panel">
        <DocsParagraph>
          The trading panel is where you execute all your trades:
        </DocsParagraph>

        <DocsSubheading>Market Info</DocsSubheading>
        <DocsParagraph>
          Shows the current market question, YES/NO prices, and your existing position.
        </DocsParagraph>

        <DocsSubheading>Order Entry</DocsSubheading>
        <DocsParagraph>
          Select BUY or SELL, choose YES or NO outcome, enter amount and price (for limit orders).
        </DocsParagraph>

        <DocsSubheading>Position Display</DocsSubheading>
        <DocsParagraph>
          View your current position size, average entry, and unrealized profit/loss.
        </DocsParagraph>

        <DocsSubheading>Open Orders</DocsSubheading>
        <DocsParagraph>
          List of your pending limit orders with options to cancel.
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}
