import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDbPool } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/email-service'
import { generateBaseEmailTemplate } from '@/lib/email-templates/base'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

/**
 * GET /api/admin/emails/campaigns
 * Get all email campaigns
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const authCheck = await requireAdmin(userId)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 })
    }

    const db = getDbPool()
    const result = await db.query(
      `SELECT 
        id,
        campaign_id,
        name,
        subject,
        target_audience,
        status,
        scheduled_at,
        sent_at,
        total_recipients,
        total_sent,
        total_opened,
        total_clicked,
        created_at,
        updated_at
      FROM email_campaigns
      ORDER BY created_at DESC
      LIMIT 100`
    )

    return NextResponse.json({ campaigns: result.rows })
  } catch (error: any) {
    console.error('[Admin Campaigns] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch campaigns' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/emails/campaigns
 * Create and send email campaign
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as number

    const authCheck = await requireAdmin(userId)
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 })
    }

    const body = await request.json()
    const { name, subject, htmlContent, targetAudience, customUserIds, sendImmediately } = body

    if (!name || !subject || !htmlContent || !targetAudience) {
      return NextResponse.json(
        { error: 'Missing required fields: name, subject, htmlContent, targetAudience' },
        { status: 400 }
      )
    }

    const db = getDbPool()
    const campaignId = `campaign_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`

    // Get recipient list based on target audience
    let recipientQuery = ''
    if (targetAudience === 'all') {
      recipientQuery = "SELECT id, email FROM users WHERE is_active = TRUE AND is_banned = FALSE"
    } else if (targetAudience === 'pro') {
      recipientQuery = "SELECT id, email FROM users WHERE plan_tier = 'pro' AND is_active = TRUE AND is_banned = FALSE"
    } else if (targetAudience === 'free') {
      recipientQuery = "SELECT id, email FROM users WHERE plan_tier = 'free' AND is_active = TRUE AND is_banned = FALSE"
    } else if (targetAudience === 'custom' && customUserIds && Array.isArray(customUserIds)) {
      const userIds = customUserIds.map((id: number) => id.toString()).join(',')
      recipientQuery = `SELECT id, email FROM users WHERE id IN (${userIds}) AND is_active = TRUE AND is_banned = FALSE`
    } else {
      return NextResponse.json({ error: 'Invalid target audience' }, { status: 400 })
    }

    const recipientsResult = await db.query(recipientQuery)
    const recipients = recipientsResult.rows

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    // Create campaign record
    await db.query(
      `INSERT INTO email_campaigns (
        campaign_id,
        name,
        subject,
        html_content,
        target_audience,
        custom_user_ids,
        status,
        total_recipients,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        campaignId,
        name,
        subject,
        htmlContent,
        targetAudience,
        targetAudience === 'custom' ? customUserIds : null,
        sendImmediately ? 'sending' : 'draft',
        recipients.length,
        userId,
      ]
    )

    // Send emails if requested
    if (sendImmediately) {
      let sentCount = 0
      let errorCount = 0

      for (const recipient of recipients) {
        try {
          const html = generateBaseEmailTemplate({
            title: subject,
            previewText: subject,
            content: htmlContent,
            ctaText: undefined,
            ctaUrl: undefined,
          })

          await sendEmail({
            to: recipient.email,
            subject,
            html,
          })

          // Record email analytics
          await db.query(
            `INSERT INTO email_analytics (
              campaign_id,
              email_type,
              recipient_email,
              user_id,
              subject
            ) VALUES ($1, $2, $3, $4, $5)`,
            [campaignId, 'campaign', recipient.email, recipient.id, subject]
          )

          sentCount++
        } catch (error: any) {
          console.error(`[Campaign] Failed to send to ${recipient.email}:`, error)
          errorCount++
        }
      }

      // Update campaign status
      await db.query(
        `UPDATE email_campaigns 
         SET status = 'sent',
             sent_at = CURRENT_TIMESTAMP,
             total_sent = $1
         WHERE campaign_id = $2`,
        [sentCount, campaignId]
      )

      return NextResponse.json({
        success: true,
        campaignId,
        message: `Campaign sent to ${sentCount} recipients`,
        sent: sentCount,
        errors: errorCount,
      })
    }

    return NextResponse.json({
      success: true,
      campaignId,
      message: 'Campaign created (draft)',
      recipients: recipients.length,
    })
  } catch (error: any) {
    console.error('[Admin Campaign] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create campaign' },
      { status: 500 }
    )
  }
}

