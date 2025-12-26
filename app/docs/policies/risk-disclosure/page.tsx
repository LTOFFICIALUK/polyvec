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
        <strong>Critical:</strong> Trading prediction markets involves substantial risk of loss. 
        You may lose some or all of your funds. Only trade with money you can afford to lose.
      </DocsNote>

      <DocsSection id="trading" title="1. Trading Risks">
        <DocsParagraph>
          <strong>You make your own trading decisions.</strong> All trades are executed at your 
          discretion. We provide tools, not advice.
        </DocsParagraph>
        <DocsSubheading>Loss of Capital</DocsSubheading>
        <DocsParagraph>
          You can lose your entire investment or more. Prediction markets are zero-sum: for 
          every winner, there is a loser. Most traders lose money over time.
        </DocsParagraph>
        <DocsSubheading>Liquidity Risk</DocsSubheading>
        <DocsParagraph>
          Markets may have limited liquidity, making it difficult to enter or exit positions 
          at desired prices. You may be unable to close positions when you want to.
        </DocsParagraph>
        <DocsSubheading>Price Volatility</DocsSubheading>
        <DocsParagraph>
          Market prices can move rapidly and unpredictably. You may experience significant 
          losses in short periods of time.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="market" title="2. Market Risks">
        <DocsSubheading>Market Manipulation</DocsSubheading>
        <DocsParagraph>
          Markets may be subject to manipulation, coordinated trading, or other activities 
          that affect prices in ways that are difficult to predict.
        </DocsSubheading>
        <DocsSubheading>Resolution Disputes</DocsSubheading>
        <DocsParagraph>
          Market outcomes may be disputed or resolved incorrectly, potentially affecting your 
          positions. We are not responsible for market resolution decisions made by third parties.
        </DocsSubheading>
        <DocsSubheading>Market Closure</DocsSubheading>
        <DocsParagraph>
          Markets may close early, be cancelled, or fail to resolve, potentially resulting in 
          loss of your investment.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="technical" title="3. Technical Risks">
        <DocsSubheading>Platform Availability</DocsSubheading>
        <DocsParagraph>
          The platform may experience downtime, technical failures, or delays. We are not liable 
          for losses resulting from platform unavailability.
        </DocsSubheading>
        <DocsSubheading>Execution Errors</DocsSubheading>
        <DocsParagraph>
          Orders may fail to execute, execute at incorrect prices, or execute partially. 
          Technical glitches may affect order processing.
        </DocsSubheading>
        <DocsSubheading>Data Accuracy</DocsSubheading>
        <DocsParagraph>
          Market data, analytics, and insights are provided for informational purposes only. 
          They are historical context, not predictions. Do not rely on them as guarantees.
        </DocsParagraph>
        <DocsSubheading>Network and Blockchain Risks</DocsSubheading>
        <DocsParagraph>
          Blockchain networks may experience congestion, high fees, or failures. Transactions 
          may be delayed or fail, potentially affecting your ability to trade or withdraw funds.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="regulatory" title="4. Regulatory Risks">
        <DocsParagraph>
          Prediction market trading may be restricted or prohibited in your jurisdiction. 
          Regulatory changes could affect platform availability or your ability to trade.
        </DocsParagraph>
        <DocsParagraph>
          You are responsible for compliance with applicable laws. We may restrict access 
          from certain jurisdictions or suspend accounts to comply with regulations.
        </DocsParagraph>
        <DocsParagraph>
          Tax obligations vary by jurisdiction. You are responsible for reporting and paying 
          taxes on trading activity.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="custodial" title="5. Custodial Risks">
        <DocsNote type="warning">
          <strong>Custodial, Not Insured:</strong> Funds in custodial wallets are not insured 
          by FDIC, SIPC, or any other insurance program.
        </DocsNote>
        <DocsParagraph>
          While we implement security measures, custodial wallets carry risks:
        </DocsParagraph>
        <DocsParagraph>
          • Security breaches or hacking attempts<br/>
          • Technical failures or operational errors<br/>
          • Loss of private keys or access credentials<br/>
          • Insolvency or business failure
        </DocsParagraph>
        <DocsParagraph>
          You may lose some or all funds held in custodial wallets. We are not responsible 
          for losses resulting from security breaches, technical failures, or events beyond 
          our reasonable control.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="guarantees" title="6. No Guarantees">
        <DocsParagraph>
          <strong>We make no guarantees about:</strong>
        </DocsParagraph>
        <DocsParagraph>
          • Market outcomes or trading results<br/>
          • Platform availability or uptime<br/>
          • Accuracy of market data or analytics<br/>
          • Profitability of any trading strategy<br/>
          • Security of funds (beyond our security measures)
        </DocsParagraph>
        <DocsParagraph>
          <strong>Past performance does not guarantee future results.</strong> Historical 
          market data and analytics are for informational purposes only. They are not 
          predictions or guarantees of future performance.
        </DocsParagraph>
        <DocsParagraph>
          All trading involves risk. You should only trade with funds you can afford to lose 
          completely.
        </DocsParagraph>
      </DocsSection>

      <DocsSection id="acknowledgment" title="Acknowledgment">
        <DocsParagraph>
          By using PolyVec, you acknowledge that you have read, understood, and accept 
          these risks. You understand that trading involves substantial risk of loss and 
          that you are solely responsible for your trading decisions.
        </DocsParagraph>
        <DocsParagraph>
          <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </DocsParagraph>
      </DocsSection>
    </DocsPage>
  )
}

