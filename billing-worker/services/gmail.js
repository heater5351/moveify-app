'use strict';

const { google } = require('googleapis');
const { getSecret } = require('../lib/secrets');
const { logger } = require('../lib/logger');

// SCOPE NOTE: The Gmail OAuth refresh token must be authorised with the
// 'https://www.googleapis.com/auth/gmail.modify' scope to support reading
// and labelling emails. The older gmail.send-only token will not work for
// inbound operations. Re-authorise if you see 403 errors on list/modify calls.

let _gmail = null;

async function getGmail() {
  if (_gmail) return _gmail;

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getSecret('gmail-client-id'),
    getSecret('gmail-client-secret'),
    getSecret('gmail-refresh-token'),
  ]);

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  _gmail = google.gmail({ version: 'v1', auth });
  return _gmail;
}

// ─── Outbound ────────────────────────────────────────────────────────────────

function buildRaw({ to, subject, body, isHtml = false }) {
  const contentType = isHtml ? 'text/html' : 'text/plain';
  const from = process.env.EMAIL_FROM || 'ryan@moveifyhealth.com';
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}; charset=utf-8`,
    '',
    body,
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendEmail({ to, subject, body, isHtml = false }) {
  try {
    const gmail = await getGmail();
    const raw = buildRaw({ to, subject, body, isHtml });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    logger.info({ to, subject }, 'Email sent');
  } catch (err) {
    logger.error({ to, subject, err: err.message }, 'Failed to send email');
    throw err;
  }
}

// ─── Inbound — referral label management ─────────────────────────────────────

const REFERRAL_LABEL_NAMES = ['referral-pending', 'referral-done', 'referral-failed'];
let _labelIds = null;

/**
 * Ensures the three referral Gmail labels exist, creating them if needed.
 * Returns { referral_pending, referral_done, referral_failed } label ID map.
 * Result is cached in memory for the life of the worker instance.
 */
async function ensureGmailLabels() {
  if (_labelIds) return _labelIds;

  const gmail = await getGmail();
  const res = await gmail.users.labels.list({ userId: 'me' });
  const existing = new Map((res.data.labels || []).map((l) => [l.name, l.id]));

  const ids = {};
  for (const name of REFERRAL_LABEL_NAMES) {
    if (existing.has(name)) {
      ids[name.replace(/-/g, '_')] = existing.get(name);
    } else {
      const created = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      ids[name.replace(/-/g, '_')] = created.data.id;
      logger.info({ label: name }, 'Gmail label created');
    }
  }

  _labelIds = ids;
  return ids;
}

/**
 * Lists up to 20 emails with the 'referral-pending' label, returning full message objects.
 */
async function listReferralEmails(labelIds) {
  const gmail = await getGmail();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: [labelIds.referral_pending],
    maxResults: 20,
  });

  const stubs = listRes.data.messages || [];
  if (stubs.length === 0) return [];

  // Fetch full message details (headers + attachment metadata) for each stub
  const messages = await Promise.all(
    stubs.map((m) =>
      gmail.users.messages
        .get({ userId: 'me', id: m.id, format: 'full' })
        .then((r) => r.data)
    )
  );

  return messages;
}

/**
 * Downloads a message attachment and returns it as a Buffer.
 * Gmail encodes attachments as base64url — this decodes it.
 */
async function downloadAttachment(messageId, attachmentId) {
  const gmail = await getGmail();
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const b64 = (res.data.data || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

/**
 * Moves a message between referral labels.
 * Pass null for either label ID to skip adding/removing.
 */
async function applyReferralLabel(messageId, addLabelId, removeLabelId) {
  const gmail = await getGmail();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds:    addLabelId    ? [addLabelId]    : [],
      removeLabelIds: removeLabelId ? [removeLabelId] : [],
    },
  });
}

module.exports = {
  sendEmail,
  ensureGmailLabels,
  listReferralEmails,
  downloadAttachment,
  applyReferralLabel,
};
