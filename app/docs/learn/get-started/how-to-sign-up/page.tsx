'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function HowToSignUpPage() {
  return (
    <DocsPage
      breadcrumb="Get Started"
      title="How to Sign-Up"
      description="Create your PolyVec account with email and password. A custodial wallet is automatically created for you — no Web3 wallet needed."
      tableOfContents={[
        { name: 'Prerequisites', href: '#prerequisites' },
        { name: 'Create Account', href: '#create-account' },
        { name: 'Custodial Wallet', href: '#custodial-wallet' },
        { name: 'Troubleshooting', href: '#troubleshooting' },
      ]}
      prevPage={{ name: 'What is PolyVec?', href: '/docs/learn/get-started/what-is-polyvec' }}
      nextPage={{ name: 'How to Deposit', href: '/docs/learn/get-started/how-to-deposit' }}
    >
      <DocsSection id="prerequisites" title="Prerequisites">
        <DocsParagraph>
          Before you can start trading on PolyVec, you&apos;ll need:
        </DocsParagraph>

        <DocsSubheading>Email Address</DocsSubheading>
        <DocsParagraph>
          A valid email address for account creation and login. This is your primary account identifier.
        </DocsParagraph>

        <DocsSubheading>Password</DocsSubheading>
        <DocsParagraph>
          A secure password (minimum 8 characters). Choose a strong password to protect your account.
        </DocsParagraph>

        <DocsNote type="info">
          <strong>No Web3 Wallet Required:</strong> PolyVec uses custodial wallets, so you don&apos;t need 
          MetaMask, Phantom, or any other Web3 wallet. A wallet is automatically created for you.
        </DocsNote>
      </DocsSection>

      <DocsSection id="create-account" title="Create Your Account">
        <DocsParagraph>
          Creating an account on PolyVec is simple and takes less than a minute:
        </DocsParagraph>

        <DocsParagraph>
          <strong>Step 1:</strong> Navigate to the sign-up page (or click &quot;Sign Up&quot; in the header)<br />
          <strong>Step 2:</strong> Enter your email address<br />
          <strong>Step 3:</strong> Choose a secure password (minimum 8 characters)<br />
          <strong>Step 4:</strong> Click &quot;Create Account&quot;<br />
          <strong>Step 5:</strong> You&apos;re automatically logged in and ready to trade!
        </DocsParagraph>

        <DocsNote type="info">
          <strong>Automatic Setup:</strong> When you create an account, PolyVec automatically:
          <br />• Creates your custodial wallet
          <br />• Sets up your trading account
          <br />• Prepares you to start trading immediately
        </DocsNote>
      </DocsSection>

      <DocsSection id="custodial-wallet" title="Your Custodial Wallet">
        <DocsParagraph>
          When you sign up, PolyVec automatically creates a custodial wallet for you. This means:
        </DocsParagraph>

        <DocsSubheading>What is a Custodial Wallet?</DocsSubheading>
        <DocsParagraph>
          A custodial wallet is a wallet where PolyVec holds and manages your private keys on your behalf. 
          This allows you to trade without managing blockchain complexity or signing transactions.
        </DocsParagraph>

        <DocsSubheading>Benefits</DocsSubheading>
        <DocsParagraph>
          • <strong>No wallet extensions needed</strong> — trade directly from your browser<br />
          • <strong>Fast trading</strong> — no transaction confirmations required<br />
          • <strong>Simple deposits</strong> — send USDC.e directly to your wallet address<br />
          • <strong>Automatic management</strong> — we handle all blockchain interactions
        </DocsParagraph>

        <DocsNote type="warning">
          <strong>Important:</strong> Funds in custodial wallets are not insured. Please read our 
          <a href="/docs/policies/custodial-wallet-disclosure" className="text-blue-400 underline">Custodial Wallet Disclosure</a> for details.
        </DocsNote>

        <DocsParagraph>
          Your wallet address will be displayed in your account settings. You can use this address 
          to deposit USDC.e from any exchange or wallet that supports Polygon.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="troubleshooting" title="Troubleshooting">
        <DocsSubheading>Email already exists?</DocsSubheading>
        <DocsParagraph>
          If you see an error that your email is already registered, try logging in instead. 
          If you forgot your password, contact support.
        </DocsParagraph>

        <DocsSubheading>Password too weak?</DocsSubheading>
        <DocsParagraph>
          Your password must be at least 8 characters long. Use a combination of letters, numbers, 
          and symbols for better security.
        </DocsParagraph>

        <DocsSubheading>Account creation failed?</DocsSubheading>
        <DocsParagraph>
          If account creation fails, check your internet connection and try again. If the problem 
          persists, contact support with your email address.
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}
