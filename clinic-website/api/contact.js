const { google } = require('googleapis');

const RATE_LIMIT = 3;
const RATE_WINDOW = 10 * 60 * 1000;
const ipHits = {};

function rateLimit(ip) {
  const now = Date.now();
  if (!ipHits[ip]) ipHits[ip] = [];
  ipHits[ip] = ipHits[ip].filter(t => now - t < RATE_WINDOW);
  if (ipHits[ip].length >= RATE_LIMIT) return false;
  ipHits[ip].push(now);
  return true;
}

function getGmailClient() {
  const SENDER_EMAIL = process.env.EMAIL_FROM || 'ryan@moveifyhealth.com';

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set');
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    clientOptions: { subject: SENDER_EMAIL },
  });

  return google.gmail({ version: 'v1', auth });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required.' });
  }

  try {
    const gmail = getGmailClient();
    const to = process.env.CONTACT_EMAIL || 'ryan@moveifyhealth.com';
    const from = process.env.EMAIL_FROM || 'ryan@moveifyhealth.com';

    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      `Subject: ${subject || 'Not provided'}`,
      ``,
      `Message:`,
      message,
    ].join('\n');

    const raw = Buffer.from(
      `From: ${from}\r\n` +
      `To: ${to}\r\n` +
      `Subject: Clinic Website Contact: ${subject || 'New enquiry'}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      body
    ).toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Email send failed:', err);
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
};
