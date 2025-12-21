/**
 * Payment failed email template
 */

interface PaymentFailedProps {
  amount: number
  currency?: string
  planName: string
  attemptNumber?: number
  maxAttempts?: number
  updatePaymentUrl?: string
}

export const generatePaymentFailedEmail = ({
  amount,
  currency = 'USD',
  planName,
  attemptNumber,
  maxAttempts = 3,
  updatePaymentUrl,
}: PaymentFailedProps): string => {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100)
  
  const attemptsRemaining = maxAttempts - (attemptNumber || 1)
  const isFinalAttempt = attemptsRemaining === 0
  
  const content = `
    <p>We were unable to process your payment for <strong>${planName}</strong>.</p>
    
    <div style="background-color: #fef2f2; padding: 20px; border-radius: 6px; margin: 24px 0; border-left: 4px solid #ef4444;">
      <p style="margin: 0; font-size: 14px; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Payment Failed</p>
      <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 700; color: #1a1a1a;">${formattedAmount}</p>
      <p style="margin: 4px 0 0 0; font-size: 16px; color: #4a4a4a;">${planName}</p>
    </div>
    
    ${isFinalAttempt ? `
      <div style="background-color: #fff7ed; padding: 16px; border-radius: 6px; margin: 24px 0; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; font-weight: 600; color: #92400e;">⚠️ Final Attempt</p>
        <p style="margin: 8px 0 0 0; color: #78350f;">This was your final payment attempt. Your subscription will be downgraded to the Free plan if payment is not updated.</p>
      </div>
    ` : `
      <p>This is attempt ${attemptNumber || 1} of ${maxAttempts}. ${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt remains' : 'attempts remain'} before your subscription is automatically downgraded.</p>
    `}
    
    <h2>What to do next:</h2>
    <ol>
      <li>Check that your payment method is up to date</li>
      <li>Ensure you have sufficient funds available</li>
      <li>Update your payment method if needed</li>
    </ol>
    
    <p>Common reasons for payment failures:</p>
    <ul>
      <li>Insufficient funds</li>
      <li>Expired card</li>
      <li>Card issuer declined the transaction</li>
      <li>Billing address mismatch</li>
    </ul>
    
    ${updatePaymentUrl ? `
      <p><strong>Please update your payment method as soon as possible to avoid service interruption.</strong></p>
    ` : ''}
    
    <p>If you continue to experience issues, please contact your bank or card issuer, or reach out to our support team.</p>
    <p>Best regards,<br><strong>The PolyVec Team</strong></p>
  `
  
  return content
}

