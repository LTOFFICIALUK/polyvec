/**
 * Email template helpers
 * Combines base template with specific email content
 */

import { generateBaseEmailTemplate } from './base'
import { generateWelcomeProEmail } from './welcome-pro'
import { generatePaymentConfirmationEmail } from './payment-confirmation'
import { generatePaymentFailedEmail } from './payment-failed'
import { generateSubscriptionCancelledEmail } from './subscription-cancelled'
import { generateRenewalReminderEmail } from './renewal-reminder'
import { sendEmail } from '../email-service'

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://polyvec.com'

/**
 * Send welcome email when user upgrades to Pro
 */
export const sendWelcomeProEmail = async (
  to: string,
  userName?: string
): Promise<void> => {
  const content = generateWelcomeProEmail(userName)
  const html = generateBaseEmailTemplate({
    title: 'Welcome to PolyVec Pro! 🎉',
    previewText: 'You now have access to our full suite of professional trading tools.',
    content,
    ctaText: 'Start Trading',
    ctaUrl: `${baseUrl}/terminal`,
  })

  await sendEmail({
    to,
    subject: 'Welcome to PolyVec Pro!',
    html,
  })
}

/**
 * Send payment confirmation email
 */
export const sendPaymentConfirmationEmail = async (
  to: string,
  options: {
    amount: number
    currency?: string
    planName: string
    invoiceUrl?: string
  }
): Promise<void> => {
  const content = generatePaymentConfirmationEmail(options)
  const html = generateBaseEmailTemplate({
    title: 'Payment Confirmed',
    previewText: `Your payment of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: options.currency || 'USD' }).format(options.amount / 100)} has been processed.`,
    content,
    ctaText: 'View Subscription',
    ctaUrl: `${baseUrl}/terminal`,
  })

  await sendEmail({
    to,
    subject: `Payment Confirmed - ${options.planName}`,
    html,
  })
}

/**
 * Send payment failed email
 */
export const sendPaymentFailedEmail = async (
  to: string,
  options: {
    amount: number
    currency?: string
    planName: string
    attemptNumber?: number
    maxAttempts?: number
  }
): Promise<void> => {
  const updatePaymentUrl = `${baseUrl}/terminal?openPlanModal=true`
  const content = generatePaymentFailedEmail({
    ...options,
    updatePaymentUrl,
  })
  
  const html = generateBaseEmailTemplate({
    title: 'Payment Failed - Action Required',
    previewText: 'We were unable to process your subscription payment. Please update your payment method.',
    content,
    ctaText: 'Update Payment Method',
    ctaUrl: updatePaymentUrl,
  })

  await sendEmail({
    to,
    subject: 'Payment Failed - Action Required',
    html,
  })
}

/**
 * Send subscription cancelled email
 */
export const sendSubscriptionCancelledEmail = async (
  to: string,
  options: {
    planName: string
    cancellationDate?: string
  }
): Promise<void> => {
  const reactivateUrl = `${baseUrl}/terminal?openPlanModal=true`
  const content = generateSubscriptionCancelledEmail({
    ...options,
    reactivateUrl,
  })
  
  const html = generateBaseEmailTemplate({
    title: 'Subscription Cancelled',
    previewText: 'Your subscription has been cancelled. You can reactivate anytime.',
    content,
    ctaText: 'Reactivate Subscription',
    ctaUrl: reactivateUrl,
  })

  await sendEmail({
    to,
    subject: 'Your PolyVec Subscription Has Been Cancelled',
    html,
  })
}

/**
 * Send renewal reminder email
 */
export const sendRenewalReminderEmail = async (
  to: string,
  options: {
    planName: string
    renewalDate: string
    amount: number
    currency?: string
  }
): Promise<void> => {
  const manageSubscriptionUrl = `${baseUrl}/terminal?openPlanModal=true`
  const content = generateRenewalReminderEmail({
    ...options,
    manageSubscriptionUrl,
  })
  
  const html = generateBaseEmailTemplate({
    title: 'Subscription Renewal Reminder',
    previewText: `Your ${options.planName} subscription will renew on ${options.renewalDate}.`,
    content,
    ctaText: 'Manage Subscription',
    ctaUrl: manageSubscriptionUrl,
  })

  await sendEmail({
    to,
    subject: `Your ${options.planName} Subscription Renews Soon`,
    html,
  })
}

