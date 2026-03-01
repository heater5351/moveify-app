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

// Shared email wrapper — clean, professional layout matching Moveify brand
function wrapEmail(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
        <!-- Header -->
        <tr>
          <td style="padding: 32px 32px 0 32px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #46c1c0; letter-spacing: -0.5px;">moveify</div>
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="padding: 24px 32px 32px 32px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding: 0 32px 24px 32px; text-align: center; border-top: 1px solid #f1f5f9;">
            <p style="margin: 16px 0 0 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
              Moveify Health Pty Ltd<br>
              This is an automated message — please do not reply directly.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const htmlBody = wrapEmail(`
    <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #132232;">Reset your password</h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #64748b; line-height: 1.6;">
      We received a request to reset the password for your Moveify account. Click the button below to choose a new one.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding: 4px 0 20px 0;">
        <a href="${resetUrl}" style="display: inline-block; background-color: #46c1c0; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Reset password</a>
      </td></tr>
    </table>
    <p style="margin: 0 0 4px 0; font-size: 13px; color: #94a3b8;">This link expires in 1 hour.</p>
    <p style="margin: 0; font-size: 13px; color: #94a3b8;">If you didn't request this, you can safely ignore this email.</p>
  `);

  const textBody = `Reset your Moveify password\n\nWe received a request to reset your password. Visit this link to choose a new one:\n\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`;

  return sendEmail(toEmail, 'Reset your Moveify password', htmlBody, textBody);
}

async function sendInvitationEmail(toEmail, patientName, invitationUrl) {
  const firstName = patientName.split(' ')[0];

  const htmlBody = wrapEmail(`
    <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #132232;">Welcome to Moveify</h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #64748b; line-height: 1.6;">
      Hi ${firstName}, your clinician has created an account for you on Moveify to manage your exercise program. Set your password below to get started.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding: 4px 0 20px 0;">
        <a href="${invitationUrl}" style="display: inline-block; background-color: #46c1c0; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Set up your account</a>
      </td></tr>
    </table>
    <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0 0 4px 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Your email</p>
      <p style="margin: 0; font-size: 14px; color: #334155; font-weight: 500;">${toEmail}</p>
    </div>
    <p style="margin: 0; font-size: 13px; color: #94a3b8;">This link expires in 7 days. If you weren't expecting this, please disregard.</p>
  `);

  const textBody = `Welcome to Moveify\n\nHi ${firstName},\n\nYour clinician has created a Moveify account for you to manage your exercise program.\n\nSet your password here: ${invitationUrl}\n\nYour email: ${toEmail}\n\nThis link expires in 7 days.`;

  return sendEmail(toEmail, `${firstName}, set up your Moveify account`, htmlBody, textBody);
}

module.exports = {
  sendPasswordResetEmail,
  sendInvitationEmail,
};
