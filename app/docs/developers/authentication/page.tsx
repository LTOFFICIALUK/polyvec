'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsCodeBlock, DocsSubheading } from '@/components/DocsPage'

export default function AuthenticationPage() {
  return (
    <DocsPage
      breadcrumb="API Reference"
      title="Authentication"
      description="Learn how PolyVec authenticates with Polymarket APIs using custodial wallet signatures and API credentials."
      tableOfContents={[
        { name: 'Overview', href: '#overview' },
        { name: 'Auth Flow', href: '#auth-flow' },
        { name: 'API Credentials', href: '#credentials' },
        { name: 'HMAC Signing', href: '#hmac' },
        { name: 'Request Headers', href: '#headers' },
      ]}
      prevPage={{ name: 'API Overview', href: '/docs/developers/overview' }}
      nextPage={{ name: 'Market Data', href: '/docs/developers/api/market-data' }}
    >
      <DocsSection id="overview" title="Overview">
        <DocsParagraph>
          This page describes how PolyVec&apos;s backend authenticates with Polymarket APIs. 
          End users don&apos;t interact with this directly — they use email/password authentication 
          and PolyVec handles API authentication automatically.
        </DocsParagraph>

        <DocsNote type="info">
          <strong>For End Users:</strong> You don&apos;t need to worry about API authentication. 
          When you create an account, PolyVec automatically sets up everything needed to trade. 
          See <a href="/docs/learn/get-started/how-to-sign-up" className="text-blue-400 underline">How to Sign-Up</a> for user authentication.
        </DocsNote>
      </DocsSection>

      <DocsSection id="auth-flow" title="Authentication Flow">
        <DocsParagraph>
          PolyVec uses custodial wallets to authenticate with Polymarket APIs:
        </DocsParagraph>

        <DocsSubheading>1. Custodial Wallet Creation</DocsSubheading>
        <DocsParagraph>
          When a user creates an account, PolyVec automatically generates a custodial wallet 
          and stores the encrypted private key securely.
        </DocsParagraph>

        <DocsSubheading>2. Polymarket API Credentials</DocsSubheading>
        <DocsParagraph>
          PolyVec uses the custodial wallet to sign a message and generate Polymarket API credentials. 
          These credentials are stored encrypted and used to authenticate all trading requests on behalf of the user.
        </DocsParagraph>

        <DocsNote type="info">
          This process happens automatically during account creation. Users never interact with 
          wallet signatures or API credentials directly.
        </DocsNote>
      </DocsSection>

      <DocsSection id="credentials" title="API Credentials">
        <DocsParagraph>
          After authentication, you receive three credentials:
        </DocsParagraph>

        <DocsParagraph>
          <strong>API Key</strong> — A unique identifier for your account. Sent in request headers.<br />
          <strong>Secret</strong> — A private key used to sign requests. Never share this.<br />
          <strong>Passphrase</strong> — An additional security layer included in signed requests.
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`const credentials = {
  apiKey: "your-api-key-uuid",
  secret: "your-base64-secret",
  passphrase: "your-hex-passphrase"
}`}
        />
      </DocsSection>

      <DocsSection id="hmac" title="HMAC Request Signing">
        <DocsParagraph>
          Authenticated requests must include an HMAC signature:
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`import crypto from 'crypto'

function signRequest(secret, timestamp, method, path, body = '') {
  const message = timestamp + method + path + body
  const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'base64'))
  hmac.update(message)
  return hmac.digest('base64')
}`}
        />

        <DocsNote type="warning">
          Requests must have a timestamp within 30 seconds of server time. Use Unix timestamp in seconds.
        </DocsNote>
      </DocsSection>

      <DocsSection id="headers" title="Request Headers">
        <DocsParagraph>
          Include these headers in authenticated requests:
        </DocsParagraph>

        <DocsCodeBlock
          language="javascript"
          code={`const headers = {
  'POLY_ADDRESS': '0xYourWalletAddress',
  'POLY_TIMESTAMP': Math.floor(Date.now() / 1000).toString(),
  'POLY_API_KEY': credentials.apiKey,
  'POLY_SIGNATURE': signedSignature,
  'POLY_PASSPHRASE': credentials.passphrase,
  'Content-Type': 'application/json'
}`}
        />

        <DocsParagraph>
          <strong>POLY_ADDRESS</strong> — Your Ethereum wallet address<br />
          <strong>POLY_TIMESTAMP</strong> — Current Unix timestamp<br />
          <strong>POLY_API_KEY</strong> — Your API key<br />
          <strong>POLY_SIGNATURE</strong> — HMAC signature<br />
          <strong>POLY_PASSPHRASE</strong> — Your passphrase
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}
