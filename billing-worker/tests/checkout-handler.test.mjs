import { describe, it, expect } from 'vitest';

// Pure-logic tests for the checkout.session.completed decision helpers. These
// lock the branch that turns a resolved plan into the right Stripe object
// (schedule vs subscription, with the correct iteration/trial counts) and the
// schedule start-date coercion — without touching Stripe or Postgres. The
// end-to-end webhook wiring is verified in Stripe test mode (see the plan).
const { planToStripeAction, scheduleStartFrom } = await import('../jobs/stripe-handler.js');
const { lookupPlan } = await import('../lib/service-catalog.js');

describe('planToStripeAction', () => {
  it('standard blocks → schedule, 6 iterations, no trial', () => {
    for (const tier of ['T1', 'T2', 'T3']) {
      expect(planToStripeAction(lookupPlan(tier, 'standard'))).toEqual({ kind: 'schedule', iterations: 6, trialIterations: 0 });
    }
  });

  it('post-casual → schedule, 5 iterations, 1 trial week', () => {
    for (const tier of ['T1', 'T2', 'T3']) {
      expect(planToStripeAction(lookupPlan(tier, 'post_casual'))).toEqual({ kind: 'schedule', iterations: 5, trialIterations: 1 });
    }
  });

  it('continuity → plain subscription', () => {
    for (const tier of ['Independent', 'Maintain', 'Evolve', 'Elite', 'Remote Weekly', 'Remote Fortnightly', 'App-Only']) {
      expect(planToStripeAction(lookupPlan(tier, 'continuity'))).toEqual({ kind: 'subscription' });
    }
  });

  it('null plan → null (caller flags + aborts)', () => {
    expect(planToStripeAction(null)).toBeNull();
  });
});

describe('scheduleStartFrom', () => {
  it("returns 'now' when no start date", () => {
    expect(scheduleStartFrom(null)).toBe('now');
    expect(scheduleStartFrom('')).toBe('now');
  });

  it("returns 'now' for past/today dates", () => {
    expect(scheduleStartFrom('2020-01-01')).toBe('now');
  });

  it('returns a future unix timestamp for future dates', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const out = scheduleStartFrom(future);
    expect(typeof out).toBe('number');
    expect(out).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("returns 'now' for unparseable input", () => {
    expect(scheduleStartFrom('not-a-date')).toBe('now');
  });
});
