// Refer-a-patient form handler — email-only v1.
// Mirrors api/contact.js (Gmail service account) but with the full referral
// payload, optional attachments, honeypot, and NDIA-managed rejection.
// PHI policy: form contents go ONLY into the email — never logged. Logs carry
// the reference ID + funding type only.
const { google } = require('googleapis');
const { originAllowed, verifyTurnstile, clientIp } = require('./_lib/antispam');

const RATE_LIMIT = 5;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour
const ipHits = {};

const MAX_FILES = 2;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // 3 MB combined (Vercel body cap is 4.5 MB)
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];

const FUNDING_LABELS = {
  ndis: 'NDIS',
  dva: 'DVA',
  cdm: 'Medicare CDM',
  private: 'Private / other',
};

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

function referenceId() {
  return 'REF-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

const str = v => (typeof v === 'string' ? v.trim() : '');

// One "Label: value" line, skipped when empty — keeps the email scannable.
function line(label, value) {
  const v = str(value);
  return v ? `${label}: ${v}` : null;
}

function section(title, lines) {
  const body = lines.filter(Boolean);
  if (body.length === 0) return null;
  return `--- ${title} ---\n${body.join('\n')}`;
}

function buildEmailBody(p, refId) {
  const fundingLabel = FUNDING_LABELS[p.funding] || p.funding;
  const ndis = p.ndis || {};
  const dva = p.dva || {};
  const cdm = p.cdm || {};
  const priv = p.private || {};
  const referrer = p.referrer || {};
  const client = p.client || {};
  const reason = p.reason || {};
  const guardian = client.guardian || {};

  // Triage block — enough to act from the inbox.
  const triage = [
    `Reference: ${refId}`,
    `Funding: ${fundingLabel}${p.funding === 'ndis' && ndis.management ? ` (${ndis.management})` : ''}`,
    `Red flags noted: ${str(reason.redFlags) ? 'YES' : 'No'}`,
    p.funding === 'ndis' ? `Plan manager listed: ${str(ndis.planManagerName) ? 'Yes' : 'No'}` : null,
    p.funding === 'dva' ? `Card: ${str(dva.card) || '—'} · D904: ${str(dva.d904) || '—'}` : null,
    p.funding === 'cdm' ? `CDM plan: ${str(cdm.planAttached) || '—'}` : null,
    `Attachments: ${(p.attachments || []).length}`,
  ].filter(Boolean).join('\n');

  const sections = [
    section('Referrer', [
      line('Name / role', [str(referrer.name), str(referrer.role)].filter(Boolean).join(' / ')),
      line('Organisation', referrer.organisation),
      line('Provider number', referrer.providerNumber),
      line('Phone', referrer.phone),
      line('Email', referrer.email),
      line('Send progress reports', referrer.progressReports ? 'Yes' : ''),
    ]),
    section('Client', [
      line('Full name', client.fullName),
      line('DOB', client.dob),
      line('Phone', client.phone),
      line('Email', client.email),
      line('Address', client.address),
      line('Preferred contact', client.preferredContact),
      line('Interpreter required', client.interpreterLanguage ? `Yes — ${str(client.interpreterLanguage)}` : ''),
      line('Accessibility needs', client.accessibility),
      line('Guardian / nominee', [str(guardian.name), str(guardian.relationship), str(guardian.contact)].filter(Boolean).join(' / ')),
      line('Permission to contact guardian', str(guardian.name) ? (guardian.permission ? 'Yes' : 'No') : ''),
    ]),
    section('Reason for referral', [
      line('Primary reason / diagnosis', reason.primary),
      line('History & medications', reason.history),
      line('Red flags / precautions', reason.redFlags),
      line('Goals', reason.goals),
      line('Other providers involved', reason.otherProviders),
    ]),
    p.funding === 'ndis' ? section('NDIS', [
      line('Participant number', ndis.participantNumber),
      line('Plan start', ndis.planStart),
      line('Plan end', ndis.planEnd),
      line('Plan management', ndis.management),
      line('Plan manager', [str(ndis.planManagerName), str(ndis.planManagerOrg), str(ndis.planManagerEmail)].filter(Boolean).join(' / ')),
      line('Support coordinator', [str(ndis.coordinatorName), str(ndis.coordinatorOrg), str(ndis.coordinatorPhone), str(ndis.coordinatorEmail)].filter(Boolean).join(' / ')),
      line('Budget category', ndis.budget),
      line('NDIS plan goals', ndis.goals),
    ]) : null,
    p.funding === 'dva' ? section('DVA', [
      line('Card', dva.card),
      line('DVA file number', dva.fileNumber),
      line('White Card accepted condition(s)', dva.whiteConditions),
      line('D904 / treatment cycle referral', dva.d904),
      line('Usual GP', [str(dva.gpName), str(dva.gpPractice), str(dva.gpContact)].filter(Boolean).join(' / ')),
      line('Other physical therapies + days', dva.otherTherapies),
    ]) : null,
    p.funding === 'cdm' ? section('Medicare CDM', [
      line('CDM plan / referral', cdm.planAttached),
      line('EP sessions allocated', cdm.sessionsAllocated),
      line('Referring GP provider number', cdm.gpProviderNumber),
    ]) : null,
    p.funding === 'private' ? section('Private / other', [
      line('Detail', priv.detail),
      line('Claim number', priv.claimNumber),
      line('Case manager', priv.caseManager),
    ]) : null,
    section('Attribution', [line('How did you hear about Moveify', p.attribution)]),
    section('Consent', [
      'Client consents to this referral and to Moveify contacting them directly: Yes',
      'Client consents to information sharing between referrer and Moveify: Yes',
    ]),
  ].filter(Boolean);

  return `${triage}\n\n${sections.join('\n\n')}\n\nSubmitted via moveifyhealth.com/refer`;
}

// Raw RFC-2822 multipart/mixed message: plain-text body + base64 attachments.
// Subject is RFC 2047-encoded and the body base64-encoded — raw UTF-8 in a
// header or a 7bit body renders as mojibake (Ã¢Â€Â”) in Gmail.
function buildRawEmail(from, to, subject, textBody, attachments) {
  const boundary = '----MoveifyReferral' + Date.now().toString(36);
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const parts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(textBody, 'utf8').toString('base64'),
  ];
  for (const att of attachments) {
    const safeName = att.name.replace(/[^\w. -]/g, '_');
    parts.push(
      `--${boundary}`,
      `Content-Type: application/octet-stream; name="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeName}"`,
      '',
      att.data
    );
  }
  parts.push(`--${boundary}--`);
  return Buffer.from(parts.join('\r\n')).toString('base64url');
}

function validate(p) {
  const referrer = p.referrer || {};
  const client = p.client || {};
  const guardian = client.guardian || {};

  if (!str(referrer.name)) return 'Referrer name is required.';
  if (!str(referrer.phone) && !str(referrer.email)) return 'Referrer phone or email is required.';
  if (!str(client.fullName)) return 'Client name is required.';
  if (!str(client.phone) && !str(client.email) && !str(guardian.contact)) {
    return 'A client phone, email, or guardian contact is required.';
  }
  if (!FUNDING_LABELS[p.funding]) return 'Funding type is required.';
  if (!str((p.reason || {}).primary)) return 'Primary reason for referral is required.';
  if (!p.consentReferral || !p.consentSharing) return 'Both consent confirmations are required.';

  const attachments = p.attachments || [];
  if (!Array.isArray(attachments)) return 'Invalid attachments.';
  if (attachments.length > MAX_FILES) return `Maximum ${MAX_FILES} files.`;
  let total = 0;
  for (const att of attachments) {
    if (!att || typeof att.name !== 'string' || typeof att.data !== 'string') return 'Invalid attachment.';
    const ext = (att.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return 'Attachments must be PDF, JPG, PNG, DOC, or DOCX.';
    total += Math.floor(att.data.length * 0.75); // decoded size from base64 length
  }
  if (total > MAX_TOTAL_BYTES) return 'Attachments exceed the 3 MB combined limit — email larger documents to ryan@moveifyhealth.com instead.';
  return null;
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

  const p = req.body || {};

  // Honeypot — pretend success so bots don't adapt.
  if (str(p.website)) {
    return res.status(200).json({ success: true, referenceId: referenceId() });
  }

  // CAPTCHA — Cloudflare Turnstile. Fails closed once the secret is configured.
  const turnstile = await verifyTurnstile(p['cf-turnstile-response'], ip);
  if (!turnstile.ok) {
    return res.status(403).json({ error: 'Verification failed. Please reload the page and try again.' });
  }

  // NDIA-managed participants can't be accepted (not NDIA-registered).
  if (p.funding === 'ndis' && (p.ndis || {}).management === 'NDIA-managed') {
    return res.status(422).json({
      error: "We're not currently registered with the NDIA, so we're unable to accept agency-managed participants. Self-managed and plan-managed referrals are welcome.",
    });
  }

  const validationError = validate(p);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const refId = referenceId();
  const clientName = str((p.client || {}).fullName);
  const fundingLabel = FUNDING_LABELS[p.funding];

  try {
    const gmail = getGmailClient();
    const to = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM;
    const subject = `New referral — ${clientName} (${fundingLabel}) [${refId}]`;
    const raw = buildRawEmail(to, to, subject, buildEmailBody(p, refId), p.attachments || []);

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

    console.log(`Referral submitted: ${refId} (${fundingLabel})`);
    return res.status(200).json({ success: true, referenceId: refId });
  } catch (err) {
    // No form contents in logs — reference ID only.
    console.error(`Referral email send failed (${refId}):`, err.message);
    return res.status(500).json({ error: 'Failed to submit referral. Please try again, or email ryan@moveifyhealth.com.' });
  }
};
