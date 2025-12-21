/**
 * Subscription renewal reminder email template
 */

interface RenewalReminderProps {
  planName: string
  renewalDate: string
  amount: number
  currency?: string
  manageSubscriptionUrl?: string
}

export const generateRenewalReminderEmail = ({
  planName,
  renewalDate,
  amount,
  currency = 'USD',
  manageSubscriptionUrl,
}: RenewalReminderProps): string => {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100)
  
  const content = `
    <p>This is a friendly reminder that your <strong>${planName}</strong> subscription will renew soon.</p>
    
    <div style="background-color: #f0fdf4; padding: 20px; border-radius: 6px; margin: 24px 0; border-left: 4px solid #22c55e;">
      <p style="margin: 0; font-size: 14px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Renewal Details</p>
      <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700; color: #1a1a1a;">${formattedAmount}</p>
      <p style="margin: 4px 0 0 0; font-size: 16px; color: #4a4a4a;">Renews on ${renewalDate}</p>
    </div>
    
    <p>Your payment method on file will be charged automatically. No action is required from you.</p>
    
    ${manageSubscriptionUrl ? `
      <p>If you'd like to update your payment method or cancel your subscription, you can do so in your account settings.</p>
    ` : ''}
    
    <p>Thank you for being a valued PolyVec Pro member!</p>
    <p>Best regards,<br><strong>The PolyVec Team</strong></p>
  `
  
  return content
}

