/**
 * Subscription cancelled email template
 */

interface SubscriptionCancelledProps {
  planName: string
  cancellationDate?: string
  reactivateUrl?: string
}

export const generateSubscriptionCancelledEmail = ({
  planName,
  cancellationDate,
  reactivateUrl,
}: SubscriptionCancelledProps): string => {
  const content = `
    <p>We're sorry to see you go.</p>
    <p>Your <strong>${planName}</strong> subscription has been cancelled.</p>
    
    ${cancellationDate ? `
      <p>Your subscription will remain active until <strong>${cancellationDate}</strong>. After that date, you'll be moved to the Free plan.</p>
    ` : `
      <p>You've been moved to the Free plan. You'll still have access to the Trading Terminal and Analytics, but automated strategies will no longer be available.</p>
    `}
    
    <h2>What happens next:</h2>
    <ul>
      <li>You'll retain access to Pro features until your current billing period ends</li>
      <li>After that, you'll automatically be moved to the Free plan</li>
      <li>Your trading data and history will be preserved</li>
      <li>You can reactivate your subscription at any time</li>
    </ul>
    
    ${reactivateUrl ? `
      <p>If you change your mind, you can reactivate your subscription anytime.</p>
    ` : ''}
    
    <p>We'd love to hear your feedback on how we can improve. If you have a moment, please let us know why you cancelled.</p>
    <p>Thank you for being part of the PolyVec community!</p>
    <p>Best regards,<br><strong>The PolyVec Team</strong></p>
  `
  
  return content
}

