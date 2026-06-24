import { describe, it, expect } from 'vitest';

// Security guard: a non-numeric clinikoId must be rejected BEFORE it reaches the
// Stripe customer-search interpolation in findOrCreateCustomer, so a crafted
// value can't alter the search and mis-link a payment method to the wrong
// patient. Tested on the pure guard directly — this never calls getStripe(), so
// the suite can no longer create a LIVE customer (it did once: cus_UlL1jy…).
const { assertNumericClinikoId } = await import('../services/stripe.js');

describe('assertNumericClinikoId guard', () => {
  for (const bad of ["123' OR metadata['x']:'", 'abc', '1 2', '', '12;34', "'", null, undefined]) {
    it(`rejects non-numeric clinikoId: ${JSON.stringify(bad)}`, () => {
      expect(() => assertNumericClinikoId(bad)).toThrow(/Invalid clinikoId/);
    });
  }

  it('accepts a numeric clinikoId and returns it as a string', () => {
    expect(assertNumericClinikoId('123456')).toBe('123456');
    expect(assertNumericClinikoId(123456)).toBe('123456');
  });
});
