'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function FirstTradePage() {
  return (
    <DocsPage
      breadcrumb="Get Started"
      title="Making Your First Trade"
      description="Learn how to place your first trade on PolyTrade. We'll walk through selecting a market, understanding the interface, and executing a trade."
      tableOfContents={[
        { name: 'Select a Market', href: '#select-market' },
        { name: 'Understand the Interface', href: '#interface' },
        { name: 'Place Your Trade', href: '#place-trade' },
        { name: 'Monitor Position', href: '#monitor' },
      ]}
      prevPage={{ name: 'How to Deposit', href: '/docs/learn/get-started/how-to-deposit' }}
      nextPage={{ name: 'Terminal Overview', href: '/docs/learn/trading/terminal' }}
    >
      <DocsSection id="select-market" title="Select a Market">
        <DocsParagraph>
          PolyTrade focuses on crypto price prediction markets. Use the dropdown selectors 
          at the top of the terminal to choose:
        </DocsParagraph>

        <DocsSubheading>Crypto Pair</DocsSubheading>
        <DocsParagraph>
          Select the cryptocurrency you want to trade predictions on (BTC, ETH, SOL, etc.)
        </DocsParagraph>

        <DocsSubheading>Timeframe</DocsSubheading>
        <DocsParagraph>
          Choose the prediction timeframe — 15 minutes, 1 hour, 4 hours, or daily candles.
        </DocsParagraph>

        <DocsNote type="tip">
          Start with longer timeframes. 1-hour or 4-hour markets give you more 
          time to analyze and are less volatile than 15-minute markets.
        </DocsNote>
      </DocsSection>

      <DocsSection id="interface" title="Understand the Interface">
        <DocsParagraph>
          The PolyTrade terminal is divided into several key areas:
        </DocsParagraph>

        <DocsSubheading>Price Chart (Left)</DocsSubheading>
        <DocsParagraph>
          Shows historical price data for the selected market. Green candles indicate 
          the market resolved YES, red candles indicate NO.
        </DocsParagraph>

        <DocsSubheading>Order Book (Center)</DocsSubheading>
        <DocsParagraph>
          Displays current buy (bid) and sell (ask) orders. The spread between best bid 
          and best ask shows market liquidity.
        </DocsParagraph>

        <DocsSubheading>Trading Panel (Right)</DocsSubheading>
        <DocsParagraph>
          Where you enter your trades. Shows current prices, position info, and order inputs.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="place-trade" title="Place Your Trade">
        <DocsParagraph>
          In the trading panel, you can place either a market order or limit order:
        </DocsParagraph>

        <DocsSubheading>Market Order</DocsSubheading>
        <DocsParagraph>
          Executes immediately at the best available price. Use for quick entries when 
          you want guaranteed execution.
        </DocsParagraph>

        <DocsSubheading>Limit Order</DocsSubheading>
        <DocsParagraph>
          Sets a specific price you&apos;re willing to pay. The order sits in the orderbook 
          until someone matches it, or you cancel.
        </DocsParagraph>

        <DocsNote type="warning">
          <strong>Double-check your order:</strong> Review the side (YES/NO), amount, and price 
          before confirming. Trades cannot be reversed once executed.
        </DocsNote>

        <DocsParagraph>
          <strong>Step 1:</strong> Select YES or NO based on your prediction<br />
          <strong>Step 2:</strong> Enter the amount of shares to buy<br />
          <strong>Step 3:</strong> For limit orders, set your desired price<br />
          <strong>Step 4:</strong> Click &quot;Buy&quot; and confirm in your wallet
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="monitor" title="Monitor Your Position">
        <DocsParagraph>
          After your trade executes, you can monitor your position in several places:
        </DocsParagraph>

        <DocsSubheading>Trading Panel</DocsSubheading>
        <DocsParagraph>
          Shows your current position size, average entry price, and unrealized P&L.
        </DocsParagraph>

        <DocsSubheading>History Page</DocsSubheading>
        <DocsParagraph>
          View all your past trades and their outcomes. Access via the navigation menu.
        </DocsParagraph>

        <DocsSubheading>Analytics Page</DocsSubheading>
        <DocsParagraph>
          Track your overall performance, win rate, and strategy analytics.
        </DocsParagraph>

        <DocsNote type="info">
          <strong>Market Resolution:</strong> When the market resolves, winning positions 
          automatically receive $1.00 USDC.e per share. Losing positions expire worthless.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
