'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function HowToDepositPage() {
  return (
    <DocsPage
      breadcrumb="Get Started"
      title="How to Deposit"
      description="Fund your PolyTrade account with USDC.e to start trading prediction markets. Learn about deposit methods and gas requirements."
      tableOfContents={[
        { name: 'Deposit Methods', href: '#deposit-methods' },
        { name: 'Approve USDC.e', href: '#approve-usdc' },
        { name: 'Gas Requirements', href: '#gas-requirements' },
        { name: 'Verification', href: '#verification' },
      ]}
      prevPage={{ name: 'How to Sign-Up', href: '/docs/learn/get-started/how-to-sign-up' }}
      nextPage={{ name: 'Making Your First Trade', href: '/docs/learn/get-started/first-trade' }}
    >
      <DocsSection id="deposit-methods" title="Deposit Methods">
        <DocsParagraph>
          PolyTrade uses USDC.e (Bridged USDC) on Polygon for all trading. Regular USDC will not work. 
          You can deposit funds in several ways:
        </DocsParagraph>

        <DocsNote type="warning">
          <strong>Important:</strong> You must use USDC.e (contract: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174), 
          not native USDC. Regular USDC will not work for trading.
        </DocsNote>

        <DocsSubheading>Direct Deposit</DocsSubheading>
        <DocsParagraph>
          If you already have USDC.e on Polygon, click the &quot;Deposit&quot; button in the header. 
          Enter the amount you want to deposit and approve the transaction.
        </DocsParagraph>

        <DocsSubheading>Bridge from Ethereum</DocsSubheading>
        <DocsParagraph>
          Use the official Polygon Bridge or a cross-chain service like Hop Protocol to 
          move USDC from Ethereum mainnet to Polygon as USDC.e.
        </DocsParagraph>

        <DocsSubheading>Exchange Transfer</DocsSubheading>
        <DocsParagraph>
          Send USDC.e directly from exchanges that support Polygon withdrawals (Coinbase, Kraken, etc.). 
          Make sure to select the Polygon network when withdrawing.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="approve-usdc" title="Approve USDC.e Spending">
        <DocsParagraph>
          Before your first trade, you&apos;ll need to approve the Polymarket contract to spend your USDC.e. 
          This is a one-time approval per wallet.
        </DocsParagraph>

        <DocsNote type="info">
          <strong>What is approval?</strong> ERC-20 tokens like USDC.e require you to &quot;approve&quot; contracts 
          before they can transfer tokens on your behalf. This is a security feature.
        </DocsNote>

        <DocsParagraph>
          When you make your first deposit or trade, PolyTrade will prompt you to approve USDC.e spending. 
          You can choose to approve an unlimited amount (recommended) or a specific amount.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="gas-requirements" title="Gas Requirements">
        <DocsParagraph>
          Polygon transactions require a small amount of POL for gas fees. Make sure you have 
          at least 0.1 POL in your wallet for transactions.
        </DocsParagraph>

        <DocsSubheading>Where to get POL?</DocsSubheading>
        <DocsParagraph>
          You can bridge POL from Ethereum, purchase on exchanges, or use a faucet for small amounts. 
          Gas fees on Polygon are typically less than $0.01 per transaction.
        </DocsParagraph>

        <DocsNote type="tip">
          Keep 1-2 POL in your wallet to ensure you always have enough for gas fees, even during network congestion.
        </DocsNote>
      </DocsSection>

      <DocsSection id="verification" title="Verify Your Deposit">
        <DocsParagraph>
          After depositing, your balance will update in the header within a few seconds. 
          You can verify your deposit by checking:
        </DocsParagraph>

        <DocsSubheading>Portfolio Balance</DocsSubheading>
        <DocsParagraph>
          The &quot;Portfolio&quot; amount in the header shows your total value including open positions.
        </DocsParagraph>

        <DocsSubheading>Cash Balance</DocsSubheading>
        <DocsParagraph>
          The &quot;Cash&quot; amount shows your available USDC.e for new trades.
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}
