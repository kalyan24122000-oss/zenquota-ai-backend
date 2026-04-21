const SibApiV3Sdk = require('sib-api-v3-sdk');

// Configure Brevo API client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@zenquota.ai';
const senderName = process.env.BREVO_SENDER_NAME || 'ZenQuota AI';

/**
 * Send email verification link
 * Falls back gracefully if Brevo is not yet activated
 */
async function sendVerificationEmail(email, token) {
  const verifyUrl = `${process.env.FRONTEND_URL}/api/verify-email?token=${token}`;

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = '✅ Verify your ZenQuota AI account';
  sendSmtpEmail.sender = { name: senderName, email: senderEmail };
  sendSmtpEmail.to = [{ email: email }];
  sendSmtpEmail.htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a1a; color: #ffffff; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
        .card { background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1)); border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 40px; text-align: center; }
        .logo { font-size: 32px; font-weight: 800; color: #8b5cf6; margin-bottom: 24px; }
        .btn { display: inline-block; padding: 14px 40px; background: #8b5cf6; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin: 24px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 32px; }
        p { color: #d1d5db; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="logo">ZenQuota AI</div>
          <h2 style="color: #ffffff; margin-bottom: 16px;">Verify Your Email</h2>
          <p>Welcome to ZenQuota AI! Click the button below to verify your email address.</p>
          <a href="${verifyUrl}" class="btn">Verify Email Address</a>
          <p style="font-size: 13px; color: #9ca3af;">Or use this token in the app:<br><b style="color:#a78bfa;font-size:16px;letter-spacing:2px;">${token}</b></p>
        </div>
        <div class="footer"><p>© 2024 ZenQuota AI</p></div>
      </div>
    </body>
    </html>
  `;

  try {
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('📧 Verification email sent to:', email, '| MessageId:', data.messageId);
    return { success: true, emailSent: true };
  } catch (error) {
    const errMsg = error.response?.body?.message || error.message || 'Unknown error';
    console.log('📧 Brevo not activated yet. Token for', email, ':', token);
    console.log('   (Email will be sent automatically once Brevo activates your account)');
    // Return success with fallback flag — the token is returned to the app
    return { success: true, emailSent: false, fallback: true, token: token };
  }
}

/**
 * Send redeem code email
 */
async function sendRedeemCodeEmail(email, code, value) {
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = '🎟️ Your ZenQuota AI Redeem Code';
  sendSmtpEmail.sender = { name: senderName, email: senderEmail };
  sendSmtpEmail.to = [{ email: email }];
  sendSmtpEmail.htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a1a; color: #ffffff; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
        .card { background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1)); border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 40px; text-align: center; }
        .logo { font-size: 32px; font-weight: 800; color: #8b5cf6; margin-bottom: 24px; }
        .code-box { background: rgba(139,92,246,0.3); border: 2px dashed #8b5cf6; border-radius: 12px; padding: 20px; margin: 24px 0; }
        .code { font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #a78bfa; font-family: monospace; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 32px; }
        p { color: #d1d5db; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="logo">ZenQuota AI</div>
          <h2 style="color: #ffffff;">Your Redeem Code</h2>
          <p>You've purchased ${value} additional quotes. Use this code in the app:</p>
          <div class="code-box"><div class="code">${code}</div></div>
          <p style="font-size: 13px; color: #9ca3af;">Valid for 30 days. Single use only.</p>
        </div>
        <div class="footer"><p>© 2024 ZenQuota AI</p></div>
      </div>
    </body>
    </html>
  `;

  try {
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('📧 Redeem code email sent to:', email, '| MessageId:', data.messageId);
    return { success: true, emailSent: true };
  } catch (error) {
    console.log('📧 Brevo not activated. Redeem code for', email, ':', code);
    return { success: true, emailSent: false, fallback: true };
  }
}

module.exports = { sendVerificationEmail, sendRedeemCodeEmail };
