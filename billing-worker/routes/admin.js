'use strict';

const express = require('express');
const router = express.Router();
const { resolveFlag } = require('../jobs/reconcile');
const { withCorrelation } = require('../lib/logger');
const { getSheets, getTab, getWorkerState, setWorkerState } = require('../services/sheets');
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
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const { keys, prefix } = req.body || {};
  if (!Array.isArray(keys) && typeof prefix !== 'string') {
    return res.status(400).json({ error: 'keys (array) or prefix (string) required' });
  }

  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'IdempotencyKeys!A:B' });
  const rows = existing.data.values || [];
  const matches = (k) => {
    if (Array.isArray(keys) && keys.includes(k)) return true;
    if (typeof prefix === 'string' && prefix.length > 0 && String(k).startsWith(prefix)) return true;
    return false;
  };
  const kept = rows.filter(([k]) => !matches(k));

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'IdempotencyKeys!A:B' });
  if (kept.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: 'IdempotencyKeys!A1', valueInputOption: 'RAW',
      requestBody: { values: kept },
    });
  }
  res.json({ ok: true, removed: rows.length - kept.length, remaining: kept.length });
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
  const sheets = await getSheets();
  const spreadsheetId = process.env.SHEETS_LEDGER_ID;
  const rules = [
    ['STRIPE', 'stripe_payout', '4000', 'Stripe settlements'],
    ['TYRO SETTLEMENT', 'tyro_revenue', '4001', 'Tyro terminal income'],
    ['HEALTHPOINT', 'health_fund', '4002', 'Health fund claims'],
    ['MCARE', 'medicare', '4003', 'Medicare / DVA payments'],
    ['SQUARE', 'eftpos_revenue', '4004', 'Square terminal income'],
    ['SPLOSE', 'software', '6100', 'Splose practice management'],
    ['GOOGLE WORKSPACE', 'software', '6100', 'Google Workspace'],
    ['MICROSOFT', 'software', '6100', 'Microsoft subscription'],
    ['CLAUDE.AI', 'software', '6100', 'Anthropic Claude subscription'],
    ['ELEVENLABS', 'software', '6100', 'ElevenLabs subscription'],
    ['GUILD INSURANCE', 'insurance', '6200', 'Professional indemnity insurance'],
    ['CLINIKO', 'software', '6100', 'Cliniko practice management'],
    ['DIDIMOBILITY', 'equipment', '6300', 'Equipment / mobility aids'],
    ['JB HI.?FI', 'equipment', '6300', 'JB Hi-Fi equipment purchases'],
    ['TRANSFER FROM CBA', 'client_payment', '4005', 'Client direct bank transfer via CBA'],
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'BankRules!A2:D16',
    valueInputOption: 'RAW',
    requestBody: { values: rules },
  });
  res.json({ ok: true, rows: rules.length });
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
    const sheets = await getSheets();
    const spreadsheetId = process.env.SHEETS_LEDGER_ID;
    const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Contacts!A:Z' });
    const rows = r.data.values || [];
    if (rows.length < 1) return res.json({ ok: true, totalRows: 0 });
    const header = rows[0];
    const idIdx = header.indexOf('cliniko_id');
    const fundIdx = header.indexOf('phi_fund');
    const memIdx = header.indexOf('phi_membership_number');
    const medIdx = header.indexOf('medicare_reference');
    const dataRows = rows.slice(1);
    const ids = dataRows.map((r) => (idIdx >= 0 ? r[idIdx] : ''));
    const idCounts = ids.reduce((m, id) => { m[id] = (m[id] || 0) + 1; return m; }, {});
    const duplicateIdGroups = Object.values(idCounts).filter((c) => c > 1).length;
    const blankIds = ids.filter((x) => !x || !String(x).trim()).length;
    const fundsPopulated = fundIdx >= 0 ? dataRows.filter((r) => r[fundIdx] && String(r[fundIdx]).trim()).length : 0;
    const memsPopulated = memIdx >= 0 ? dataRows.filter((r) => r[memIdx] && String(r[memIdx]).trim()).length : 0;
    const medsPopulated = medIdx >= 0 ? dataRows.filter((r) => r[medIdx] && String(r[medIdx]).trim()).length : 0;
    res.json({
      ok: true,
      header,
      totalRows: dataRows.length,
      uniqueClinikoIds: Object.keys(idCounts).length,
      duplicateIdGroups,
      blankIds,
      fundsPopulated,
      memsPopulated,
      medsPopulated,
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

module.exports = router;
