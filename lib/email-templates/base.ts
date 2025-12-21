/**
 * Base email template with dark mode support
 * Automatically adapts to user's device preferences
 */

interface BaseEmailTemplateProps {
  title: string
  previewText?: string
  content: string
  ctaText?: string
  ctaUrl?: string
  footerText?: string
}

export const generateBaseEmailTemplate = ({
  title,
  previewText,
  content,
  ctaText,
  ctaUrl,
  footerText = 'Thank you for using PolyVec!',
}: BaseEmailTemplateProps): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  ${previewText ? `<meta name="description" content="${previewText}">` : ''}
  <style>
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body {
        color: #e5e5e5;
        background-color: #0a0a0a;
      }
      
      .email-container {
        background-color: #1a1a1a !important;
        border-color: #333333 !important;
      }
      
      .email-header {
        background-color: #0f0f0f !important;
        border-bottom-color: #333333 !important;
      }
      
      .email-content {
        color: #e5e5e5 !important;
      }
      
      .email-content h1 {
        color: #ffffff !important;
      }
      
      .email-content h2 {
        color: #f5f5f5 !important;
      }
      
      .email-content p {
        color: #d5d5d5 !important;
      }
      
      .cta-button {
        background-color: #fbbf24 !important;
        color: #000000 !important;
      }
      
      .cta-button:hover {
        background-color: #f59e0b !important;
      }
      
      .email-footer {
        color: #999999 !important;
        border-top-color: #333333 !important;
      }
      
      .email-footer a {
        color: #fbbf24 !important;
      }
    }
    
    /* Container */
    .email-wrapper {
      width: 100%;
      min-height: 100vh;
      padding: 20px;
      background-color: #f5f5f5;
    }
    
    @media (prefers-color-scheme: dark) {
      .email-wrapper {
        background-color: #0a0a0a;
      }
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border: 1px solid #e5e5e5;
    }
    
    /* Header */
    .email-header {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      padding: 32px 24px;
      text-align: center;
      border-bottom: 1px solid #333333;
    }
    
    .logo {
      font-size: 28px;
      font-weight: 700;
      color: #fbbf24;
      letter-spacing: 1px;
      text-decoration: none;
    }
    
    /* Content */
    .email-content {
      padding: 40px 32px;
      color: #1a1a1a;
    }
    
    .email-content h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 16px;
      line-height: 1.3;
    }
    
    .email-content h2 {
      font-size: 20px;
      font-weight: 600;
      color: #2d2d2d;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    
    .email-content p {
      font-size: 16px;
      color: #4a4a4a;
      margin-bottom: 16px;
      line-height: 1.6;
    }
    
    .email-content ul,
    .email-content ol {
      margin: 16px 0;
      padding-left: 24px;
    }
    
    .email-content li {
      font-size: 16px;
      color: #4a4a4a;
      margin-bottom: 8px;
      line-height: 1.6;
    }
    
    /* CTA Button */
    .cta-container {
      text-align: center;
      margin: 32px 0;
    }
    
    .cta-button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #fbbf24;
      color: #000000;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      transition: background-color 0.2s ease;
    }
    
    .cta-button:hover {
      background-color: #f59e0b;
    }
    
    /* Footer */
    .email-footer {
      padding: 24px 32px;
      text-align: center;
      font-size: 14px;
      color: #666666;
      border-top: 1px solid #e5e5e5;
      background-color: #fafafa;
    }
    
    @media (prefers-color-scheme: dark) {
      .email-footer {
        background-color: #0f0f0f !important;
      }
    }
    
    .email-footer p {
      margin-bottom: 8px;
    }
    
    .email-footer a {
      color: #fbbf24;
      text-decoration: none;
    }
    
    .email-footer a:hover {
      text-decoration: underline;
    }
    
    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 0;
      }
      
      .email-container {
        border-radius: 0;
      }
      
      .email-content {
        padding: 32px 24px;
      }
      
      .email-content h1 {
        font-size: 22px;
      }
      
      .email-content h2 {
        font-size: 18px;
      }
      
      .cta-button {
        width: 100%;
        padding: 16px 24px;
      }
      
      .email-footer {
        padding: 20px 24px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <!-- Header -->
      <div class="email-header">
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://polyvec.com'}" class="logo">
          PolyVec
        </a>
      </div>
      
      <!-- Content -->
      <div class="email-content">
        <h1>${title}</h1>
        ${content}
        ${ctaText && ctaUrl ? `
          <div class="cta-container">
            <a href="${ctaUrl}" class="cta-button">${ctaText}</a>
          </div>
        ` : ''}
      </div>
      
      <!-- Footer -->
      <div class="email-footer">
        <p>${footerText}</p>
        <p>
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://polyvec.com'}">Visit PolyVec</a> | 
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://polyvec.com'}/terminal">Trading Terminal</a>
        </p>
        <p style="margin-top: 16px; font-size: 12px; color: #999999;">
          This email was sent to you because you have an account with PolyVec.
          <br>
          If you have any questions, please contact us at 
          <a href="mailto:support@polyvec.com">support@polyvec.com</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()
}

