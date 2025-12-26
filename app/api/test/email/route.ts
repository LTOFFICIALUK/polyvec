import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import {
  sendWelcomeProEmail,
  sendPaymentConfirmationEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
  sendRenewalReminderEmail,
} from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/test/email
 * 
 * Returns information about the test email endpoint
 */
export async function GET() {
  return NextResponse.json({
    message: 'This endpoint requires POST. Use the /test-email page to send test emails.',
    availableEmailTypes: [
      'welcome-pro',
      'payment-confirmation',
      'payment-failed',
      'subscription-cancelled',
      'renewal-reminder',
    ],
  })
}

/**
 * POST /api/test/email
 * 
 * Test endpoint to send email notifications
 * TEMPORARY: For testing email templates
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    // Get user email from database
    const db = getDbPool()
    const userResult = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const userEmail = userResult.rows[0].email
    const { emailType } = await request.json()

    if (!emailType) {
      return NextResponse.json(
        { error: 'emailType is required' },
        { status: 400 }
      )
    }

    let result

    switch (emailType) {
      case 'welcome-pro':
        await sendWelcomeProEmail(userEmail)
        result = { success: true, message: 'Welcome Pro email sent', email: userEmail }
        break

      case 'payment-confirmation':
        await sendPaymentConfirmationEmail(userEmail, {
          amount: 4900, // $49.00 in cents
          currency: 'USD',
          planName: 'PolyVec Pro',
        })
        result = { success: true, message: 'Payment confirmation email sent', email: userEmail }
        break

      case 'payment-failed':
        await sendPaymentFailedEmail(userEmail, {
          amount: 4900,
          currency: 'USD',
          planName: 'PolyVec Pro',
          attemptNumber: 1,
          maxAttempts: 3,
        })
        result = { success: true, message: 'Payment failed email sent', email: userEmail }
        break

      case 'subscription-cancelled':
        await sendSubscriptionCancelledEmail(userEmail, {
          planName: 'PolyVec Pro',
          cancellationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        })
        result = { success: true, message: 'Subscription cancelled email sent', email: userEmail }
        break

      case 'renewal-reminder':
        await sendRenewalReminderEmail(userEmail, {
          planName: 'PolyVec Pro',
          renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          amount: 4900,
          currency: 'USD',
        })
        result = { success: true, message: 'Renewal reminder email sent', email: userEmail }
        break

      default:
        return NextResponse.json(
          { error: 'Invalid emailType. Must be: welcome-pro, payment-confirmation, payment-failed, subscription-cancelled, or renewal-reminder' },
          { status: 400 }
        )
    }

    console.log('[Test Email] Email sent:', { emailType, userEmail, userId })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Test Email] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send test email' },
      { status: 500 }
    )
  }
}

