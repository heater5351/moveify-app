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

async function sendEmail({ name, email, phone, subject, message }) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth });

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
  ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
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
    await sendEmail({ name, email, phone, subject, message });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Email send failed:', err);
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
};
