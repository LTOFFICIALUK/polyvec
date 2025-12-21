/**
 * Welcome email template for Pro plan upgrade
 */

export const generateWelcomeProEmail = (userName?: string): string => {
  const greeting = userName ? `Hi ${userName},` : 'Hi there,'
  
  const content = `
    <p>${greeting}</p>
    <p>Welcome to <strong>PolyVec Pro</strong>! 🎉</p>
    <p>You now have access to our full suite of professional trading tools and features.</p>
    
    <h2>What's Included in Pro:</h2>
    <ul>
      <li><strong>Trading Terminal</strong> - Execute trades with advanced order types</li>
      <li><strong>Analytics Dashboard</strong> - Track your performance and portfolio</li>
      <li><strong>Automated Trading Strategies</strong> - Trade 24/7 with our strategy engine</li>
      <li><strong>Priority Support</strong> - Get help when you need it</li>
    </ul>
    
    <h2>Get Started</h2>
    <p>Ready to start trading? Head to your terminal and explore the strategies page to set up your first automated trade.</p>
    
    <p>If you have any questions, our support team is here to help.</p>
    <p>Happy trading!</p>
    <p><strong>The PolyVec Team</strong></p>
  `
  
  return content
}

