# Gmail API Setup Guide

This guide will help you set up Gmail API credentials for sending email notifications.

## Prerequisites

- A Google account (Gmail)
- Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "PolyVec Email Service" (or any name you prefer)
4. Click "Create"

## Step 2: Enable Gmail API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Gmail API"
3. Click on "Gmail API" and click "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External (unless you have a Google Workspace account)
   - App name: "PolyVec"
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"
   - Scopes: Add `https://www.googleapis.com/auth/gmail.send`
   - Click "Save and Continue"
   - Test users: Add your email address
   - Click "Save and Continue"
4. Back to Credentials:
   - Application type: "Web application"
   - Name: "PolyVec Email Service"
   - Authorized redirect URIs: `https://developers.google.com/oauthplayground`
   - Click "Create"
5. **Save the Client ID and Client Secret** - you'll need these for environment variables

## Step 4: Get Refresh Token

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret
5. In the left panel, find "Gmail API v1"
6. Select `https://www.googleapis.com/auth/gmail.send`
7. Click "Authorize APIs"
8. Sign in with your Google account and grant permissions
9. Click "Exchange authorization code for tokens"
10. **Copy the Refresh Token** - you'll need this for environment variables

## Step 5: Set Environment Variables

Add these to your `.env.local` file and Vercel environment variables:

```bash
# Gmail API Credentials
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=your_refresh_token_here
GMAIL_USER_EMAIL=your_email@gmail.com
```

**Important**: 
- Replace `your_email@gmail.com` with the Gmail address you want to send emails from
- This should be the same email you used in the OAuth consent screen

## Step 6: Verify Setup

You can test the email service by running:

```bash
# Create a test script (optional)
npx tsx -e "
import { verifyEmailConnection } from './lib/email-service';
verifyEmailConnection().then(result => {
  console.log('Email connection:', result ? '✅ Success' : '❌ Failed');
});
"
```

## Security Notes

- **Never commit** these credentials to version control
- Store them securely in Vercel environment variables
- The refresh token is long-lived but can be revoked in Google Cloud Console
- Consider using a dedicated Gmail account for sending automated emails

## Troubleshooting

### "Invalid credentials" error
- Verify all environment variables are set correctly
- Check that the refresh token hasn't expired (they don't expire, but can be revoked)
- Ensure the OAuth consent screen is properly configured

### "Access denied" error
- Make sure you added your email as a test user in the OAuth consent screen
- Verify the Gmail API is enabled in your Google Cloud project

### "Quota exceeded" error
- Gmail API has daily sending limits (500 emails/day for free accounts)
- Consider upgrading to Google Workspace for higher limits
- Monitor usage in Google Cloud Console → APIs & Services → Dashboard

## Production Considerations

1. **OAuth Consent Screen**: For production, you'll need to submit your app for verification if you want to send emails to users outside your organization
2. **Sending Limits**: Free Gmail accounts have a 500 emails/day limit. Consider:
   - Using Google Workspace (2,000 emails/day)
   - Using a dedicated email service (SendGrid, Resend, etc.) for higher volumes
3. **Monitoring**: Set up alerts in Google Cloud Console to monitor API usage

## Alternative: Use App Password (Simpler but Less Secure)

If you prefer a simpler setup without OAuth:

1. Enable 2-Step Verification on your Google account
2. Go to [Google Account Settings](https://myaccount.google.com/apppasswords)
3. Generate an app password for "Mail"
4. Use nodemailer with SMTP instead of OAuth2

However, OAuth2 is recommended for better security and compliance.

