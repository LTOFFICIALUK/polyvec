/**
 * Payment confirmation email template
 */

interface PaymentConfirmationProps {
  amount: number
  currency?: string
  planName: string
  invoiceUrl?: string
}

export const generatePaymentConfirmationEmail = ({
  amount,
  currency = 'USD',
  planName,
  invoiceUrl,
}: PaymentConfirmationProps): string => {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100) // Amount is in cents
  
  const content = `
    <p>Thank you for your payment!</p>
    <p>We've successfully processed your payment for <strong>${planName}</strong>.</p>
    
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 24px 0; border-left: 4px solid #fbbf24;">
      <p style="margin: 0; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Payment Details</p>
      <p style="margin: 8px 0 0 0; font-size: 24px; font-weight: 700; color: #1a1a1a;">${formattedAmount}</p>
      <p style="margin: 4px 0 0 0; font-size: 16px; color: #4a4a4a;">${planName}</p>
    </div>
    
    ${invoiceUrl ? `
      <p>You can view and download your invoice <a href="${invoiceUrl}" style="color: #fbbf24; text-decoration: none; font-weight: 600;">here</a>.</p>
    ` : ''}
    
    <p>Your subscription is now active and you have full access to all Pro features.</p>
    <p>If you have any questions about your payment, please don't hesitate to contact us.</p>
    <p>Best regards,<br><strong>The PolyVec Team</strong></p>
  `
  
  return content
}

