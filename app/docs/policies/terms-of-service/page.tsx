'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function TermsOfServicePage() {
  return (
    <DocsPage
      breadcrumb="Policies"
      title="Terms of Service"
      description="Terms and conditions for using PolyVec platform"
      tableOfContents={[
        { name: 'Acceptance of Terms', href: '#acceptance' },
        { name: 'Platform Services', href: '#services' },
        { name: 'User Responsibilities', href: '#responsibilities' },
        { name: 'Risk and Disclaimers', href: '#disclaimers' },
        { name: 'Custodial Wallets', href: '#custodial' },
        { name: 'Limitation of Liability', href: '#liability' },
        { name: 'Termination', href: '#termination' },
      ]}
    >
      <DocsNote type="warning">
        <strong>Important:</strong> By using PolyVec, you agree to these terms. Please read them carefully.
      </DocsNote>

      <DocsSection id="acceptance" title="1. Acceptance of Terms">
        <DocsParagraph>
          By accessing or using PolyVec, you agree to be bound by these Terms of Service. 
          If you do not agree to these terms, you must not use the platform.
        </DocsParagraph>
        <DocsParagraph>
          We reserve the right to modify these terms at any time. Continued use of the platform 
          after changes constitutes acceptance of the modified terms.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="services" title="2. Platform Services">
        <DocsParagraph>
          PolyVec provides trading tools and infrastructure for prediction market trading. 
          We provide <strong>tools, not advice</strong>. All trading decisions are made by you.
        </DocsParagraph>
        <DocsSubheading>What We Provide</DocsSubheading>
        <DocsParagraph>
          • Trading interface and order execution tools<br/>
          • Market data and analytics<br/>
          • Custodial wallet services<br/>
          • API access for developers
        </DocsParagraph>
        <DocsSubheading>What We Do Not Provide</DocsSubheading>
        <DocsParagraph>
          • Trading advice or recommendations<br/>
          • Guarantees of outcomes or profits<br/>
          • Investment advice<br/>
          • Market predictions or signals
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="responsibilities" title="3. User Responsibilities">
        <DocsParagraph>
          You are solely responsible for:
        </DocsParagraph>
        <DocsParagraph>
          • All trading decisions and their outcomes<br/>
          • Maintaining the security of your account credentials<br/>
          • Compliance with applicable laws and regulations<br/>
          • Verifying the accuracy of market information before trading<br/>
          • Understanding the risks associated with prediction market trading
        </DocsParagraph>
        <DocsParagraph>
          You must be of legal age in your jurisdiction to use this platform. You represent 
          that you have the legal capacity to enter into these terms.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="disclaimers" title="4. Risk and Disclaimers">
        <DocsNote type="warning">
          <strong>No Guarantees:</strong> We make no guarantees about market outcomes, 
          trading results, or platform availability. Trading involves substantial risk of loss.
        </DocsNote>
        <DocsParagraph>
          <strong>You make your own decisions.</strong> All trading activity is at your own risk. 
          Past performance does not guarantee future results.
        </DocsParagraph>
        <DocsParagraph>
          The platform may experience downtime, technical issues, or delays. We are not 
          liable for losses resulting from platform unavailability or technical failures.
        </DocsParagraph>
        <DocsParagraph>
          Market data and analytics are provided for informational purposes only. They are 
          historical context, not predictions. Do not rely on them as the sole basis for 
          trading decisions.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="custodial" title="5. Custodial Wallets">
        <DocsNote type="warning">
          <strong>Custodial, Not Insured:</strong> Funds held in custodial wallets are not 
          insured by FDIC, SIPC, or any other insurance program.
        </DocsNote>
        <DocsParagraph>
          PolyVec provides custodial wallet services for your convenience. We hold your 
          private keys and manage wallet operations on your behalf.
        </DocsParagraph>
        <DocsParagraph>
          <strong>Important:</strong> While we implement security measures, custodial wallets 
          carry inherent risks including potential loss due to security breaches, technical 
          failures, or operational errors.
        </DocsParagraph>
        <DocsParagraph>
          You acknowledge that funds in custodial wallets are not insured and that you may 
          lose some or all of your funds. We are not responsible for losses resulting from 
          security breaches, technical failures, or other events beyond our reasonable control.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="liability" title="6. Limitation of Liability">
        <DocsParagraph>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, POLYVEC AND ITS AFFILIATES SHALL NOT BE 
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, 
          INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR USE.
        </DocsParagraph>
        <DocsParagraph>
          Our total liability for any claims arising from your use of the platform shall not 
          exceed the amount of fees you paid to us in the 12 months preceding the claim.
        </DocsParagraph>
        <DocsParagraph>
          We are not liable for losses resulting from:
        </DocsParagraph>
        <DocsParagraph>
          • Your trading decisions<br/>
          • Market volatility or adverse market conditions<br/>
          • Technical failures or platform downtime<br/>
          • Security breaches (subject to our security measures)<br/>
          • Regulatory changes or legal restrictions
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="termination" title="7. Termination">
        <DocsParagraph>
          We may suspend or terminate your account at any time for violation of these terms, 
          suspicious activity, or for any other reason at our sole discretion.
        </DocsParagraph>
        <DocsParagraph>
          You may close your account at any time. Upon account closure, you may withdraw 
          remaining funds subject to applicable fees and processing times.
        </DocsParagraph>
        <DocsParagraph>
          Sections of these terms that by their nature should survive termination (including 
          disclaimers, limitations of liability, and dispute resolution) shall survive.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="contact" title="Contact">
        <DocsParagraph>
          For questions about these terms, contact us through the platform support channels.
        </DocsParagraph>
        <DocsParagraph>
          <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}

