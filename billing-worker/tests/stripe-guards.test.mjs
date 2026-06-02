import { describe, it, expect } from 'vitest';

// Security guard: findOrCreateCustomer must reject a non-numeric clinikoId
// BEFORE it reaches the Stripe customer-search interpolation, so a crafted value
// can't alter the search and mis-link a payment method to the wrong patient.
// The validation runs before getStripe(), so this needs no Stripe/secret access.
const { findOrCreateCustomer } = await import('../services/stripe.js');

describe('findOrCreateCustomer clinikoId guard', () => {
  for (const bad of ["123' OR metadata['x']:'", "abc", "1 2", "", "12;34", "'"]) {
    it(`rejects non-numeric clinikoId: ${JSON.stringify(bad)}`, async () => {
      await expect(findOrCreateCustomer({ clinikoId: bad })).rejects.toThrow(/Invalid clinikoId/);
    });
  }

  it('rejects null/undefined clinikoId', async () => {
    await expect(findOrCreateCustomer({})).rejects.toThrow(/Invalid clinikoId/);
    await expect(findOrCreateCustomer({ clinikoId: null })).rejects.toThrow(/Invalid clinikoId/);
  });

  // A purely numeric id passes the guard and proceeds to Stripe (which then fails
  // for lack of a real client/secret in this env) — i.e. NOT the guard error.
  it('accepts a numeric clinikoId (passes the guard)', async () => {
    await expect(findOrCreateCustomer({ clinikoId: '123456' })).rejects.not.toThrow(/Invalid clinikoId/);
  });
});
