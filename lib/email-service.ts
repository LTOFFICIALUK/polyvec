/**
 * Email Service using Gmail API
 * Self-hosted email notifications for subscription events
 */

import { google } from 'googleapis'
import nodemailer from 'nodemailer'

// Gmail API OAuth2 configuration
const getGmailTransporter = async () => {
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

  const accessToken = await oauth2Client.getAccessToken()

  if (!accessToken.token) {
    throw new Error('Failed to get Gmail access token')
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: userEmail,
      clientId,
      clientSecret,
      refreshToken,
      accessToken: accessToken.token,
    },
  })

  return transporter
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
    const transporter = await getGmailTransporter()
    
    const mailOptions = {
      from: {
        name: 'PolyVec',
        address: process.env.GMAIL_USER_EMAIL || 'noreply@polyvec.com',
      },
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.subject, // Fallback text version
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('[Email Service] Email sent successfully:', {
      messageId: info.messageId,
      to: options.to,
      subject: options.subject,
    })
  } catch (error: any) {
    console.error('[Email Service] Failed to send email:', {
      to: options.to,
      subject: options.subject,
      error: error.message,
    })
    throw error
  }
}

/**
 * Verify Gmail API connection
 */
export const verifyEmailConnection = async (): Promise<boolean> => {
  try {
    const transporter = await getGmailTransporter()
    await transporter.verify()
    console.log('[Email Service] Gmail connection verified')
    return true
  } catch (error: any) {
    console.error('[Email Service] Gmail connection failed:', error.message)
    return false
  }
}

