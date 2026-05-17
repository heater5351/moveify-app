'use strict';

// One-off recovery for P&P invoices that didn't get created on second-cycle+
// 4-weekly DDs (the invoice.period_start collision bug, fixed in
// stripe-handler.js maybeCreatePpInvoice).
//
// For each row in `stripe_payments` where pp_invoice_id is empty and the
// product is a 4-weekly P&P-bearing tier, this script will:
//   1. Re-fetch the Stripe invoice (to get the line item period)
//   2. Compute the correct anchor (lines[0].period.start)
//   3. Skip if `pp:<cliniko>:<anchor>` already marked
//   4. Create Xero invoice for the P&P amount
//   5. Allocate from the existing overpayment (xero_overpayment_id from PG row)
//   6. Update PG row's pp_invoice_id and pp_amount
//   7. Mark the idempotency key
//
// Usage (dry-run):
//   node scripts/recover-missing-pp.js --dry-run
// Real run:
//   node scripts/recover-missing-pp.js
//
// Requires Cloud SQL Auth Proxy on 127.0.0.1:5433 (or BILLING_DATABASE_URL
// env). Reads Stripe + Xero secrets via the standard secret manager flow.

require('dotenv').config();

const { getAll, query, pool } = require('../db/pool');
const { getPpFee } = require('../lib/rates');
const { check, mark } = require('../lib/idempotency');
const xero = require('../lib/xero');
const { getSecret } = require('../lib/secrets');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const stripeKey = (await getSecret('stripe-secret-key')).trim();
  const stripe = require('stripe')(stripeKey);

  const candidates = await getAll(
    `SELECT * FROM stripe_payments
     WHERE (pp_invoice_id IS NULL OR pp_invoice_id = '')
       AND tier IS NOT NULL AND tier <> ''
     ORDER BY paid_at`
  );
  console.log(`Found ${candidates.length} stripe_payments rows with no pp_invoice_id`);

  const results = [];
  for (const row of candidates) {
    const ppFee = getPpFee(row.tier);
    if (!ppFee || !ppFee.amount) {
      results.push({ invoice_id: row.stripe_invoice_id, tier: row.tier, action: 'skip-no-pp-fee' });
      continue;
    }
    if (ppFee.billing === 'block') {
      // Block products correctly skip P&P on cycles 2+ — only first DD creates it.
      // Anything missing pp here for blocks is the expected idempotency hit.
      results.push({ invoice_id: row.stripe_invoice_id, tier: row.tier, action: 'skip-block-cycle2+' });
      continue;
    }
    if (!row.xero_overpayment_id || !row.xero_contact_id) {
      results.push({ invoice_id: row.stripe_invoice_id, action: 'skip-missing-overpayment' });
      continue;
    }

    let invoice;
    try { invoice = await stripe.invoices.retrieve(row.stripe_invoice_id); }
    catch (err) {
      results.push({ invoice_id: row.stripe_invoice_id, action: 'fail-stripe-fetch', error: err.message });
      continue;
    }

    const lineItem = invoice.lines?.data?.[0];
    const linePeriodStart = lineItem?.period?.start;
    const linePeriodEnd = lineItem?.period?.end;
    const anchorSec = linePeriodStart || invoice.created;
    const anchor = new Date(anchorSec * 1000).toISOString().slice(0, 10);
    const ppKey = `pp:${row.cliniko_id}:${row.tier}:${anchor}`;
    const legacyKey = `pp:${row.cliniko_id}:${anchor}`;

    if (await check(ppKey) || await check(legacyKey)) {
      results.push({ invoice_id: row.stripe_invoice_id, tier: row.tier, anchor, action: 'skip-already-marked' });
      continue;
    }

    const periodStart = anchor;
    const periodEnd = linePeriodEnd
      ? new Date(linePeriodEnd * 1000).toISOString().slice(0, 10)
      : '';

    if (DRY_RUN) {
      results.push({
        invoice_id: row.stripe_invoice_id,
        cliniko_id: row.cliniko_id,
        tier: row.tier,
        anchor,
        pp_amount: ppFee.amount,
        action: 'would-create',
      });
      continue;
    }

    try {
      await mark(ppKey);
      const xeroInvoice = await xero.createInvoice({
        contactId: row.xero_contact_id,
        lineItems: [{
          description: `Program & Platform — ${row.tier} (${periodStart}${periodEnd ? ` to ${periodEnd}` : ''})`,
          quantity: 1,
          unitAmount: ppFee.amount,
          accountCode: '200',
          taxType: 'EXEMPTOUTPUT',
        }],
        reference: `P&P ${row.tier} ${periodStart}`,
        date: periodStart,
        dueDate: periodStart,
        status: 'AUTHORISED',
      });

      const overpaymentAmount = Number(row.amount) || 0;
      const allocAmount = Math.min(overpaymentAmount, ppFee.amount);
      try {
        await xero.applyOverpayment({
          overpaymentId: row.xero_overpayment_id,
          invoiceId: xeroInvoice.invoiceId,
          amount: allocAmount,
        });
      } catch (err) {
        results.push({
          invoice_id: row.stripe_invoice_id,
          tier: row.tier,
          anchor,
          xero_invoice_id: xeroInvoice.invoiceId,
          action: 'created-but-alloc-failed',
          error: err.message,
        });
        continue;
      }

      await query(
        `UPDATE stripe_payments
         SET pp_invoice_id = $1, pp_amount = $2
         WHERE stripe_event_id = $3`,
        [xeroInvoice.invoiceId, ppFee.amount, row.stripe_event_id]
      );

      results.push({
        invoice_id: row.stripe_invoice_id,
        cliniko_id: row.cliniko_id,
        tier: row.tier,
        anchor,
        pp_amount: ppFee.amount,
        allocated: allocAmount,
        xero_invoice_id: xeroInvoice.invoiceId,
        action: 'created',
      });
    } catch (err) {
      results.push({
        invoice_id: row.stripe_invoice_id,
        action: 'fail-create-invoice',
        error: err.message,
      });
    }
  }

  console.log(`\n${DRY_RUN ? 'Dry-run' : 'Recovery'} complete:`);
  console.table(results.map(r => ({
    invoice_id: r.invoice_id?.slice(-12),
    tier: r.tier?.slice(0, 24),
    anchor: r.anchor,
    pp: r.pp_amount,
    action: r.action,
    error: r.error?.slice(0, 60),
  })));
  await pool.end();
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
