// Email service using Resend
const { Resend } = require('resend');

// Lazy-load Resend client to avoid initialization errors if API key not set
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  console.log('DEBUG: RESEND_API_KEY type:', typeof apiKey);
  console.log('DEBUG: RESEND_API_KEY value:', apiKey);
  console.log('DEBUG: RESEND_API_KEY length:', apiKey ? apiKey.length : 'N/A');
  console.log('DEBUG: RESEND_API_KEY truthiness:', !!apiKey);
  console.log('DEBUG: All RESEND env vars:', Object.keys(process.env).filter(k => k.includes('RESEND')));

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('RESEND_API_KEY environment variable is not set or is empty');
  }
  return new Resend(apiKey.trim());
}

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d9488;">Reset Your Password</h2>
      <p>You requested to reset your password for your Moveify account.</p>
      <p>Click the button below to set a new password:</p>
      <a href="${resetUrl}" style="display: inline-block; background-color: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
      <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
      <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;">Moveify - Physiotherapy Exercise Platform</p>
    </div>
  `;

  const textBody = `Reset your Moveify password\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`;

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Reset your Moveify password',
      html: htmlBody,
      text: textBody
    });

    if (error) {
      console.error('Resend API error:', error);
      throw error;
    }

    console.log(`Password reset email sent to ${toEmail}`, data);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}

module.exports = {
  sendPasswordResetEmail
};
