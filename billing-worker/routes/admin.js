'use strict';

const express = require('express');
const router = express.Router();
const { resolveFlag } = require('../jobs/reconcile');
const { withCorrelation } = require('../lib/logger');
const { getTab, getWorkerState, setWorkerState } = require('../services/billing-db');
const billingDb = require('../services/billing-db');
const { ensureGmailLabels, listReferralEmails } = require('../services/gmail');
const { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand } = require('@aws-sdk/client-bedrock');
const { getSecret } = require('../lib/secrets');
const xero = require('../lib/xero');
const { ingestTyroCsv } = require('../jobs/ingest-tyro');

// Admin routes are protected by a shared-secret token. The caller must send
// X-Admin-Token: <value> matching the billing-admin-token secret.
// This is interim — long-term we should put Cloud Run behind GCP IAP via an
// HTTPS load balancer (with a path-based bypass for /webhooks/stripe).
//
// Constant-time comparison to avoid timing-based token extraction. Token is
// loaded once at boot and cached via getSecret's in-process cache.
const crypto = require('crypto');

router.use(async (req, res, next) => {
  try {
    const expected = await getSecret('billing-admin-token');
    const provided = req.get('X-Admin-Token') || '';
    const expectedBuf = Buffer.from(String(expected).trim());
    const providedBuf = Buffer.from(String(provided).trim());
    if (
      expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  } catch (err) {
    return res.status(500).json({ error: 'Auth check failed' });
  }
});

router.get('/worker-state', async (req, res) => {
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'key query param required' });
  const value = await getWorkerState(String(key));
  res.json({ key, value });
});

router.post('/worker-state', express.json(), async (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key required' });
  await setWorkerState(String(key), value === null || value === undefined ? '' : String(value));
  res.json({ ok: true, key, value });
});

router.get('/pending-referrals', async (req, res) => {
  const labelIds = await ensureGmailLabels();
  const emails = await listReferralEmails(labelIds);
  // Subjects can contain patient names — return IDs only.
  res.json({ count: emails.length, ids: emails.map((e) => e.id) });
});

router.post('/clear-idempotency', async (req, res) => {
  const { keys, prefix } = req.body || {};
  if (!Array.isArray(keys) && typeof prefix !== 'string') {
    return res.status(400).json({ error: 'keys (array) or prefix (string) required' });
  }
  const removed = await billingDb.clearIdempotencyKeys({ keys, prefix });
  res.json({ ok: true, removed });
});

router.post('/resolve-flag', async (req, res) => {
  const log = withCorrelation(req);
  const { flag_id, resolution, notes } = req.body;

  if (!flag_id || !resolution) {
    return res.status(400).json({ error: 'flag_id and resolution are required' });
  }

  const valid = ['cliniko_correct', 'ledger_correct', 'dismissed'];
  if (!valid.includes(resolution)) {
    return res.status(400).json({ error: `resolution must be one of: ${valid.join(', ')}` });
  }

  try {
    const ok = await resolveFlag({ flag_id, resolution, notes }, log);
    if (!ok) return res.status(404).json({ error: 'Flag not found' });
    res.json({ ok: true });
  } catch (err) {
    log.error({ err: err.message }, 'resolve-flag failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/seed-bank-rules', async (req, res) => {
  const { DEFAULT_BANK_RULES } = require('../lib/bank-rules');
  await billingDb.replaceBankRules(DEFAULT_BANK_RULES);
  res.json({ ok: true, rows: DEFAULT_BANK_RULES.length });
});

router.get('/bedrock-models', async (req, res) => {
  try {
    const [accessKeyId, secretAccessKey] = await Promise.all([
      getSecret('aws-access-key-id'),
      getSecret('aws-secret-access-key'),
    ]);
    const client = new BedrockClient({
      region: process.env.AWS_REGION || 'ap-southeast-2',
      credentials: { accessKeyId, secretAccessKey },
    });

    const models = await client.send(new ListFoundationModelsCommand({ byProvider: 'anthropic' }));
    const profiles = await client.send(new ListInferenceProfilesCommand({})).catch((e) => ({ error: e.message }));

    res.json({
      foundationModels: (models.modelSummaries || []).map((m) => ({
        id: m.modelId,
        name: m.modelName,
        inputModalities: m.inputModalities,
      })),
      inferenceProfiles: profiles.inferenceProfileSummaries?.map((p) => ({
        id: p.inferenceProfileId,
        name: p.inferenceProfileName,
      })) || profiles,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ingest-tyro-csv', express.text({ type: 'text/csv', limit: '10mb' }), async (req, res) => {
  const log = withCorrelation(req);
  if (!req.body) return res.status(400).json({ error: 'Empty CSV body' });
  try {
    const result = await ingestTyroCsv(req.body, log);
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err: err.message }, 'ingest-tyro-csv failed');
    res.status(500).json({ error: err.message });
  }
});

router.post('/backfill-tyro-payments', async (req, res) => {
  const log = withCorrelation(req);
  const accountId = process.env.XERO_TYRO_CLEARING_ACCOUNT_ID || '14dc34ac-c292-42cb-a98c-78f7f136407e';
  try {
    const rows = await getTab('TyroIngest');
    let paid = 0, alreadyPaid = 0, failed = 0;
    for (const row of rows) {
      if (!row.xero_invoice_id) continue;
      try {
        const inv = await xero.getInvoice(row.xero_invoice_id);
        if (!inv) { failed++; continue; }
        if (inv.Status === 'PAID') { alreadyPaid++; continue; }
        const amount = parseFloat(String(row.amount_charged).replace(/[$\s,]/g, ''));
        const dateMatch = String(row.date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const isoDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[1].padStart(2,'0')}` : row.date;
        await xero.createPayment({
          invoiceId: row.xero_invoice_id,
          amount,
          date: isoDate,
          accountId,
          reference: row.transaction_id,
        });
        paid++;
      } catch (err) {
        log.error({ txnId: row.transaction_id, err: err.message }, 'Backfill payment failed');
        failed++;
      }
    }
    res.json({ ok: true, total: rows.length, paid, alreadyPaid, failed });
  } catch (err) {
    log.error({ err: err.message }, 'backfill-tyro-payments failed');
    res.status(500).json({ error: err.message });
  }
});

router.get('/xero-bank-accounts', async (req, res) => {
  try {
    const accounts = await xero.listBankAccounts();
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/void-invoices', async (req, res) => {
  const log = withCorrelation(req);
  const { invoiceNumbers } = req.body || {};
  if (!Array.isArray(invoiceNumbers) || !invoiceNumbers.length) {
    return res.status(400).json({ error: 'invoiceNumbers (array) required' });
  }
  const results = [];
  for (const num of invoiceNumbers) {
    try {
      const inv = await xero.findInvoiceByNumber(num);
      if (!inv) { results.push({ num, ok: false, error: 'not found' }); continue; }
      const payments = inv.Payments || [];
      let paymentsDeleted = 0;
      for (const p of payments) {
        if (p.Status === 'DELETED') continue;
        await xero.deletePayment(p.PaymentID);
        paymentsDeleted++;
      }
      await xero.voidInvoice(inv.InvoiceID);
      log.info({ invoiceNumber: num, invoiceId: inv.InvoiceID, paymentsDeleted }, 'Voided duplicate invoice');
      results.push({ num, ok: true, invoiceId: inv.InvoiceID, paymentsDeleted });
    } catch (err) {
      log.error({ num, err: err.message }, 'void-invoice failed');
      results.push({ num, ok: false, error: err.message });
    }
  }
  res.json({ ok: true, results });
});

// Issue a credit note that reverses a specific invoice. Mirrors the invoice's
// line items so the GL impact reverses cleanly. If `allocateToInvoice` is true
// (and the invoice still has outstanding balance), allocates up to the lesser
// of credit-note total / invoice amountDue. Any unallocated remainder sits as
// available credit on the contact for future use.
//
// Test-environment cleanup tool — does NOT touch the underlying overpayment
// allocations (Xero forbids that), but produces an accountant-clean reversal
// in the GL.
router.post('/xero-credit-note-reverse', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { invoiceNumber, allocateToInvoice = true, reference } = req.body || {};
  if (!invoiceNumber) return res.status(400).json({ error: 'invoiceNumber required' });

  try {
    const inv = await xero.findInvoiceByNumber(invoiceNumber);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const detail = await xero.getInvoice(inv.InvoiceID);
    const lineItems = (detail?.LineItems || []).map((li) => ({
      description: `Reversal of ${invoiceNumber}: ${li.Description || ''}`.slice(0, 4000),
      quantity: li.Quantity,
      unitAmount: li.UnitAmount,
      accountCode: li.AccountCode,
      taxType: li.TaxType,
    }));
    if (lineItems.length === 0) {
      return res.status(400).json({ error: 'Invoice has no line items to reverse' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const creditNoteId = await xero.createCreditNote({
      contactId: detail.Contact.ContactID,
      lineItems,
      reference: reference || `Reversal ${invoiceNumber}`,
      date: today,
    });

    let allocation = null;
    if (allocateToInvoice) {
      const amountDue = Number(detail.AmountDue) || 0;
      const cnTotal = Number(detail.Total) || 0;
      const allocAmount = Math.min(amountDue, cnTotal);
      if (allocAmount > 0.01) {
        try {
          await xero.applyCreditNote({
            creditNoteId,
            invoiceId: detail.InvoiceID,
            amount: Number(allocAmount.toFixed(2)),
          });
          allocation = { amount: Number(allocAmount.toFixed(2)) };
        } catch (err) {
          allocation = { error: err.message.slice(0, 300) };
        }
      } else {
        allocation = { skipped: 'invoice has $0 due — credit note issued unallocated' };
      }
    }

    log.info({ invoiceNumber, creditNoteId, allocation }, 'Credit-note reversal issued');
    res.json({ ok: true, invoiceNumber, creditNoteId, allocation });
  } catch (err) {
    log.error({ err: err.message }, 'xero-credit-note-reverse failed');
    res.status(500).json({ error: err.message });
  }
});

// Backfill historical Stripe paid invoices into Xero. PHI hygiene: response
// returns only IDs/amounts/dates; never customer name, email, or product tier.
//
// Body:
//   since        — ISO date "YYYY-MM-DD" (required). Inclusive lower bound on
//                  Stripe invoice.created.
//   until        — ISO date (optional). Inclusive upper bound; defaults to now.
//   dryRun       — bool (default true). When true, lists candidates without
//                  writing anything.
//   limit        — max invoices to process this call (default 500).
//
// Idempotency: each invoice is keyed `stripe-backfill:<invoice.id>`. Safe to
// rerun — already-processed invoices are skipped as duplicates.
router.post('/backfill-stripe', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { since, until, dryRun = true, limit = 5000 } = req.body || {};
  if (!since) return res.status(400).json({ error: 'since (ISO date) required' });

  const sinceTs = Math.floor(new Date(since).getTime() / 1000);
  if (!Number.isFinite(sinceTs)) return res.status(400).json({ error: 'since must be a valid ISO date' });
  const untilTs = until ? Math.floor(new Date(until).getTime() / 1000) : Math.floor(Date.now() / 1000);

  try {
    const { getStripe } = require('../services/stripe');
    const { backfillInvoice } = require('../jobs/stripe-handler');
    const stripe = await getStripe();

    // Walk paid invoices in pages
    const candidates = [];
    let starting_after;
    while (candidates.length < limit) {
      const page = await stripe.invoices.list({
        status: 'paid',
        created: { gte: sinceTs, lte: untilTs },
        limit: 100,
        ...(starting_after ? { starting_after } : {}),
      });
      candidates.push(...page.data);
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
    }
    const slice = candidates.slice(0, limit);

    if (dryRun) {
      // Return only IDs / amounts / dates. No customer info.
      return res.json({
        ok: true,
        dryRun: true,
        candidates: slice.length,
        sample: slice.slice(0, 10).map((i) => ({
          invoice_id: i.id,
          amount: Number((i.amount_paid / 100).toFixed(2)),
          currency: i.currency,
          created: new Date(i.created * 1000).toISOString().slice(0, 10),
          paid_at: i.status_transitions?.paid_at
            ? new Date(i.status_transitions.paid_at * 1000).toISOString().slice(0, 10)
            : null,
        })),
      });
    }

    const results = { processed: 0, duplicate: 0, failed: 0, zero_amount_skipped: 0 };
    const failures = [];
    for (const invoice of slice) {
      // $0 invoices (trial conversions, prorations etc.) would fail Xero's
      // overpayment-amount validation. Skip cleanly — no Xero work to do.
      if (!invoice.amount_paid || invoice.amount_paid <= 0) {
        results.zero_amount_skipped++;
        continue;
      }
      try {
        const r = await backfillInvoice(invoice, log);
        results[r.status] = (results[r.status] || 0) + 1;
      } catch (err) {
        results.failed++;
        failures.push({ invoice_id: invoice.id, error: err.message.slice(0, 200) });
        log.error({ invoice_id: invoice.id, err: err.message }, 'Stripe backfill: per-invoice failure');
      }
    }

    log.info({ ...results, since, until }, 'Stripe backfill complete');
    res.json({ ok: true, ...results, totalCandidates: candidates.length, failures: failures.slice(0, 20) });
  } catch (err) {
    log.error({ err: err.message }, 'backfill-stripe failed');
    res.status(500).json({ error: err.message });
  }
});

// Backfill the Cliniko appointment poller. Rewinds the cursor, optionally
// clears appointment idempotency keys, and runs the existing poller once.
// The poller's own pagination handles long history windows.
//
// Body:
//   since              — ISO timestamp (required). Cursor will be set here.
//   clearIdempotency   — bool (default false). Clears all `appointment:*`
//                        keys before running. Use when re-running backfill
//                        against a fresh Xero org so prior runs don't skip
//                        the same appointments.
//   dryRun             — bool (default false). Just rewinds + reports — no
//                        actual processing (skip the poller call).
router.post('/backfill-cliniko-appointments', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { since, clearIdempotency = false, dryRun = false } = req.body || {};
  if (!since) return res.status(400).json({ error: 'since (ISO timestamp) required' });
  if (!Number.isFinite(new Date(since).getTime())) {
    return res.status(400).json({ error: 'since must be a valid ISO timestamp' });
  }

  try {
    const removed = clearIdempotency ? await clearKeysByPrefix('appointment:') : 0;
    await setWorkerState('cliniko_appointments_last_polled', since);

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        cursor_rewound_to: since,
        idempotency_keys_cleared: removed,
      });
    }

    const { pollClinikoAppointments } = require('../jobs/poll-cliniko-appointments');
    const stats = await pollClinikoAppointments(log);
    res.json({ ok: true, cursor_rewound_to: since, idempotency_keys_cleared: removed, ...stats });
  } catch (err) {
    log.error({ err: err.message }, 'backfill-cliniko-appointments failed');
    res.status(500).json({ error: err.message });
  }
});

async function clearKeysByPrefix(prefix) {
  return billingDb.clearIdempotencyKeys({ prefix });
}

// Returns raw shape of Cliniko's /group_appointments response since a given
// timestamp. Used to confirm field names before wiring up the poller for
// group sessions. Only first 3 records to limit PHI exposure.
router.get('/cliniko-group-appointments-sample', async (req, res) => {
  const since = req.query.since;
  try {
    const { getSecret } = require('../lib/secrets');
    const fetch = require('node-fetch');
    const apiKey = (await getSecret('cliniko-api-key-finance')).trim();
    const auth = Buffer.from(`${apiKey}:`).toString('base64');
    const qs = since ? `?updated_at%5Bgt%5D=${encodeURIComponent(since)}&per_page=10` : '?per_page=10';
    const shard = process.env.CLINIKO_SHARD || 'au1';
    const r = await fetch(`https://api.${shard}.cliniko.com/v1/group_appointments${qs}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'User-Agent': 'MoveifyBillingWorker/1.0' },
    });
    if (!r.ok) return res.status(r.status).json({ error: `Cliniko ${r.status}`, body: (await r.text()).slice(0, 500) });
    const data = await r.json();
    const total = (data.group_appointments || []).length;
    res.json({ total, sample: (data.group_appointments || []).slice(0, 3) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cliniko-appointment-type', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const cliniko = require('../services/cliniko').finance;
    const t = await cliniko.getAppointmentType(String(id));
    res.json({ id, name: t?.name, category: t?.category, duration_in_minutes: t?.duration_in_minutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnostic — list a Stripe customer's subscriptions with key date fields.
// No PHI returned: just IDs, status, and unix timestamps.
router.get('/stripe-customer-subscriptions', async (req, res) => {
  const customerId = req.query.id;
  if (!customerId) return res.status(400).json({ error: 'id query param required' });
  try {
    const { getStripe } = require('../services/stripe');
    const stripe = await getStripe();
    const list = await stripe.subscriptions.list({ customer: String(customerId), status: 'all', limit: 100 });
    const fmt = (s) => s ? new Date(s * 1000).toISOString().slice(0, 19) : null;
    res.json({
      customer_id: customerId,
      count: list.data.length,
      subscriptions: list.data.map((sub) => ({
        id: sub.id,
        status: sub.status,
        start_date: fmt(sub.start_date),
        created: fmt(sub.created),
        current_period_start: fmt(sub.current_period_start),
        current_period_end: fmt(sub.current_period_end),
        trial_start: fmt(sub.trial_start),
        trial_end: fmt(sub.trial_end),
        ended_at: fmt(sub.ended_at),
        cancel_at: fmt(sub.cancel_at),
        product: sub.items?.data?.[0]?.price?.product || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current Stripe↔Cliniko link cache contents.
router.get('/stripe-cliniko-links', async (req, res) => {
  try {
    const rows = await getTab('StripeClinikoLinks');
    res.json({ count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent StripePayments rows for backfill audit — IDs, amounts, tier only.
router.get('/stripe-payments-recent', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 200);
  try {
    const rows = await getTab('StripePayments');
    const recent = rows.slice(-limit).map((r) => ({
      stripe_invoice_id: r.stripe_invoice_id,
      cliniko_id: r.cliniko_id,
      amount: r.amount,
      tier: r.tier,
      paid_at: r.paid_at,
      pp_invoice_id: r.pp_invoice_id,
      pp_amount: r.pp_amount,
    }));
    res.json({ count: recent.length, rows: recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Returns the Xero tenants the current refresh token has access to. After
// re-consenting via scripts/get-xero-token.js, hit this to discover the new
// tenant's ID (needed for XERO_TENANT_ID and XERO_SANDBOX_TENANT_IDS).
router.get('/xero-connections', async (req, res) => {
  try {
    const fetch = require('node-fetch');
    const accessToken = await xero.getAccessToken();
    const r = await fetch('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: `Xero ${r.status}: ${text.slice(0, 300)}` });
    }
    const data = await r.json();
    res.json({ connections: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inspect all Xero records for a contact (read-only).
router.get('/xero-contact-inventory', async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'name query param required' });
  try {
    const contact = await xero.findContactByName(String(name));
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    const [invoices, bankTxns, overpayments] = await Promise.all([
      xero.getContactInvoices(contact.ContactID),
      xero.getContactBankTransactions(contact.ContactID),
      xero.getContactOverpayments(contact.ContactID),
    ]);
    res.json({
      contactId: contact.ContactID,
      name: contact.Name,
      invoices: invoices.map((i) => ({
        id: i.InvoiceID, number: i.InvoiceNumber, status: i.Status, total: i.Total, amountPaid: i.AmountPaid, amountDue: i.AmountDue,
      })),
      bankTransactions: bankTxns.map((b) => ({
        id: b.BankTransactionID, type: b.Type, status: b.Status, total: b.Total, date: b.Date, reference: b.Reference,
      })),
      overpayments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force-cleanup a contact's Xero pollution. Tries multiple deletion paths
// because overpayment allocations can't be removed via public API directly:
//   1. Delete each AUTHORISED RECEIVE-OVERPAYMENT BankTransaction (Status=DELETED)
//      — this should cascade-remove any allocations made from the resulting
//      overpayment.
//   2. Fallback: POST /Overpayments/{id} Status=DELETED.
//   3. Then void each AUTHORISED invoice now that allocations are gone.
//
// Test-environment only. Detailed per-record report returned.
router.post('/xero-purge-contact', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { name, dryRun = false } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const contact = await xero.findContactByName(String(name));
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const [invoices, bankTxns] = await Promise.all([
      xero.getContactInvoices(contact.ContactID),
      xero.getContactBankTransactions(contact.ContactID),
    ]);

    const report = { contactId: contact.ContactID, name: contact.Name, dryRun, bankTransactions: [], invoices: [] };

    // Step 1: try to delete each non-deleted RECEIVE-OVERPAYMENT bank txn.
    for (const b of bankTxns) {
      if (b.Status === 'DELETED') continue;
      if (b.Type !== 'RECEIVE-OVERPAYMENT') {
        report.bankTransactions.push({ id: b.BankTransactionID, type: b.Type, action: 'skipped', reason: 'not a RECEIVE-OVERPAYMENT' });
        continue;
      }
      if (dryRun) {
        report.bankTransactions.push({ id: b.BankTransactionID, total: b.Total, action: 'would-delete' });
        continue;
      }
      try {
        await xero.deleteBankTransaction(b.BankTransactionID);
        report.bankTransactions.push({ id: b.BankTransactionID, total: b.Total, action: 'deleted' });
      } catch (err) {
        // Fall back to deleting the linked overpayment if any
        let fallback = null;
        if (b.OverpaymentID) {
          try {
            await xero.deleteOverpayment(b.OverpaymentID);
            fallback = 'overpayment-deleted';
          } catch (err2) {
            fallback = `overpayment-delete-failed: ${err2.message.slice(0, 200)}`;
          }
        }
        report.bankTransactions.push({
          id: b.BankTransactionID, total: b.Total, action: 'failed',
          error: err.message.slice(0, 300),
          fallback,
        });
      }
    }

    // Step 2: void each AUTHORISED invoice. Re-fetch first to pick up status
    // changes from step 1.
    const refreshedInvoices = dryRun ? invoices : await xero.getContactInvoices(contact.ContactID);
    for (const i of refreshedInvoices) {
      if (i.Status === 'VOIDED' || i.Status === 'DELETED') {
        report.invoices.push({ number: i.InvoiceNumber, status: i.Status, action: 'skipped' });
        continue;
      }
      if (dryRun) {
        report.invoices.push({ number: i.InvoiceNumber, status: i.Status, total: i.Total, action: 'would-void' });
        continue;
      }
      try {
        // Delete any direct payments still attached
        const detail = await xero.getInvoice(i.InvoiceID);
        const payments = (detail?.Payments || []).filter((p) => p.Status !== 'DELETED');
        for (const p of payments) {
          await xero.deletePayment(p.PaymentID);
        }
        await xero.voidInvoice(i.InvoiceID);
        report.invoices.push({ number: i.InvoiceNumber, total: i.Total, paymentsDeleted: payments.length, action: 'voided' });
      } catch (err) {
        report.invoices.push({ number: i.InvoiceNumber, total: i.Total, action: 'failed', error: err.message.slice(0, 300) });
      }
    }

    log.info({ contactName: name, summary: { bt: report.bankTransactions.length, inv: report.invoices.length } }, 'xero-purge-contact complete');
    res.json({ ok: true, report });
  } catch (err) {
    log.error({ err: err.message }, 'xero-purge-contact failed');
    res.status(500).json({ error: err.message });
  }
});

router.get('/contacts-diag', async (req, res) => {
  try {
    const stats = await billingDb.contactsDiag();
    // duplicateIdGroups isn't meaningful with a PRIMARY KEY constraint —
    // duplicates can't exist. Kept in the response for backwards compatibility.
    res.json({
      ok: true,
      totalRows: stats.total_rows,
      uniqueClinikoIds: stats.unique_cliniko_ids,
      duplicateIdGroups: 0,
      blankIds: stats.blank_ids,
      fundsPopulated: stats.funds_populated,
      memsPopulated: stats.mems_populated,
      medsPopulated: stats.meds_populated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cliniko-customfields-shape', async (req, res) => {
  try {
    const cliniko = require('../services/cliniko');
    const data = await cliniko.getPatients();
    const patients = data.patients || [];
    const sample = patients.slice(0, 5).map((p) => {
      const cf = p.custom_fields;
      if (!cf) return { hasCustomFields: false };
      const sections = Array.isArray(cf) ? cf : Array.isArray(cf.sections) ? cf.sections : [];
      return {
        hasCustomFields: true,
        sectionCount: sections.length,
        // Labels only (not values) so no PHI leaks
        fieldLabels: sections.flatMap((s) => (s?.fields || []).map((f) => f.name || f.label || f.token || '')),
      };
    });
    res.json({ ok: true, totalReturned: patients.length, sample });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/xero-smoke', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const org = await xero.getOrganisation();
    log.info({ org: org.name }, 'Xero smoke test ok');
    res.json({ ok: true, ...org });
  } catch (err) {
    log.error({ err: err.message }, 'Xero smoke test failed');
    res.status(500).json({ error: err.message });
  }
});

// CSV export of any billing table — replaces the "open the Sheet tab to eyeball
// it" workflow. Streams CSV to the caller. Protected by the X-Admin-Token
// middleware mounted at the top of this router.
router.get('/export/:table', async (req, res) => {
  const { table } = req.params;
  const cols = billingDb.COLUMNS[table];
  if (!cols) return res.status(404).json({ error: `Unknown table: ${table}` });

  const format = String(req.query.format || 'csv').toLowerCase();
  try {
    const rows = await billingDb.getTab(table);
    if (format === 'json') return res.json({ table, count: rows.length, rows });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    const escape = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    res.write(cols.join(',') + '\n');
    for (const row of rows) {
      res.write(cols.map((c) => escape(row[c])).join(',') + '\n');
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dashboard-sync', async (req, res) => {
  const log = withCorrelation(req);
  try {
    const { runDashboardSync } = require('../jobs/dashboard-sync');
    const stats = await runDashboardSync(log);
    res.json({ ok: true, ...stats });
  } catch (err) {
    log.error({ err: err.message }, 'admin dashboard-sync failed');
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Clean-slate tooling for migrating to a new Xero tenant.
// ────────────────────────────────────────────────────────────────────────────

// TRUNCATE every billing-db table. Schema is preserved. bank_rules and
// worker cursors are wiped too — caller must re-seed bank_rules (via
// /admin/seed-bank-rules) and reset cursors before replay.
//
// Body:
//   confirm  — must equal "I-mean-it". Hard guard against accidental hits.
//   dryRun   — bool (default true). When true, returns the current row counts
//              per table without truncating.
router.post('/wipe-billing-state', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const { confirm, dryRun = true } = req.body || {};
  const { pool } = require('../db/pool');

  const tables = [
    'contacts', 'invoices', 'appointments', 'payments',
    'bank_transactions', 'bank_rules', 'reconciliation_flags',
    'actions_required', 'idempotency_keys', 'worker_state',
    'referrals', 'tyro_ingest', 'stripe_payments',
    'appointment_invoices', 'stripe_cliniko_links',
  ];

  try {
    const before = {};
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      before[t] = r.rows[0].n;
    }

    if (dryRun) {
      return res.json({ ok: true, dryRun: true, rowCounts: before, note: 'Pass {"confirm":"I-mean-it","dryRun":false} to actually wipe.' });
    }

    if (confirm !== 'I-mean-it') {
      return res.status(400).json({ error: 'confirm must equal "I-mean-it" to wipe state' });
    }

    // Single TRUNCATE statement is atomic and faster than per-table.
    // RESTART IDENTITY resets bank_rules' SERIAL pk.
    await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY`);
    log.warn({ tablesWiped: tables.length, before }, 'BILLING STATE WIPED');
    res.json({ ok: true, wiped: true, rowCountsBefore: before });
  } catch (err) {
    log.error({ err: err.message }, 'wipe-billing-state failed');
    res.status(500).json({ error: err.message });
  }
});

// One-shot orchestrator: re-seed bank rules → sync contacts from Cliniko →
// backfill Stripe payments (creating Xero overpayments) → backfill Cliniko
// appointments (raising Xero invoices + allocating credit) → trigger Tyro
// CSV ingest from the Drive folder.
//
// Order matters: Stripe overpayments must land before appointments that
// consume that credit, or the allocation step short-circuits to "insufficient
// credit" flags.
//
// Body:
//   confirm        — must equal "I-mean-it".
//   stripeSince    — ISO date for Stripe backfill `since` (required). e.g.
//                    "2026-03-25" — when DD billing started.
//   appointmentsSince — ISO timestamp for Cliniko appointment poller cursor
//                    (required). Typically same as or earlier than stripeSince.
//   skipTyroDrive  — bool. Default false. Skip the Drive CSV step.
//   stripeLimit    — int. Forwarded to /backfill-stripe (default 500).
//
// Idempotency: this is safe to re-run after a partial failure. PK constraints
// dedupe on stripe_event_id, cliniko_appointment_id, tyro transaction_id.
router.post('/replay-from-scratch', express.json(), async (req, res) => {
  const log = withCorrelation(req);
  const {
    confirm,
    stripeSince,
    appointmentsSince,
    skipTyroDrive = false,
    stripeLimit = 5000,
  } = req.body || {};

  if (confirm !== 'I-mean-it') {
    return res.status(400).json({ error: 'confirm must equal "I-mean-it"' });
  }
  if (!stripeSince) return res.status(400).json({ error: 'stripeSince (ISO date) required' });
  if (!appointmentsSince) return res.status(400).json({ error: 'appointmentsSince (ISO timestamp) required' });

  const report = { steps: [] };
  const step = async (name, fn) => {
    const t0 = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - t0;
      report.steps.push({ name, ok: true, ms, ...result });
      log.info({ step: name, ms, result }, 'replay step ok');
    } catch (err) {
      const ms = Date.now() - t0;
      report.steps.push({ name, ok: false, ms, error: err.message });
      log.error({ step: name, err: err.message }, 'replay step failed');
      throw err;
    }
  };

  try {
    // 1. Re-seed bank rules (idempotent; same list as /admin/seed-bank-rules).
    await step('seed-bank-rules', async () => {
      const { DEFAULT_BANK_RULES } = require('../lib/bank-rules');
      await billingDb.replaceBankRules(DEFAULT_BANK_RULES);
      return { rows: DEFAULT_BANK_RULES.length };
    });

    // 2. Rewind Cliniko sync cursor + run a full sync (populates contacts/invoices/appointments).
    // Use appointmentsSince as the floor — going further back risks the sync
    // fetching years of unchanged data on a single tick and timing out.
    await step('sync-cliniko', async () => {
      const { syncCliniko } = require('../jobs/sync-cliniko');
      await billingDb.setWorkerState('cliniko_last_sync', appointmentsSince);
      const counts = await syncCliniko(log);
      return counts;
    });

    // 3. Backfill Stripe payments — creates Xero contacts + overpayments.
    await step('backfill-stripe', async () => {
      const { getStripe } = require('../services/stripe');
      const { backfillInvoice } = require('../jobs/stripe-handler');
      const sinceTs = Math.floor(new Date(stripeSince).getTime() / 1000);
      const stripe = await getStripe();
      const candidates = [];
      let starting_after;
      while (candidates.length < stripeLimit) {
        const page = await stripe.invoices.list({
          status: 'paid',
          created: { gte: sinceTs },
          limit: 100,
          ...(starting_after ? { starting_after } : {}),
        });
        candidates.push(...page.data);
        if (!page.has_more) break;
        starting_after = page.data[page.data.length - 1]?.id;
      }
      const slice = candidates.slice(0, stripeLimit);
      // Stripe lists newest first; replay oldest first so credit accrues in order.
      slice.sort((a, b) => (a.created || 0) - (b.created || 0));

      const results = { processed: 0, duplicate: 0, failed: 0, zero_amount_skipped: 0 };
      for (const inv of slice) {
        if (!inv.amount_paid || inv.amount_paid <= 0) { results.zero_amount_skipped++; continue; }
        try {
          const r = await backfillInvoice(inv, log);
          results[r.status] = (results[r.status] || 0) + 1;
        } catch (err) {
          results.failed++;
          log.error({ invoice_id: inv.id, err: err.message }, 'replay stripe: per-invoice failure');
        }
      }
      return { totalCandidates: candidates.length, ...results };
    });

    // 4. Backfill Cliniko appointments — invoices + credit allocation.
    await step('backfill-cliniko-appointments', async () => {
      await billingDb.setWorkerState('cliniko_appointments_last_polled', appointmentsSince);
      const { pollClinikoAppointments } = require('../jobs/poll-cliniko-appointments');
      const stats = await pollClinikoAppointments(log);
      return stats;
    });

    // 5. Tyro CSVs from Drive folder.
    if (!skipTyroDrive) {
      await step('ingest-tyro-drive', async () => {
        const { ingestTyroFromDrive } = require('../jobs/ingest-tyro-drive');
        return await ingestTyroFromDrive(log);
      });
    } else {
      report.steps.push({ name: 'ingest-tyro-drive', skipped: true });
    }

    res.json({ ok: true, report });
  } catch (err) {
    res.status(500).json({ ok: false, partialReport: report, error: err.message });
  }
});

module.exports = router;
