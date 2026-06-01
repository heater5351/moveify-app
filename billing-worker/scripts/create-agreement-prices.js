'use strict';

// Provisions the Stripe Products + recurring Prices for the service-agreement
// sign-up automation, then prints the STRIPE_PRICE_* env lines to set on the
// worker. Derives the product set from lib/service-catalog.js SUBSCRIPTION_PLANS
// (single source of truth), so it stays in sync with the handler.
//
// Idempotent: finds an existing Product by exact name (reuses it), and reuses an
// existing active recurring Price that matches amount + currency + interval
// rather than creating duplicates. Safe to re-run.
//
// ⚠ AMOUNTS: confirmed against the build plan / Stripe Payment Links Reference,
//   but RE-CONFIRM the exact cents with Ryan before running against LIVE mode.
//
// Usage (TEST mode — get a test key from the Stripe dashboard, test mode):
//   STRIPE_SECRET_KEY=sk_test_xxx node scripts/create-agreement-prices.js
//   STRIPE_SECRET_KEY=sk_test_xxx node scripts/create-agreement-prices.js --dry-run
// Usage (LIVE mode — only after sign-off):
//   STRIPE_SECRET_KEY=sk_live_xxx node scripts/create-agreement-prices.js
//
// The key is read from STRIPE_SECRET_KEY (env only) — never hardcode it.

require('dotenv').config();

const { SUBSCRIPTION_PLANS } = require('../lib/service-catalog');

const DRY_RUN = process.argv.includes('--dry-run');

// Per-plan pricing, keyed by the same `${path}:${tier}` keys as SUBSCRIPTION_PLANS.
// amountCents = AUD cents. interval/intervalCount = Stripe recurring cadence
// (weekly blocks; 4-weekly continuity).
const PLAN_PRICING = {
  // Block standard — weekly
  'standard:T1': { amountCents: 7667,  interval: 'week', intervalCount: 1 },
  'standard:T2': { amountCents: 11333, interval: 'week', intervalCount: 1 },
  'standard:T3': { amountCents: 14333, interval: 'week', intervalCount: 1 },
  // Post-casual — weekly
  'post_casual:T1': { amountCents: 5800,  interval: 'week', intervalCount: 1 },
  'post_casual:T2': { amountCents: 10200, interval: 'week', intervalCount: 1 },
  'post_casual:T3': { amountCents: 13800, interval: 'week', intervalCount: 1 },
  // Continuity — every 4 weeks
  'continuity:Independent':        { amountCents: 14000, interval: 'week', intervalCount: 4 },
  'continuity:Maintain':           { amountCents: 22000, interval: 'week', intervalCount: 4 },
  'continuity:Evolve':             { amountCents: 28500, interval: 'week', intervalCount: 4 },
  'continuity:Elite':              { amountCents: 52000, interval: 'week', intervalCount: 4 },
  'continuity:Remote Weekly':      { amountCents: 20000, interval: 'week', intervalCount: 4 },
  'continuity:Remote Fortnightly': { amountCents: 10000, interval: 'week', intervalCount: 4 },
  'continuity:App-Only':           { amountCents: 4000,  interval: 'week', intervalCount: 4 },
};

const CURRENCY = 'aud';

async function findProductByName(stripe, name) {
  // Stripe product search by exact name (search API). Falls back to a list scan
  // if search is unavailable on the account.
  try {
    const res = await stripe.products.search({ query: `name:'${name.replace(/'/g, "\\'")}' AND active:'true'`, limit: 1 });
    if (res.data[0]) return res.data[0];
  } catch (_) { /* search not enabled — fall through */ }
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.name === name) return p;
  }
  return null;
}

async function findMatchingPrice(stripe, productId, amountCents, interval, intervalCount) {
  for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (
      price.currency === CURRENCY &&
      price.unit_amount === amountCents &&
      price.recurring &&
      price.recurring.interval === interval &&
      (price.recurring.interval_count || 1) === intervalCount
    ) {
      return price;
    }
  }
  return null;
}

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  // --dry-run just lists the planned catalog and needs no key.
  if (!key && !DRY_RUN) {
    console.error('STRIPE_SECRET_KEY is required (use a TEST-mode key first: sk_test_...).');
    process.exit(1);
  }
  const mode = key.startsWith('sk_live_') ? 'LIVE' : 'TEST';
  console.log(`\nStripe mode: ${DRY_RUN ? 'n/a' : mode}${DRY_RUN ? ' (dry-run — no Stripe calls)' : ''}\n`);
  const stripe = DRY_RUN ? null : require('stripe')(key);

  const envLines = [];
  for (const [planKey, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    const pricing = PLAN_PRICING[planKey];
    if (!pricing) {
      console.warn(`⚠ no PLAN_PRICING for ${planKey} — skipping`);
      continue;
    }
    const dollars = (pricing.amountCents / 100).toFixed(2);
    const cadence = pricing.intervalCount === 1 ? 'weekly' : `every ${pricing.intervalCount} weeks`;

    if (DRY_RUN) {
      console.log(`• ${plan.productName.padEnd(40)} $${dollars} ${cadence}  → ${plan.priceEnv}`);
      continue;
    }

    // Find or create the Product (named to match PP_FEES verbatim).
    let product = await findProductByName(stripe, plan.productName);
    if (!product) {
      product = await stripe.products.create({ name: plan.productName });
      console.log(`+ created product "${plan.productName}" (${product.id})`);
    } else {
      console.log(`= reused product   "${plan.productName}" (${product.id})`);
    }

    // Find or create the matching recurring Price.
    let price = await findMatchingPrice(stripe, product.id, pricing.amountCents, pricing.interval, pricing.intervalCount);
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: CURRENCY,
        unit_amount: pricing.amountCents,
        recurring: { interval: pricing.interval, interval_count: pricing.intervalCount },
      });
      console.log(`  + created price $${dollars} ${cadence} (${price.id})`);
    } else {
      console.log(`  = reused price  $${dollars} ${cadence} (${price.id})`);
    }

    envLines.push(`${plan.priceEnv}=${price.id}`);
  }

  if (!DRY_RUN) {
    console.log(`\n# ── Set these on the billing-worker (${mode} mode) ──`);
    console.log(envLines.join('\n'));
    console.log('');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
