'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function PrivacyPolicyPage() {
  return (
    <DocsPage
      breadcrumb="Policies"
      title="Privacy Policy"
      description="How we collect, use, and protect your information"
      tableOfContents={[
        { name: 'Information We Collect', href: '#collection' },
        { name: 'How We Use Information', href: '#usage' },
        { name: 'Data Sharing', href: '#sharing' },
        { name: 'Security', href: '#security' },
        { name: 'Your Rights', href: '#rights' },
        { name: 'Cookies and Tracking', href: '#cookies' },
        { name: 'Changes to Policy', href: '#changes' },
      ]}
    >
      <DocsNote type="info">
        <strong>Your Privacy Matters:</strong> We are committed to protecting your personal 
        information and being transparent about our data practices.
      </DocsNote>

      <DocsSection id="collection" title="1. Information We Collect">
        <DocsSubheading>Account Information</DocsSubheading>
        <DocsParagraph>
          • Email address<br/>
          • Password (hashed and encrypted)<br/>
          • Profile information (username, profile picture) if provided
        </DocsParagraph>
        <DocsSubheading>Wallet and Trading Information</DocsSubheading>
        <DocsParagraph>
          • Wallet addresses (public blockchain addresses)<br/>
          • Trading history and transaction records<br/>
          • Balance information<br/>
          • Order and position data
        </DocsParagraph>
        <DocsSubheading>Technical Information</DocsSubheading>
        <DocsParagraph>
          • IP address and location data<br/>
          • Device information and browser type<br/>
          • Usage analytics and platform interaction data<br/>
          • Cookies and similar tracking technologies
        </DocsParagraph>
        <DocsSubheading>Communication Data</DocsSubheading>
        <DocsParagraph>
          • Support tickets and correspondence<br/>
          • Feedback and survey responses
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="usage" title="2. How We Use Information">
        <DocsParagraph>
          We use your information to:
        </DocsParagraph>
        <DocsParagraph>
          • Provide and maintain platform services<br/>
          • Process transactions and manage your account<br/>
          • Authenticate your identity and secure your account<br/>
          • Communicate with you about your account and platform updates<br/>
          • Improve our services and develop new features<br/>
          • Comply with legal obligations and prevent fraud<br/>
          • Analyze usage patterns to enhance user experience
        </DocsParagraph>
        <DocsParagraph>
          We do not use your information to provide trading advice or recommendations.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="sharing" title="3. Data Sharing">
        <DocsParagraph>
          We do not sell your personal information. We may share information in the following 
          circumstances:
        </DocsParagraph>
        <DocsSubheading>Service Providers</DocsSubheading>
        <DocsParagraph>
          We may share information with third-party service providers who assist in platform 
          operations (hosting, payment processing, analytics) under strict confidentiality agreements.
        </DocsParagraph>
        <DocsSubheading>Legal Requirements</DocsSubheading>
        <DocsParagraph>
          We may disclose information if required by law, court order, or to comply with 
          regulatory requirements.
        </DocsParagraph>
        <DocsSubheading>Business Transfers</DocsSubheading>
        <DocsParagraph>
          In the event of a merger, acquisition, or sale of assets, your information may be 
          transferred as part of that transaction.
        </DocsParagraph>
        <DocsSubheading>Public Blockchain</DocsSubheading>
        <DocsParagraph>
          Wallet addresses and transaction data on public blockchains (Polygon) are publicly 
          visible and cannot be made private.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="security" title="4. Security">
        <DocsParagraph>
          We implement industry-standard security measures to protect your information:
        </DocsParagraph>
        <DocsParagraph>
          • Encryption of sensitive data in transit and at rest<br/>
          • Secure storage of private keys (encrypted and isolated)<br/>
          • Regular security audits and monitoring<br/>
          • Access controls and authentication requirements
        </DocsParagraph>
        <DocsParagraph>
          However, no system is 100% secure. You are responsible for maintaining the security 
          of your account credentials and should report suspicious activity immediately.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="rights" title="5. Your Rights">
        <DocsParagraph>
          Depending on your jurisdiction, you may have the right to:
        </DocsParagraph>
        <DocsParagraph>
          • Access your personal information<br/>
          • Correct inaccurate information<br/>
          • Request deletion of your information<br/>
          • Object to certain processing activities<br/>
          • Data portability<br/>
          • Withdraw consent where processing is based on consent
        </DocsParagraph>
        <DocsParagraph>
          To exercise these rights, contact us through the platform support channels. We will 
          respond within 30 days.
        </DocsParagraph>
        <DocsParagraph>
          Note: Some information (such as blockchain transaction records) cannot be deleted 
          due to the immutable nature of blockchain technology.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="cookies" title="6. Cookies and Tracking">
        <DocsParagraph>
          We use cookies and similar technologies to:
        </DocsParagraph>
        <DocsParagraph>
          • Maintain your session and authentication state<br/>
          • Remember your preferences<br/>
          • Analyze platform usage and performance<br/>
          • Provide personalized features
        </DocsParagraph>
        <DocsParagraph>
          You can control cookies through your browser settings, though disabling cookies 
          may limit platform functionality.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="changes" title="7. Changes to This Policy">
        <DocsParagraph>
          We may update this Privacy Policy from time to time. We will notify you of material 
          changes by posting the updated policy on the platform and updating the "Last Updated" date.
        </DocsParagraph>
        <DocsParagraph>
          Continued use of the platform after changes constitutes acceptance of the updated policy.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="contact" title="Contact">
        <DocsParagraph>
          For privacy-related questions or to exercise your rights, contact us through the 
          platform support channels.
        </DocsParagraph>
        <DocsParagraph>
          <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}

