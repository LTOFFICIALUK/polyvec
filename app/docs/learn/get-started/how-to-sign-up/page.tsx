'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function HowToSignUpPage() {
  return (
    <DocsPage
      breadcrumb="Get Started"
      title="How to Sign-Up"
      description="Get started with PolyTrade in minutes by connecting your Web3 wallet. No email registration required — your wallet is your identity."
      tableOfContents={[
        { name: 'Prerequisites', href: '#prerequisites' },
        { name: 'Connect Wallet', href: '#connect-wallet' },
        { name: 'Polymarket Auth', href: '#polymarket-auth' },
        { name: 'Troubleshooting', href: '#troubleshooting' },
      ]}
      prevPage={{ name: 'What is PolyTrade?', href: '/docs/learn/get-started/what-is-polytrade' }}
      nextPage={{ name: 'How to Deposit', href: '/docs/learn/get-started/how-to-deposit' }}
    >
      <DocsSection id="prerequisites" title="Prerequisites">
        <DocsParagraph>
          Before you can start trading on PolyTrade, you&apos;ll need:
        </DocsParagraph>

        <DocsSubheading>A Web3 Wallet</DocsSubheading>
        <DocsParagraph>
          Install MetaMask or Phantom browser extension. These wallets store your cryptocurrency 
          and allow you to sign transactions securely.
        </DocsParagraph>

        <DocsSubheading>Polygon Network</DocsSubheading>
        <DocsParagraph>
          PolyTrade operates on the Polygon network for fast, low-cost transactions. 
          Your wallet should be configured to connect to Polygon.
        </DocsParagraph>

        <DocsSubheading>USDC.e Balance</DocsSubheading>
        <DocsParagraph>
          You&apos;ll need USDC.e (Bridged USDC on Polygon) to trade. You can bridge USDC.e from other networks 
          or purchase directly through supported exchanges.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="connect-wallet" title="Connect Your Wallet">
        <DocsParagraph>
          Click the profile icon in the top right corner of the PolyTrade interface. 
          If you&apos;re not connected, you&apos;ll see a &quot;Connect Wallet&quot; prompt.
        </DocsParagraph>

        <DocsNote type="info">
          <strong>Supported Wallets:</strong> MetaMask and Phantom are currently supported. 
          More wallet integrations coming soon.
        </DocsNote>

        <DocsParagraph>
          <strong>Step 1:</strong> Click &quot;Connect Wallet&quot; button<br />
          <strong>Step 2:</strong> Select your wallet provider (MetaMask or Phantom)<br />
          <strong>Step 3:</strong> Approve the connection in your wallet popup<br />
          <strong>Step 4:</strong> You&apos;re connected! Your wallet address will appear in the header.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="polymarket-auth" title="Polymarket Authentication">
        <DocsParagraph>
          After connecting your wallet, you&apos;ll need to authenticate with Polymarket to enable trading. 
          This creates API credentials that allow PolyTrade to place orders on your behalf.
        </DocsParagraph>

        <DocsNote type="warning">
          <strong>Important:</strong> You&apos;ll sign a message with your wallet — this does NOT cost any gas 
          and does NOT give PolyTrade access to your funds. It only creates trading credentials.
        </DocsNote>

        <DocsParagraph>
          Click the purple &quot;Connect to Polymarket&quot; button that appears after wallet connection. 
          Follow the prompts to sign the authentication message.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="troubleshooting" title="Troubleshooting">
        <DocsSubheading>Wallet not detected?</DocsSubheading>
        <DocsParagraph>
          Make sure your wallet extension is installed and unlocked. Try refreshing the page.
        </DocsParagraph>

        <DocsSubheading>Wrong network?</DocsSubheading>
        <DocsParagraph>
          Switch to Polygon network in your wallet settings. MetaMask will prompt you to add 
          Polygon if it&apos;s not already configured.
        </DocsParagraph>

        <DocsSubheading>Connection failed?</DocsSubheading>
        <DocsParagraph>
          Clear your browser cache, disable other wallet extensions temporarily, and try again.
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}
