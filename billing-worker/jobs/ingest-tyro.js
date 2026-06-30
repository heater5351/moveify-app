'use strict';

const xero = require('../lib/xero');
const idempotency = require('../lib/idempotency');
const { logger } = require('../lib/logger');
const {
  appendTyroIngest,
  appendActionRequired,
  findContactByMembership,
  getPendingExpectedPayments,
  markExpectedPaymentMatched,
  markExpectedPaymentFlagged,
} = require('../services/billing-db');
const { parseUpfrontRef } = require('../lib/upfront-prices');

// Name compare for upfront reconciliation — lowercase, collapse whitespace, trim.
// Matches on the typed patient/name field, NOT the cardholder (a partner/parent
// may pay), per the agreement-decoupling spec.
function normaliseName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Pure decision for an upfront Tyro row. Given the row's reference + typed name +
// charged amount and the pending expected-payments for that ref code, returns
// what should happen — without any DB / Xero I/O (so it's unit-testable):
//   { kind: 'none' }                        → not an upfront ref; normal handling
//   { kind: 'ambiguous', candidates }       → 0 or >1 name matches; flag, don't book
//   { kind: 'mismatch', exp, expectedCents} → name matches but amount differs; flag
//   { kind: 'match', exp }                  → clean match; book + mark ledger matched
function decideUpfront({ reference, name, amount, pending }) {
  const ref = parseUpfrontRef(reference);
  if (!ref) return { kind: 'none' };
  const named = (pending || []).filter((p) => normaliseName(p.patient_name) === normaliseName(name));
  if (named.length !== 1) return { kind: 'ambiguous', refCode: ref.refCode, candidates: named };
  const exp = named[0];
  const expectedCents = Number(exp.expected_amount_cents);
  if (Math.round(Number(amount) * 100) !== expectedCents) {
    return { kind: 'mismatch', refCode: ref.refCode, exp, expectedCents };
  }
  return { kind: 'match', refCode: ref.refCode, exp };
}

const UNALLOCATED_CONTACT_NAME = 'Unallocated Tyro Claim';
let _unallocatedContactId = null;
async function getUnallocatedContactId() {
  if (_unallocatedContactId) return _unallocatedContactId;
  _unallocatedContactId = await xero.findOrCreateContact({ name: UNALLOCATED_CONTACT_NAME });
  return _unallocatedContactId;
}

const APPROVED_STATUSES = new Set(['approved', 'settled', 'complete', 'completed', 'success']);
const SALES_ACCOUNT_CODE = process.env.XERO_SALES_ACCOUNT_CODE || '200';
const TYRO_CLEARING_ACCOUNT_ID = process.env.XERO_TYRO_CLEARING_ACCOUNT_ID || '14dc34ac-c292-42cb-a98c-78f7f136407e';
const TAX_TYPE = 'EXEMPTOUTPUT'; // Allied health: GST-free under s38-10 GST Act

const HEADER_ALIASES = {
  'transaction id': 'transaction_id',
  'date': 'date',
  'invoice reference': 'invoice_reference',
  'patient': 'patient',
  'provider': 'provider',
  'amount charged': 'amount_charged',
  'amount fee gst exclusive': 'amount_fee_gst_exclusive',
  'amount outstanding': 'amount_outstanding',
  'amount claims gap': 'amount_claims_gap',
  'amount claims benefit': 'amount_claims_benefit',
  'funder': 'funder',
  'membership number': 'membership_number',
  'status': 'status',
  'rejection reason': 'rejection_reason',
  'location name': 'location_name',
  'location address': 'location_address',
  'provider number': 'provider_number',
  'surcharge amount': 'surcharge_amount',
  'refund amount': 'refund_amount',
  'payment amount': 'payment_amount',
  'cancelled claim amount': 'cancelled_claim_amount',
  'cancelled benefit amount': 'cancelled_benefit_amount',
  'phi funder': 'phi_funder',
  'tid': 'tid',
  'mid': 'mid',
  'payment card type': 'payment_card_type',
  'last four': 'last_four',
};

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseTyroCsv(csvText, log) {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const fieldByIndex = headerCells.map((h) => HEADER_ALIASES[h] || null);

  const unknown = headerCells.filter((h) => !HEADER_ALIASES[h]);
  if (unknown.length > 0) log.warn({ unknown }, 'Tyro CSV: ignoring unrecognised columns');

  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < cells.length; i++) {
      if (fieldByIndex[i]) row[fieldByIndex[i]] = cells[i];
    }
    rows.push(row);
  }
  return rows;
}

function normaliseDate(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

function parseAmount(raw) {
  if (raw == null) return NaN;
  const cleaned = String(raw).replace(/[$\s,]/g, '');
  if (cleaned === '') return NaN;
  return parseFloat(cleaned);
}

async function ingestTyroCsv(csvText, log = logger) {
  const rows = parseTyroCsv(csvText, log);
  const counts = {
    total: rows.length,
    processed: 0,
    matched: 0,
    skipped: { notApproved: 0, zeroAmount: 0, duplicate: 0, paidElsewhere: 0 },
    flagged: { duplicateContact: 0, unallocated: 0, upfrontMismatch: 0, upfrontAmbiguous: 0 },
    paymentPending: 0,
  };

  if (rows.length > 0) {
    const headerKeys = Object.keys(rows[0]);
    let amtEmpty = 0, amtUnparseable = 0, amtZero = 0, amtPositive = 0;
    for (const r of rows) {
      const raw = r.amount_charged;
      if (raw == null || String(raw).trim() === '') { amtEmpty++; continue; }
      const v = parseAmount(raw);
      if (!Number.isFinite(v)) amtUnparseable++;
      else if (v <= 0) amtZero++;
      else amtPositive++;
    }
    log.info({ headerKeys, amount: { empty: amtEmpty, unparseable: amtUnparseable, zero: amtZero, positive: amtPositive } }, 'Tyro CSV diagnostic');
  }

  for (const row of rows) {
    const txnId = row.transaction_id;
    if (!txnId) {
      log.warn('Tyro row missing transaction_id — skipping');
      continue;
    }

    const status = (row.status || '').toLowerCase();
    if (!APPROVED_STATUSES.has(status)) {
      counts.skipped.notApproved++;
      continue;
    }

    const amount = parseAmount(row.amount_charged);
    if (!Number.isFinite(amount) || amount <= 0) {
      counts.skipped.zeroAmount++;
      continue;
    }

    // Medicare Patient Claim (PCI) rows submitted via Tyro Health Online portal
    // are claim records, not income events — no card was swiped, no money moved
    // through Tyro. The real income is either already invoiced via Stream B
    // (subscription patients) or appears as a paired card-swipe row (casual
    // patients). Skip to avoid double-counting revenue.
    const funder = (row.funder || '').trim().toLowerCase();
    const cardType = (row.payment_card_type || '').trim();
    if (funder === 'medicare pci' && !cardType) {
      counts.skipped.paidElsewhere++;
      log.info({ txnId, patient: row.patient }, 'Tyro PCI claim row — skipping (no income event)');
      continue;
    }

    const idempKey = `tyro:${txnId}`;
    if (await idempotency.check(idempKey)) {
      counts.skipped.duplicate++;
      continue;
    }

    // Mark BEFORE any Xero writes. If anything downstream fails, the row will
    // be permanently skipped and require manual investigation (check TyroIngest
    // tab for missing invoice number) — this is strictly safer than the alt,
    // where a failed mark after a successful invoice creates a duplicate on
    // the next run.
    await idempotency.mark(idempKey);

    let patientName = (row.patient || '').trim();
    let unallocated = false;
    let candidateIds = '';
    const funderForLookup = row.funder || row.phi_funder || '';

    // Upfront block reconciliation. A `PIF T1` / `PCL T2` reference means this
    // swipe is the lump payment for an upfront agreement — it should match a
    // pending expected-payment we wrote at signing. Match on the typed name
    // field (not cardholder), cross-check the amount against the tier, and flag
    // (never silently book) on mismatch/ambiguity. A clean match falls through
    // to the normal Xero invoice + payment path with the resolved patient name.
    const upfrontRef = parseUpfrontRef(row.invoice_reference);
    if (upfrontRef) {
      const pending = await getPendingExpectedPayments({ refCode: upfrontRef.refCode });
      const decision = decideUpfront({ reference: row.invoice_reference, name: row.patient, amount, pending });
      if (decision.kind === 'ambiguous') {
        await appendActionRequired({
          id: `upfront-ambiguous:${txnId}`,
          type: 'upfront_unmatched',
          cliniko_id: decision.candidates.map((p) => p.cliniko_id).filter(Boolean).join(','),
          patient_name: patientName,
          amount: row.amount_charged,
          description: `Upfront Tyro ref ${upfrontRef.refCode} for "${patientName || '(no name)'}" matched ${decision.candidates.length} pending expected-payments. Resolve manually and book in Xero.`,
          status: 'open',
          created_at: new Date().toISOString(),
          done_at: '',
        });
        counts.flagged.upfrontAmbiguous++;
        log.warn({ txnId, refCode: upfrontRef.refCode, matches: decision.candidates.length }, 'Upfront Tyro row — no single name match, flagged');
        continue;
      }
      if (decision.kind === 'mismatch') {
        const { exp, expectedCents } = decision;
        await markExpectedPaymentFlagged(exp.id, `amount $${amount} != expected $${(expectedCents / 100).toFixed(2)}`);
        await appendActionRequired({
          id: `upfront-mismatch:${txnId}`,
          type: 'upfront_amount_mismatch',
          cliniko_id: exp.cliniko_id || '',
          patient_name: exp.patient_name || patientName,
          amount: row.amount_charged,
          description: `Upfront Tyro ref ${upfrontRef.refCode} for "${exp.patient_name}" charged $${amount} but tier expects $${(expectedCents / 100).toFixed(2)}. Review before booking.`,
          status: 'open',
          created_at: new Date().toISOString(),
          done_at: '',
        });
        counts.flagged.upfrontMismatch++;
        log.warn({ txnId, refCode: upfrontRef.refCode, amount, expectedCents }, 'Upfront Tyro row — amount mismatch, flagged');
        continue;
      }
      // Clean match — book to the resolved patient, mark the ledger row matched.
      patientName = decision.exp.patient_name || patientName;
      await markExpectedPaymentMatched(decision.exp.id, txnId);
      counts.matched++;
      log.info({ txnId, refCode: upfrontRef.refCode, patient: patientName }, 'Upfront Tyro row matched expected-payment');
    }

    if (!patientName) {
      const candidates = await findContactByMembership({
        funder: funderForLookup,
        membership: row.membership_number,
      });
      if (candidates.length === 1) {
        patientName = candidates[0].name;
      } else {
        unallocated = true;
        candidateIds = candidates.map((c) => c.cliniko_id).join(',');
      }
    }

    try {
      let contactId;
      if (unallocated) {
        contactId = await getUnallocatedContactId();
      } else {
        const matches = await xero.findContactsByName(patientName);
        if (matches.length > 1) {
          await appendActionRequired({
            id: `tyro-dup:${txnId}`,
            type: 'tyro_duplicate_contact',
            cliniko_id: '',
            patient_name: patientName,
            amount: row.amount_charged,
            description: `Multiple Xero contacts match this name; manually pick the right one for Tyro txn ${txnId}.`,
            status: 'open',
            created_at: new Date().toISOString(),
            done_at: '',
          });
          counts.flagged.duplicateContact++;
          continue;
        }
        contactId = matches.length === 1
          ? matches[0].ContactID
          : await xero.findOrCreateContact({ name: patientName });
      }

      const description = unallocated
        ? `Unallocated Tyro claim — Funder=${funderForLookup || 'Unknown'} membership=${row.membership_number || 'n/a'} date=${row.date || ''}`
        : `Allied health service — ${row.provider || 'Provider'}` +
          (row.funder ? ` (${row.funder})` : '');

      const isoDate = normaliseDate(row.date);
      const invoice = await xero.createInvoice({
        contactId,
        lineItems: [{
          description,
          quantity: 1,
          unitAmount: amount,
          accountCode: SALES_ACCOUNT_CODE,
          taxType: TAX_TYPE,
        }],
        reference: row.invoice_reference || txnId,
        date: isoDate,
        dueDate: isoDate,
        status: 'AUTHORISED',
      });

      let paymentPosted = false;
      try {
        await xero.createPayment({
          invoiceId: invoice.invoiceId,
          amount,
          date: isoDate,
          accountId: TYRO_CLEARING_ACCOUNT_ID,
          reference: txnId,
        });
        paymentPosted = true;
      } catch (payErr) {
        log.error({ txnId, err: payErr.message }, 'Payment posting failed — invoice left AUTHORISED');
      }

      await appendTyroIngest({
        transaction_id: txnId,
        date: row.date,
        patient: patientName,
        amount_charged: row.amount_charged,
        funder: row.funder || '',
        status: row.status,
        xero_invoice_id: invoice.invoiceId,
        xero_invoice_number: invoice.invoiceNumber,
        ingested_at: new Date().toISOString(),
      });

      if (unallocated) {
        await appendActionRequired({
          id: `tyro-unallocated:${txnId}`,
          type: 'tyro_unallocated',
          cliniko_id: candidateIds,
          patient_name: '',
          amount: row.amount_charged,
          description: `Tyro nameless claim. Funder=${funderForLookup || 'Unknown'} membership=${row.membership_number || 'n/a'} date=${row.date}. Reassign in Xero invoice ${invoice.invoiceNumber}.`,
          status: 'open',
          created_at: new Date().toISOString(),
          done_at: '',
        });
        counts.flagged.unallocated++;
      } else {
        counts.processed++;
      }
      if (!paymentPosted) counts.paymentPending++;
      log.info({ txnId, invoiceNumber: invoice.invoiceNumber, paid: paymentPosted, unallocated }, 'Tyro row → Xero invoice created');
    } catch (err) {
      log.error({ txnId, err: err.message }, 'Tyro row failed');
    }
  }

  log.info(counts, 'Tyro CSV ingestion complete');
  return counts;
}

module.exports = { ingestTyroCsv, parseTyroCsv, decideUpfront };
