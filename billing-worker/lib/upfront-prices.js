'use strict';

// Upfront (pay-in-full) block pricing for the agreement-decoupling flow, keyed
// `${path}:${tier}`. Used by the expected-payments ledger + the Tyro CSV
// reconciliation amount cross-check.
//
// ⚠ SYNC INVARIANT: these figures are the worker copy of the canonical table in
// backend/lib/agreement-template.js (UPFRONT_PRICES) and the vault doc "Decouple
// Agreement from Payment". Keep all three in lockstep. Like the existing
// "productName must match PP_FEES" invariant, a drift here silently mis-checks
// an upfront amount.
//   PIF = standard block Paid In Full (5% off the 6-week total)
//   PCL = Post-Casual Lump (the full post-casual total, no discount)
const UPFRONT_PRICES_CENTS = {
  'standard:T1': 43700,
  'standard:T2': 64600,
  'standard:T3': 81700,
  'post_casual:T1': 29000,
  'post_casual:T2': 51000,
  'post_casual:T3': 69000,
};

function planKey(tier, path) {
  return `${String(path || '').trim()}:${String(tier || '').trim()}`;
}

// Operator terminal reference: `PIF T1` (standard) / `PCL T2` (post-casual), or
// null if the tier/path has no upfront option.
function upfrontRefCode(tier, path) {
  const prefix = path === 'standard' ? 'PIF' : path === 'post_casual' ? 'PCL' : null;
  if (!prefix || !UPFRONT_PRICES_CENTS[planKey(tier, path)]) return null;
  return `${prefix} ${String(tier).trim()}`;
}

// Expected upfront amount in cents for a tier/path, or null if not offered.
function upfrontPriceCents(tier, path) {
  return UPFRONT_PRICES_CENTS[planKey(tier, path)] || null;
}

// Parses a Tyro reference column into { prefix, tier, refCode } if it matches the
// `PIF T1` / `PCL T2` convention (case- and inner-space-tolerant), else null.
function parseUpfrontRef(reference) {
  const m = String(reference || '').trim().toUpperCase().match(/^(PIF|PCL)\s*(T[123])$/);
  if (!m) return null;
  return { prefix: m[1], tier: m[2], refCode: `${m[1]} ${m[2]}` };
}

// Maps a parsed ref prefix → the block path it implies.
function pathForPrefix(prefix) {
  if (prefix === 'PIF') return 'standard';
  if (prefix === 'PCL') return 'post_casual';
  return null;
}

module.exports = {
  UPFRONT_PRICES_CENTS,
  upfrontRefCode,
  upfrontPriceCents,
  parseUpfrontRef,
  pathForPrefix,
};
