import { NextRequest, NextResponse } from 'next/server'
import { getDbPool } from '@/lib/db'
import { sendRenewalReminderEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

/**
 * POST /api/cron/send-renewal-reminders
 * 
 * Cron job endpoint to send renewal reminder emails
 * Should be called daily from VPS cron job
 * 
 * Security: Protected by CRON_SECRET environment variable
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret (prevents unauthorized access)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET not configured')
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron] Unauthorized cron request')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const db = getDbPool()
    
    // Find subscriptions renewing in 3-7 days
    // This gives users enough time to update payment info if needed
    const result = await db.query(
      `SELECT 
        s.user_id,
        s.current_period_end,
        u.email,
        s.plan_tier
      FROM subscriptions s
      INNER JOIN users u ON s.user_id = u.id
      WHERE s.status = 'active'
        AND s.cancel_at_period_end = false
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end BETWEEN NOW() + INTERVAL '3 days' AND NOW() + INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM payments 
          WHERE user_id = s.user_id 
          AND reason = 'renewal_reminder_sent'
          AND created_at > NOW() - INTERVAL '1 day'
        )`,
      []
    )

    const subscriptions = result.rows
    console.log(`[Cron] Found ${subscriptions.length} subscriptions renewing in 3-7 days`)

    let sentCount = 0
    let errorCount = 0

    for (const sub of subscriptions) {
      try {
        const renewalDate = new Date(sub.current_period_end).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

        // Get subscription amount (default to $49.00 for Pro)
        const amount = 4900 // $49.00 in cents
        const planName = sub.plan_tier === 'pro' ? 'PolyVec Pro' : 'PolyVec'

        await sendRenewalReminderEmail(sub.email, {
          planName,
          renewalDate,
          amount,
          currency: 'USD',
        })

        // Record that we sent the reminder (optional - prevents duplicate sends)
        await db.query(
          `INSERT INTO payments (
            user_id,
            plan_tier,
            amount,
            currency,
            payment_method,
            status,
            reason,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sub.user_id,
            sub.plan_tier,
            0, // No actual payment, just tracking
            'USD',
            'system',
            'completed',
            'renewal_reminder_sent',
            JSON.stringify({ renewal_date: sub.current_period_end }),
          ]
        )

        sentCount++
        console.log(`[Cron] Sent renewal reminder to ${sub.email}`)
      } catch (error: any) {
        errorCount++
        console.error(`[Cron] Failed to send renewal reminder to ${sub.email}:`, error.message)
        // Continue with other subscriptions even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${subscriptions.length} subscriptions`,
      sent: sentCount,
      errors: errorCount,
    })
  } catch (error: any) {
    console.error('[Cron] Error processing renewal reminders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process renewal reminders' },
      { status: 500 }
    )
  }
}

