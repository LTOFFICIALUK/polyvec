'use client'

import { DocsPage, DocsSection, DocsParagraph, DocsNote, DocsSubheading } from '@/components/DocsPage'

export default function RiskDisclosurePage() {
  return (
    <DocsPage
      breadcrumb="Policies"
      title="Risk Disclosure"
      description="Important risks associated with prediction market trading"
      tableOfContents={[
        { name: 'Trading Risks', href: '#trading' },
        { name: 'Market Risks', href: '#market' },
        { name: 'Technical Risks', href: '#technical' },
        { name: 'Regulatory Risks', href: '#regulatory' },
        { name: 'Custodial Risks', href: '#custodial' },
        { name: 'No Guarantees', href: '#guarantees' },
      ]}
    >
      <DocsNote type="warning">
        <strong>Warning:</strong> Trading prediction markets involves substantial risk of loss. 
        You may lose some or all of your invested capital.
      </DocsNote>

      <DocsSection id="trading" title="Trading Risks">
        <DocsSubheading>Price Volatility</DocsSubheading>
        <DocsParagraph>
          Prediction market prices can be highly volatile. Prices may move rapidly and 
          unpredictably based on news, events, or market sentiment. You may experience 
          significant losses in a short period.
        </DocsParagraph>
        <DocsSubheading>Liquidity Risks</DocsSubheading>
        <DocsParagraph>
          Some markets may have limited liquidity, making it difficult to enter or exit 
          positions at desired prices. Low liquidity can result in wider bid-ask spreads 
          and slippage.
        </DocsParagraph>
        <DocsSubheading>Execution Risks</DocsSubheading>
        <DocsParagraph>
          Orders may not execute at expected prices due to market movements, network 
          delays, or technical issues. Partial fills and rejected orders are possible.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="market" title="Market Risks">
        <DocsSubheading>Market Closure</DocsSubheading>
        <DocsParagraph>
          Markets may close or be suspended at any time. If a market closes before you 
          can exit your position, you may be forced to hold until resolution, which could 
          result in losses.
        </DocsParagraph>
        <DocsSubheading>Resolution Disputes</DocsSubheading>
        <DocsParagraph>
          Market resolutions are determined by market operators. Disputes over resolution 
          outcomes may delay payouts or result in unexpected outcomes.
        </DocsParagraph>
        <DocsSubheading>Market Manipulation</DocsSubheading>
        <DocsParagraph>
          Markets may be subject to manipulation by large traders or coordinated groups. 
          This can cause prices to move in ways that do not reflect true probabilities.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="technical" title="Technical Risks">
        <DocsSubheading>Platform Availability</DocsSubheading>
        <DocsParagraph>
          The platform may experience downtime, maintenance, or technical failures. During 
          these periods, you may not be able to access your account or execute trades.
        </DocsParagraph>
        <DocsSubheading>Network Issues</DocsSubheading>
        <DocsParagraph>
          Blockchain network congestion, high gas fees, or network failures can prevent 
          or delay transactions. You may incur additional costs or miss trading opportunities.
        </DocsParagraph>
        <DocsSubheading>Software Bugs</DocsSubheading>
        <DocsParagraph>
          Software bugs or errors may cause incorrect order execution, display errors, or 
          data inconsistencies. We are not responsible for losses resulting from software errors.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="regulatory" title="Regulatory Risks">
        <DocsSubheading>Regulatory Changes</DocsSubheading>
        <DocsParagraph>
          Laws and regulations governing prediction markets may change. New regulations 
          could restrict or prohibit trading, require additional compliance, or affect 
          market operations.
        </DocsParagraph>
        <DocsSubheading>Jurisdictional Issues</DocsSubheading>
        <DocsParagraph>
          Prediction markets may be illegal or restricted in your jurisdiction. You are 
          responsible for ensuring your use of the platform complies with local laws.
        </DocsParagraph>
        <DocsSubheading>Enforcement Actions</DocsSubheading>
        <DocsParagraph>
          Regulatory authorities may take enforcement actions against platforms or users, 
          potentially resulting in account freezes, asset seizures, or legal consequences.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="custodial" title="Custodial Risks">
        <DocsSubheading>Third-Party Custody</DocsSubheading>
        <DocsParagraph>
          Funds held in custodial wallets are controlled by third parties. If the custodian 
          experiences security breaches, insolvency, or operational failures, you may lose 
          access to your funds.
        </DocsParagraph>
        <DocsSubheading>No Insurance</DocsSubheading>
        <DocsParagraph>
          Custodial funds are not insured by FDIC, SIPC, or any other insurance program. 
          Losses due to security breaches, technical failures, or business failures are not 
          covered by insurance.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="guarantees" title="No Guarantees">
        <DocsNote type="warning">
          <strong>No Guarantees:</strong> We make no guarantees about:
        </DocsNote>
        <DocsParagraph>
          • Market outcomes or prices<br/>
          • Platform availability or uptime<br/>
          • Order execution speed or prices<br/>
          • Profitability of any trading strategy<br/>
          • Security of funds or data<br/>
          • Regulatory compliance in your jurisdiction
        </DocsParagraph>
        <DocsParagraph>
          <strong>You trade at your own risk.</strong> Past performance does not guarantee 
          future results. You should only trade with funds you can afford to lose.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="acknowledgment" title="Acknowledgment">
        <DocsParagraph>
          By using this platform, you acknowledge that:
        </DocsParagraph>
        <DocsParagraph>
          • You understand the risks described in this disclosure<br/>
          • You may lose some or all of your invested capital<br/>
          • You are trading at your own risk<br/>
          • We are not responsible for your trading losses<br/>
          • You have read and understood this risk disclosure
        </DocsParagraph>
        <DocsParagraph>
          <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}

