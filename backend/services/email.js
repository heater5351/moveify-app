// Email service using AWS SES
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ses = new SESClient({
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const params = {
    Source: process.env.SES_FROM_EMAIL,
    Destination: {
      ToAddresses: [toEmail]
    },
    Message: {
      Subject: {
        Data: 'Reset your Moveify password',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
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
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `Reset your Moveify password\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    await ses.send(new SendEmailCommand(params));
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
