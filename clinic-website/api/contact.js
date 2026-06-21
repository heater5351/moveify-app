const { google } = require('googleapis');
const { originAllowed, verifyTurnstile, clientIp } = require('./_lib/antispam');

const RATE_LIMIT = 3;
const RATE_WINDOW = 10 * 60 * 1000;
const ipHits = {};

// Minimum time a human takes to fill the form. Bots submit near-instantly.
const MIN_SUBMIT_MS = 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /(https?:\/\/|www\.|\[url|<a\s)/i;

function rateLimit(ip) {
  const now = Date.now();
  if (!ipHits[ip]) ipHits[ip] = [];
  ipHits[ip] = ipHits[ip].filter(t => now - t < RATE_WINDOW);
  if (ipHits[ip].length >= RATE_LIMIT) return false;
  ipHits[ip].push(now);
  return true;
}

function getGmailClient() {
  const SENDER_EMAIL = process.env.EMAIL_FROM;
  if (!SENDER_EMAIL) throw new Error('EMAIL_FROM environment variable not set');

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

  // Reject forged cross-origin POSTs (bots hitting the endpoint directly).
  if (!originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = clientIp(req);
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const body = req.body || {};
  const { name, email, phone, message } = body;

  // Honeypot — a hidden field humans never see. Pretend success so bots don't adapt.
  if (typeof body.website === 'string' && body.website.trim()) {
    return res.status(200).json({ success: true });
  }

  // Too-fast submit = bot. elapsedMs is set client-side at submit time.
  if (typeof body.elapsedMs === 'number' && body.elapsedMs < MIN_SUBMIT_MS) {
    return res.status(400).json({ error: 'Please take a moment to review before submitting.' });
  }

  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'Name, email and phone are required.' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  // Legit patients don't paste links — link-stuffed messages are the spam signature.
  if (typeof message === 'string' && URL_RE.test(message)) {
    return res.status(400).json({ error: 'Links are not allowed in the message.' });
  }

  // CAPTCHA — Cloudflare Turnstile. Fails closed once the secret is configured.
  const turnstile = await verifyTurnstile(body['cf-turnstile-response'], ip);
  if (!turnstile.ok) {
    return res.status(403).json({ error: 'Verification failed. Please reload the page and try again.' });
  }

  try {
    const gmail = getGmailClient();
    const to = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM;
    const from = to;

    const emailBody = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      ``,
      `Message:`,
      message || '(No message provided)',
    ].join('\n');

    const raw = Buffer.from(
      `From: ${from}\r\n` +
      `To: ${to}\r\n` +
      `Subject: New Enquiry from ${name}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      emailBody
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
