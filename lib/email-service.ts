/**
 * Email Service using Gmail API
 * Self-hosted email notifications for subscription events
 */

import { google } from 'googleapis'

// Gmail API OAuth2 configuration
const getGmailClient = async () => {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  const userEmail = process.env.GMAIL_USER_EMAIL

  if (!clientId || !clientSecret || !refreshToken || !userEmail) {
    throw new Error('Gmail API credentials not configured. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER_EMAIL')
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground' // Redirect URI
  )

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  return { gmail, userEmail }
}

export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Send email using Gmail API
 */
export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const { gmail, userEmail } = await getGmailClient()
    
    // Create email message in RFC 2822 format
    const message = [
      `From: PolyVec <${userEmail}>`,
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      `Content-Type: text/html; charset=utf-8`,
      '',
      options.html,
    ].join('\n')

    // Encode message in base64url format (Gmail API requirement)
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    })

    console.log('[Email Service] Email sent successfully:', {
      messageId: response.data.id,
      threadId: response.data.threadId,
      to: options.to,
      subject: options.subject,
    })
  } catch (error: any) {
    console.error('[Email Service] Failed to send email:', {
      to: options.to,
      subject: options.subject,
      error: error.message,
      details: error.response?.data,
    })
    throw error
  }
}

/**
 * Verify Gmail API connection
 */
export const verifyEmailConnection = async (): Promise<boolean> => {
  try {
    const { gmail } = await getGmailClient()
    // Test connection by getting user profile
    await gmail.users.getProfile({ userId: 'me' })
    console.log('[Email Service] Gmail connection verified')
    return true
  } catch (error: any) {
    console.error('[Email Service] Gmail connection failed:', error.message)
    return false
  }
}

