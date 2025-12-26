'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function HowToDepositPage() {
  return (
    <DocsPage
      breadcrumb="Get Started"
      title="How to Deposit"
      description="Fund your custodial wallet with USDC.e to start trading prediction markets. Learn about deposit methods and how to send funds to your wallet address."
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
          PolyVec uses USDC.e (Bridged USDC) on Polygon for all trading. You deposit funds directly 
          to your custodial wallet address. Here&apos;s how:
        </DocsParagraph>

        <DocsNote type="warning">
          <strong>Important:</strong> You must use USDC.e (contract: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) 
          on Polygon, not native USDC. Regular USDC will not work for trading.
        </DocsNote>

        <DocsSubheading>Find Your Wallet Address</DocsSubheading>
        <DocsParagraph>
          Your custodial wallet address is displayed in your account settings. Copy this address — 
          you&apos;ll send USDC.e to this address.
        </DocsParagraph>

        <DocsSubheading>From Another Wallet</DocsSubheading>
        <DocsParagraph>
          If you have USDC.e in MetaMask, Phantom, or another wallet:
          <br />• Copy your PolyVec custodial wallet address
          <br />• Send USDC.e from your wallet to this address
          <br />• Make sure you&apos;re on the Polygon network
          <br />• Your balance will update automatically within a few minutes
        </DocsParagraph>

        <DocsSubheading>From an Exchange</DocsSubheading>
        <DocsParagraph>
          Send USDC.e directly from exchanges that support Polygon withdrawals (Coinbase, Kraken, etc.):
          <br />• Copy your PolyVec custodial wallet address
          <br />• Withdraw USDC.e from the exchange to this address
          <br />• Select Polygon network when withdrawing
          <br />• Your balance will appear after blockchain confirmation
        </DocsParagraph>

        <DocsSubheading>Bridge from Ethereum</DocsSubheading>
        <DocsParagraph>
          If you have USDC on Ethereum mainnet, use the official Polygon Bridge or a cross-chain 
          service like Hop Protocol to bridge USDC to Polygon as USDC.e, then send to your custodial wallet.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="approve-usdc" title="No Approvals Needed">
        <DocsParagraph>
          With custodial wallets, you don&apos;t need to approve USDC.e spending. PolyVec manages 
          all blockchain interactions on your behalf, including approvals and transactions.
        </DocsParagraph>

        <DocsNote type="info">
          <strong>How it works:</strong> When you place a trade, PolyVec automatically handles:
          <br />• USDC.e approvals (if needed)
          <br />• Transaction signing
          <br />• Order placement on Polymarket
          <br />• Balance updates
        </DocsNote>

        <DocsParagraph>
          This means faster trading — no waiting for wallet confirmations or approvals!
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="gas-requirements" title="Gas Requirements">
        <DocsParagraph>
          When you send USDC.e to your custodial wallet, you&apos;ll pay gas fees from the wallet 
          you&apos;re sending from (MetaMask, exchange, etc.). PolyVec covers all gas fees for trading 
          transactions on your behalf.
        </DocsParagraph>

        <DocsSubheading>Deposit Gas Fees</DocsSubheading>
        <DocsParagraph>
          You only pay gas when sending USDC.e to your custodial wallet. This is a one-time fee 
          per deposit. Gas fees on Polygon are typically less than $0.01.
        </DocsParagraph>

        <DocsSubheading>Trading Gas Fees</DocsSubheading>
        <DocsParagraph>
          PolyVec covers all gas fees for your trades. You don&apos;t need to hold POL or pay 
          transaction fees when placing orders.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="verification" title="Verify Your Deposit">
        <DocsParagraph>
          After sending USDC.e to your custodial wallet address, your balance will update automatically 
          once the transaction is confirmed on the blockchain (usually within 1-2 minutes).
        </DocsParagraph>

        <DocsSubheading>Balance Updates</DocsSubheading>
        <DocsParagraph>
          Your balance is automatically synced from the blockchain. You can see:
          <br />• <strong>Cash Balance:</strong> Available USDC.e for new trades
          <br />• <strong>Portfolio Value:</strong> Total value including open positions
        </DocsParagraph>

        <DocsSubheading>Transaction Status</DocsSubheading>
        <DocsParagraph>
          You can verify your deposit by checking the transaction on PolygonScan using your 
          custodial wallet address. The transaction should show USDC.e being received.
        </DocsParagraph>

        <DocsNote type="tip">
          If your balance doesn&apos;t update after a few minutes, try refreshing the page. 
          The system syncs balances every 30 seconds.
        </DocsNote>
      </DocsSection>
    </DocsPage>
  )
}
