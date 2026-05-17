'use strict';

// Xero API adapter.
//
// Token lifecycle: access tokens last 30 min; refresh tokens are single-use and
// rotated on every grant_type=refresh_token call. We cache the access token in
// memory and refresh on demand. The new refresh token MUST be written back to
// Secret Manager BEFORE we cache the access token, otherwise a crash mid-flight
// loses the only valid refresh token and the integration is bricked until a
// human re-runs the OAuth consent flow.
//
// Concurrency: this adapter assumes Cloud Run is capped at max-instances=1.
// Two instances racing on refresh would each call /connect/token with the same
// refresh token; one wins, the other's next refresh fails with invalid_grant.

const fetch = require('node-fetch');
const { getSecret, setSecret } = require('./secrets');
const { logger } = require('./logger');

const IDENTITY_URL = 'https://identity.xero.com/connect/token';
const API_BASE = 'https://api.xero.com/api.xro/2.0';

const RATE_LIMIT = 50;
const WINDOW_MS = 60_000;

let tokens = RATE_LIMIT;
let lastRefill = Date.now();

function consumeToken() {
  const now = Date.now();
  if (now - lastRefill >= WINDOW_MS) {
    tokens = RATE_LIMIT;
    lastRefill = now;
  }
  if (tokens <= 0) return false;
  tokens--;
  return true;
}

async function waitForToken() {
  while (!consumeToken()) await new Promise((r) => setTimeout(r, 500));
}

let _accessToken = null;
let _accessTokenExpiresAt = 0;
let _refreshPromise = null;
let _tenantId = null;

// Write-guard: refuse Xero mutations when Stripe is in test mode and the Xero
// tenant isn't on the sandbox allowlist. Prevents staging Stripe events from
// hitting a production Xero ledger (the May 2026 test-pollution incident).
//
// Override (advanced — last resort): set ALLOW_TEST_STRIPE_PROD_XERO=true on
// Cloud Run. Sanctioned sandbox tenant IDs go in XERO_SANDBOX_TENANT_IDS as a
// comma-separated list.
let _writeGuardResult = undefined;
async function getWriteGuardError() {
  if (_writeGuardResult !== undefined) return _writeGuardResult;
  if (String(process.env.ALLOW_TEST_STRIPE_PROD_XERO || '').toLowerCase() === 'true') {
    logger.warn('ALLOW_TEST_STRIPE_PROD_XERO=true — Xero write guard disabled');
    _writeGuardResult = null;
    return null;
  }
  try {
    const [stripeKey, tenantId] = await Promise.all([
      getSecret('stripe-secret-key'),
      getSecret('xero-tenant-id'),
    ]);
    const isTestMode = stripeKey.trim().startsWith('sk_test_');
    if (!isTestMode) { _writeGuardResult = null; return null; }
    const sandboxList = String(process.env.XERO_SANDBOX_TENANT_IDS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (sandboxList.includes(tenantId.trim())) { _writeGuardResult = null; return null; }
    _writeGuardResult = new Error(
      'Xero write blocked: Stripe is in test mode (sk_test_*) but the active Xero ' +
      'tenant is not in XERO_SANDBOX_TENANT_IDS. Add the tenant to that allowlist ' +
      '(for a real sandbox org) or set ALLOW_TEST_STRIPE_PROD_XERO=true to override.'
    );
    logger.error({ tenantPrefix: tenantId.trim().slice(0, 8) }, _writeGuardResult.message);
    return _writeGuardResult;
  } catch (err) {
    logger.warn({ err: err.message }, 'Write-guard check failed — allowing writes');
    _writeGuardResult = null;
    return null;
  }
}

async function getTenantId() {
  if (!_tenantId) _tenantId = (await getSecret('xero-tenant-id')).trim();
  return _tenantId;
}

async function refreshAccessToken() {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getSecret('xero-client-id'),
    getSecret('xero-client-secret'),
    getSecret('xero-refresh-token'),
  ]);
  const basic = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64');

  const res = await fetch(IDENTITY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken.trim(),
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, 'Xero token refresh failed');
    throw new Error(`Xero token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  if (!data.refresh_token || !data.access_token) {
    throw new Error('Xero token refresh returned incomplete payload');
  }

  // Persist the new refresh token before caching the access token. If the
  // process dies between these two steps, the worst case is we re-fetch and
  // refresh again on next cold start — no token loss.
  await setSecret('xero-refresh-token', data.refresh_token);

  _accessToken = data.access_token;
  _accessTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  logger.info({ expiresIn: data.expires_in }, 'Xero access token refreshed');
}

async function getAccessToken() {
  if (_accessToken && Date.now() < _accessTokenExpiresAt) return _accessToken;
  if (!_refreshPromise) {
    _refreshPromise = refreshAccessToken().finally(() => {
      _refreshPromise = null;
    });
  }
  await _refreshPromise;
  return _accessToken;
}

async function xeroFetch(method, path, body, retryOn401 = true) {
  if (method !== 'GET') {
    const guardErr = await getWriteGuardError();
    if (guardErr) throw guardErr;
  }
  const delays = [1000, 2000, 4000, 8000];
  let lastErr;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    await waitForToken();

    try {
      const accessToken = await getAccessToken();
      const tenantId = await getTenantId();

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-tenant-id': tenantId,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 401 && retryOn401) {
        _accessToken = null;
        _accessTokenExpiresAt = 0;
        return xeroFetch(method, path, body, false);
      }

      if (res.status === 429 || res.status >= 500) {
        const delay = delays[attempt];
        if (delay === undefined) {
          const text = await res.text();
          throw new Error(`Xero ${res.status} for ${path} after retries: ${text}`);
        }
        logger.warn({ path, status: res.status, attempt }, 'Xero rate limit / server error — retrying');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Xero ${res.status} for ${path}: ${text}`);
      }

      return res.json();
    } catch (err) {
      lastErr = err;
      const delay = delays[attempt];
      if (delay === undefined) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

async function getOrganisation() {
  const data = await xeroFetch('GET', '/Organisation');
  const org = (data.Organisations || [])[0] || {};
  return {
    name: org.Name,
    legalName: org.LegalName,
    countryCode: org.CountryCode,
    baseCurrency: org.BaseCurrency,
    organisationID: org.OrganisationID,
  };
}

async function findContactsByName(name) {
  const data = await xeroFetch('GET', `/Contacts?where=${encodeURIComponent(`Name="${name}"`)}`);
  return data.Contacts || [];
}

async function findOrCreateContact({ name, email, clinikoId }) {
  if (!name) throw new Error('findOrCreateContact: name required');

  if (clinikoId) {
    const found = await xeroFetch('GET', `/Contacts?where=${encodeURIComponent(`AccountNumber="${clinikoId}"`)}`);
    if (found.Contacts && found.Contacts.length > 0) return found.Contacts[0].ContactID;
  }
  if (email) {
    const found = await xeroFetch('GET', `/Contacts?where=${encodeURIComponent(`EmailAddress="${email}"`)}`);
    if (found.Contacts && found.Contacts.length > 0) return found.Contacts[0].ContactID;
  }

  const created = await xeroFetch('POST', '/Contacts', {
    Contacts: [{
      Name: name,
      EmailAddress: email || undefined,
      AccountNumber: clinikoId ? String(clinikoId) : undefined,
    }],
  });
  return created.Contacts[0].ContactID;
}

async function createInvoice({ contactId, lineItems, reference, date, dueDate, status = 'AUTHORISED' }) {
  if (!contactId) throw new Error('createInvoice: contactId required');
  if (!Array.isArray(lineItems) || lineItems.length === 0) throw new Error('createInvoice: lineItems required');

  const created = await xeroFetch('POST', '/Invoices', {
    Invoices: [{
      Type: 'ACCREC',
      Contact: { ContactID: contactId },
      LineItems: lineItems.map((li) => ({
        Description: li.description,
        Quantity: li.quantity,
        UnitAmount: li.unitAmount,
        AccountCode: li.accountCode,
        TaxType: li.taxType,
      })),
      Reference: reference,
      Date: date,
      DueDate: dueDate,
      Status: status,
    }],
  });
  const inv = created.Invoices[0];
  return { invoiceId: inv.InvoiceID, invoiceNumber: inv.InvoiceNumber };
}

async function createOverpayment({ contactId, amount, date, reference, bankAccountCode, bankAccountAccountId }) {
  if (!contactId || !amount || (!bankAccountCode && !bankAccountAccountId)) {
    throw new Error('createOverpayment: contactId, amount, and bankAccountCode or bankAccountAccountId required');
  }

  // Xero's POST /Overpayments endpoint is read-only. To create an unallocated
  // customer credit, post a BankTransaction with Type RECEIVE-OVERPAYMENT —
  // Xero auto-creates the linked Overpayment record on the contact.
  const bankAccount = bankAccountAccountId
    ? { AccountID: bankAccountAccountId }
    : { Code: bankAccountCode };

  const created = await xeroFetch('POST', '/BankTransactions', {
    BankTransactions: [{
      Type: 'RECEIVE-OVERPAYMENT',
      Contact: { ContactID: contactId },
      BankAccount: bankAccount,
      Date: date,
      Reference: reference,
      LineAmountTypes: 'NoTax',
      LineItems: [{
        Description: reference || 'Prepayment',
        LineAmount: amount,
      }],
      Status: 'AUTHORISED',
    }],
  });

  // Response shape: BankTransactions[0].OverpaymentID links to the auto-created overpayment.
  // Some Xero responses surface it on the line item or in a separate Overpayments array.
  const txn = created.BankTransactions[0];
  if (txn.OverpaymentID) return txn.OverpaymentID;

  // Fallback: query overpayments for this contact and pick the most recent matching amount.
  const overpayments = await getContactOverpayments(contactId);
  const match = overpayments.find((o) => Math.abs(o.total - amount) < 0.01);
  if (!match) {
    throw new Error('createOverpayment: bank txn created but linked overpayment not found');
  }
  return match.overpaymentId;
}

async function getContactOverpayments(contactId) {
  if (!contactId) throw new Error('getContactOverpayments: contactId required');
  const where = encodeURIComponent(`Contact.ContactID=guid("${contactId}") AND Status=="AUTHORISED"`);
  const data = await xeroFetch('GET', `/Overpayments?where=${where}`);
  return (data.Overpayments || [])
    .map((o) => ({
      overpaymentId: o.OverpaymentID,
      total: Number(o.Total) || 0,
      remaining: Number(o.RemainingCredit) || 0,
      date: o.Date,
    }))
    .filter((o) => o.remaining > 0);
}

async function applyOverpayment({ overpaymentId, invoiceId, amount }) {
  if (!overpaymentId || !invoiceId || !amount) {
    throw new Error('applyOverpayment: overpaymentId, invoiceId, amount required');
  }
  return xeroFetch('PUT', `/Overpayments/${overpaymentId}/Allocations`, {
    Allocations: [{ Invoice: { InvoiceID: invoiceId }, Amount: amount }],
  });
}

async function createPayment({ invoiceId, amount, date, accountCode, accountId, reference }) {
  if (!invoiceId || !amount || (!accountCode && !accountId)) {
    throw new Error('createPayment: invoiceId, amount, and accountCode or accountId required');
  }
  const account = accountId ? { AccountID: accountId } : { Code: accountCode };
  const created = await xeroFetch('PUT', '/Payments', {
    Payments: [{
      Invoice: { InvoiceID: invoiceId },
      Account: account,
      Date: date,
      Amount: amount,
      Reference: reference,
    }],
  });
  return created.Payments[0].PaymentID;
}

async function createCreditNote({ contactId, lineItems, reference, date }) {
  if (!contactId) throw new Error('createCreditNote: contactId required');
  if (!Array.isArray(lineItems) || lineItems.length === 0) throw new Error('createCreditNote: lineItems required');

  const created = await xeroFetch('POST', '/CreditNotes', {
    CreditNotes: [{
      Type: 'ACCRECCREDIT',
      Contact: { ContactID: contactId },
      Date: date,
      Reference: reference,
      LineItems: lineItems.map((li) => ({
        Description: li.description,
        Quantity: li.quantity,
        UnitAmount: li.unitAmount,
        AccountCode: li.accountCode,
        TaxType: li.taxType,
      })),
      Status: 'AUTHORISED',
    }],
  });
  return created.CreditNotes[0].CreditNoteID;
}

async function applyCreditNote({ creditNoteId, invoiceId, amount }) {
  if (!creditNoteId || !invoiceId || !amount) {
    throw new Error('applyCreditNote: creditNoteId, invoiceId, amount required');
  }
  return xeroFetch('PUT', `/CreditNotes/${creditNoteId}/Allocations`, {
    Allocations: [{ Invoice: { InvoiceID: invoiceId }, Amount: amount }],
  });
}

async function findInvoiceByNumber(invoiceNumber) {
  const data = await xeroFetch('GET', `/Invoices?InvoiceNumbers=${encodeURIComponent(invoiceNumber)}`);
  return (data.Invoices || [])[0] || null;
}

async function deletePayment(paymentId) {
  return xeroFetch('POST', `/Payments/${paymentId}`, { Payments: [{ PaymentID: paymentId, Status: 'DELETED' }] });
}

async function voidInvoice(invoiceId) {
  return xeroFetch('POST', `/Invoices/${invoiceId}`, { Invoices: [{ InvoiceID: invoiceId, Status: 'VOIDED' }] });
}

async function deleteBankTransaction(bankTransactionId) {
  return xeroFetch('POST', `/BankTransactions/${bankTransactionId}`, {
    BankTransactions: [{ BankTransactionID: bankTransactionId, Status: 'DELETED' }],
  });
}

async function deleteOverpayment(overpaymentId) {
  // Not officially supported by Xero, but worth attempting before falling back
  // to bank-transaction deletion. UI restrictions are often more conservative
  // than the underlying API.
  return xeroFetch('POST', `/Overpayments/${overpaymentId}`, {
    Overpayments: [{ OverpaymentID: overpaymentId, Status: 'DELETED' }],
  });
}

async function findContactByName(name) {
  const where = encodeURIComponent(`Name="${name}"`);
  const data = await xeroFetch('GET', `/Contacts?where=${where}`);
  return (data.Contacts || [])[0] || null;
}

async function getContactBankTransactions(contactId) {
  const where = encodeURIComponent(`Contact.ContactID=guid("${contactId}")`);
  const data = await xeroFetch('GET', `/BankTransactions?where=${where}`);
  return data.BankTransactions || [];
}

async function getContactInvoices(contactId) {
  const where = encodeURIComponent(`Contact.ContactID=guid("${contactId}")`);
  const data = await xeroFetch('GET', `/Invoices?where=${where}`);
  return data.Invoices || [];
}

async function listBankAccounts() {
  const data = await xeroFetch('GET', `/Accounts?where=${encodeURIComponent('Type=="BANK"')}`);
  return (data.Accounts || []).map((a) => ({ name: a.Name, code: a.Code, accountId: a.AccountID, status: a.Status }));
}

async function getInvoice(invoiceId) {
  const data = await xeroFetch('GET', `/Invoices/${invoiceId}`);
  return (data.Invoices || [])[0] || null;
}

// Xero's Aged Receivables By Contact report, flattened into a 2D row array
// suitable for direct write into a Sheets tab. Header row first, then one
// row per contact, then any total rows from Xero. Empty cells appear as ''.
async function getAgedReceivablesSummary() {
  const data = await xeroFetch('GET', '/Reports/AgedReceivablesByContact');
  const report = (data.Reports || [])[0];
  if (!report) return { rows: [['No report returned']] };

  const out = [];
  for (const section of report.Rows || []) {
    if (section.RowType === 'Header') {
      out.push((section.Cells || []).map((c) => String(c.Value ?? '')));
    } else if (section.RowType === 'Section') {
      for (const r of section.Rows || []) {
        out.push((r.Cells || []).map((c) => String(c.Value ?? '')));
      }
    } else if (section.RowType === 'Row' || section.RowType === 'SummaryRow') {
      out.push((section.Cells || []).map((c) => String(c.Value ?? '')));
    }
  }
  return { rows: out };
}

module.exports = {
  getAgedReceivablesSummary,
  getAccessToken,
  getOrganisation,
  findContactsByName,
  findOrCreateContact,
  createInvoice,
  createOverpayment,
  applyOverpayment,
  getContactOverpayments,
  createPayment,
  createCreditNote,
  applyCreditNote,
  getInvoice,
  listBankAccounts,
  findInvoiceByNumber,
  deletePayment,
  voidInvoice,
  deleteBankTransaction,
  deleteOverpayment,
  findContactByName,
  getContactBankTransactions,
  getContactInvoices,
};
