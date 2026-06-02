import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Locks the sign-up automation's plan catalog against the P&P fee/entitlement
// catalog. The checkout.session.completed handler resolves a plan from
// { tier, path }, builds a schedule/subscription off the named Stripe Price,
// and the downstream invoice.payment_succeeded path resolves the tier back from
// the Stripe PRODUCT NAME. If a plan's productName drifts from a PP_FEES key,
// P&P billing + entitlements silently break — these tests are the guard.
const { SUBSCRIPTION_PLANS, SUBSCRIPTION_PATHS, lookupPlan, getPlanPriceId } =
  await import('../lib/service-catalog.js');
const { PP_FEES } = await import('../lib/rates.js');

describe('SUBSCRIPTION_PLANS ↔ PP_FEES invariant', () => {
  it('every plan productName matches a PP_FEES key verbatim', () => {
    for (const [key, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
      expect(PP_FEES[plan.productName], `${key} → "${plan.productName}" missing from PP_FEES`).toBeDefined();
    }
  });

  it('uses only known paths', () => {
    for (const key of Object.keys(SUBSCRIPTION_PLANS)) {
      const path = key.split(':')[0];
      expect(SUBSCRIPTION_PATHS).toContain(path);
    }
  });
});

describe('plan shapes', () => {
  it('standard blocks are 6-iteration schedules with no trial', () => {
    for (const tier of ['T1', 'T2', 'T3']) {
      const plan = lookupPlan(tier, 'standard');
      expect(plan.shape).toBe('block');
      expect(plan.iterations).toBe(6);
      expect(plan.trialIterations).toBeUndefined();
    }
  });

  it('post-casual blocks are 1 trial week + 5 debits', () => {
    for (const tier of ['T1', 'T2', 'T3']) {
      const plan = lookupPlan(tier, 'post_casual');
      expect(plan.shape).toBe('post_casual');
      expect(plan.trialIterations).toBe(1);
      expect(plan.iterations).toBe(5);
    }
  });

  it('continuity tiers are plain rolling subscriptions', () => {
    for (const tier of ['Independent', 'Maintain', 'Evolve', 'Elite', 'Remote Weekly', 'Remote Fortnightly', 'App-Only']) {
      const plan = lookupPlan(tier, 'continuity');
      expect(plan.shape).toBe('continuity');
    }
  });
});

describe('lookupPlan', () => {
  it('returns null for unknown tier/path combinations', () => {
    expect(lookupPlan('T1', 'continuity')).toBeNull();
    expect(lookupPlan('Independent', 'standard')).toBeNull();
    expect(lookupPlan('T9', 'standard')).toBeNull();
    expect(lookupPlan('', '')).toBeNull();
  });
});

describe('getPlanPriceId', () => {
  const ENV = 'STRIPE_PRICE_T2_STANDARD';
  let saved;
  beforeEach(() => { saved = process.env[ENV]; });
  afterEach(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved; });

  it('reads the Stripe Price id from the plan-named env var', () => {
    process.env[ENV] = 'price_test_123';
    expect(getPlanPriceId(lookupPlan('T2', 'standard'))).toBe('price_test_123');
  });

  it('returns null when the env var is unset (config gap, not a crash)', () => {
    delete process.env[ENV];
    expect(getPlanPriceId(lookupPlan('T2', 'standard'))).toBeNull();
  });

  it('returns null for a null plan', () => {
    expect(getPlanPriceId(null)).toBeNull();
  });
});
