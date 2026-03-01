// Email service using Gmail API with Service Account
const { google } = require('googleapis');
const path = require('path');

const SENDER_EMAIL = 'ryan@moveifyhealth.com';

// Create Gmail client using service account with domain-wide delegation
let gmailClient = null;

function getGmailClient() {
  if (gmailClient) return gmailClient;

  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    // Production: key passed as JSON string in env var
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      clientOptions: { subject: SENDER_EMAIL },
    });
  } else {
    // Local dev: key file on disk
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
      || path.join(__dirname, '..', 'gmail-service-account.json');
    auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      clientOptions: { subject: SENDER_EMAIL },
    });
  }

  gmailClient = google.gmail({ version: 'v1', auth });
  return gmailClient;
}

// Build a RFC 2822 email and base64url-encode it
function buildRawEmail(to, subject, htmlBody, textBody) {
  const boundary = `boundary_${Date.now()}`;
  const lines = [
    `From: Moveify <${SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

async function sendEmail(to, subject, htmlBody, textBody) {
  const gmail = getGmailClient();
  const raw = buildRawEmail(to, subject, htmlBody, textBody);

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  console.log(`Email sent to ${to} (messageId: ${result.data.id})`);
  return result.data;
}

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const htmlBody = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #46c1c0; margin-bottom: 16px;">Reset Your Password</h2>
      <p>You requested to reset your password for your Moveify account.</p>
      <p>Click the button below to set a new password:</p>
      <a href="${resetUrl}" style="display: inline-block; background-color: #46c1c0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; font-weight: 600;">Reset Password</a>
      <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
      <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;">Moveify — Clinical Exercise Platform</p>
    </div>
  `;

  const textBody = `Reset your Moveify password\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`;

  return sendEmail(toEmail, 'Reset your Moveify password', htmlBody, textBody);
}

async function sendInvitationEmail(toEmail, patientName, invitationUrl) {
  const htmlBody = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #46c1c0; margin-bottom: 16px;">Welcome to Moveify</h2>
      <p>Hi ${patientName},</p>
      <p>Your clinician has set up a Moveify account for you to manage your exercise program.</p>
      <p>Click the button below to set your password and get started:</p>
      <a href="${invitationUrl}" style="display: inline-block; background-color: #46c1c0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; font-weight: 600;">Set Up Your Account</a>
      <p style="color: #666; font-size: 14px;">This link will expire in 7 days.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;">Moveify — Clinical Exercise Platform</p>
    </div>
  `;

  const textBody = `Welcome to Moveify\n\nHi ${patientName},\n\nYour clinician has set up a Moveify account for you.\n\nSet your password here: ${invitationUrl}\n\nThis link expires in 7 days.`;

  return sendEmail(toEmail, 'Set up your Moveify account', htmlBody, textBody);
}

module.exports = {
  sendPasswordResetEmail,
  sendInvitationEmail,
};
