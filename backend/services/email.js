// Email service using Gmail API with service account
const { google } = require('googleapis');

// Create Gmail client using service account with domain-wide delegation
function getGmailClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    clientOptions: {
      subject: process.env.GMAIL_SENDER_EMAIL // The Workspace user to impersonate
    }
  });

  return google.gmail({ version: 'v1', auth });
}

// Encode email to base64url format for Gmail API
function createMessage(to, from, subject, htmlBody, textBody) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="boundary"',
    '',
    '--boundary',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    textBody,
    '',
    '--boundary',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
    '',
    '--boundary--'
  ];

  const message = messageParts.join('\n');
  // Base64url encode
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const fromEmail = process.env.GMAIL_SENDER_EMAIL;

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
    const gmail = getGmailClient();
    const raw = createMessage(toEmail, fromEmail, 'Reset your Moveify password', htmlBody, textBody);

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    console.log(`Password reset email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}

module.exports = {
  sendPasswordResetEmail
};
