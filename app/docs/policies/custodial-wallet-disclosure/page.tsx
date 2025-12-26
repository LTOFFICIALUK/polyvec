'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function CustodialWalletDisclosurePage() {
  return (
    <DocsPage
      breadcrumb="Policies"
      title="Custodial Wallet Disclosure"
      description="Important information about custodial wallet services"
      tableOfContents={[
        { name: 'What is a Custodial Wallet?', href: '#what-is' },
        { name: 'How It Works', href: '#how-it-works' },
        { name: 'Risks and Limitations', href: '#risks' },
        { name: 'Not Insured', href: '#not-insured' },
        { name: 'Your Responsibilities', href: '#responsibilities' },
        { name: 'Withdrawals', href: '#withdrawals' },
      ]}
    >
      <DocsNote type="warning">
        <strong>Critical:</strong> Funds in custodial wallets are <strong>not insured</strong> 
        and may be lost. Please read this disclosure carefully.
      </DocsNote>

      <DocsSection id="what-is" title="What is a Custodial Wallet?">
        <DocsParagraph>
          A custodial wallet is a wallet where we (PolyVec) hold and manage your private 
          keys on your behalf. This allows you to trade without managing blockchain complexity, 
          but it means we have control over your funds.
        </DocsParagraph>
        <DocsParagraph>
          <strong>Key Points:</strong>
        </DocsParagraph>
        <DocsParagraph>
          • We generate and store your private keys<br/>
          • We manage wallet operations (sending, receiving, signing transactions)<br/>
          • You access funds through your account, not directly on the blockchain<br/>
          • This is different from self-custody wallets where you control your own keys
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="how-it-works" title="How It Works">
        <DocsSubheading>Wallet Creation</DocsSubheading>
        <DocsParagraph>
          When you create an account, we automatically generate a custodial wallet for you. 
          The private keys are encrypted and stored securely on our systems.
        </DocsParagraph>
        <DocsSubheading>Fund Management</DocsSubheading>
        <DocsParagraph>
          When you deposit funds, they are sent to your custodial wallet address. We manage 
          the wallet and execute transactions on your behalf when you trade or withdraw.
        </DocsSubheading>
        <DocsSubheading>Access</DocsSubheading>
        <DocsParagraph>
          You access your funds through your PolyVec account. You do not have direct access 
          to the private keys. This means you cannot import the wallet into other applications.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="risks" title="Risks and Limitations">
        <DocsNote type="warning">
          <strong>You may lose some or all of your funds</strong> held in custodial wallets 
          due to the risks described below.
        </DocsNote>
        <DocsSubheading>Security Risks</DocsSubheading>
        <DocsParagraph>
          • <strong>Security breaches:</strong> Despite our security measures, hackers may 
          attempt to breach our systems and steal funds<br/>
          • <strong>Key compromise:</strong> If private keys are compromised, funds may be 
          stolen<br/>
          • <strong>Internal threats:</strong> Malicious actors within our organization could 
          potentially access funds
        </DocsParagraph>
        <DocsSubheading>Technical Risks</DocsSubheading>
        <DocsParagraph>
          • <strong>Technical failures:</strong> Software bugs, system failures, or operational 
          errors could result in loss of funds<br/>
          • <strong>Blockchain issues:</strong> Network congestion, high fees, or blockchain 
          failures could affect transactions<br/>
          • <strong>Data loss:</strong> Loss of private keys due to technical failures could 
          result in permanent loss of funds
        </DocsParagraph>
        <DocsSubheading>Operational Risks</DocsSubheading>
        <DocsParagraph>
          • <strong>Business failure:</strong> If we become insolvent or cease operations, 
          you may lose access to your funds<br/>
          • <strong>Regulatory action:</strong> Regulatory actions could result in freezing 
          or seizure of funds<br/>
          • <strong>Service suspension:</strong> We may suspend wallet services, potentially 
          affecting your ability to access or withdraw funds
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="not-insured" title="Not Insured">
        <DocsNote type="warning">
          <strong>Funds are NOT insured by:</strong>
        </DocsNote>
        <DocsParagraph>
          • Federal Deposit Insurance Corporation (FDIC)<br/>
          • Securities Investor Protection Corporation (SIPC)<br/>
          • Any other government insurance program<br/>
          • Private insurance (we do not carry insurance for custodial funds)
        </DocsParagraph>
        <DocsParagraph>
          If funds are lost due to security breaches, technical failures, business failure, 
          or any other reason, there is no insurance or guarantee fund to reimburse you.
        </DocsParagraph>
        <DocsParagraph>
          <strong>You bear all risk of loss.</strong>
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="responsibilities" title="Your Responsibilities">
        <DocsParagraph>
          You are responsible for:
        </DocsParagraph>
        <DocsParagraph>
          • Maintaining the security of your account credentials<br/>
          • Monitoring your account for suspicious activity<br/>
          • Reporting security concerns immediately<br/>
          • Understanding that custodial wallets carry inherent risks<br/>
          • Only depositing funds you can afford to lose
        </DocsParagraph>
        <DocsParagraph>
          We are not responsible for losses resulting from:
        </DocsParagraph>
        <DocsParagraph>
          • Your failure to secure your account credentials<br/>
          • Phishing attacks or social engineering targeting you<br/>
          • Your sharing of account information with third parties<br/>
          • Unauthorized access due to your negligence
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="withdrawals" title="Withdrawals">
        <DocsParagraph>
          You may withdraw funds from your custodial wallet at any time, subject to:
        </DocsParagraph>
        <DocsParagraph>
          • Platform availability and technical functionality<br/>
          • Applicable fees (if any)<br/>
          • Processing times (blockchain confirmations may take time)<br/>
          • Regulatory restrictions or compliance requirements<br/>
          • Account verification requirements
        </DocsParagraph>
        <DocsParagraph>
          We reserve the right to delay or suspend withdrawals for security, compliance, or 
          operational reasons. We are not liable for delays in withdrawal processing.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="acknowledgment" title="Acknowledgment">
        <DocsParagraph>
          By using custodial wallet services, you acknowledge that:
        </DocsParagraph>
        <DocsParagraph>
          • You understand that funds are <strong>not insured</strong><br/>
          • You understand the risks described in this disclosure<br/>
          • You may lose some or all of your funds<br/>
          • We are not responsible for losses beyond our reasonable control<br/>
          • You are using custodial services at your own risk
        </DocsParagraph>
        <DocsParagraph>
          <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}

