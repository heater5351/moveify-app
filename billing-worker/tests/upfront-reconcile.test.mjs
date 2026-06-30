import { describe, it, expect } from 'vitest';

// Locks the upfront agreement-decoupling reconciliation: the PIF/PCL reference
// + price table (the cross-service sync invariant) and the pure decision the
// Tyro ingest uses to match a swipe against a pending expected-payment. No DB /
// Xero I/O — the side-effecting wiring is exercised in staging (see the plan).
const { parseUpfrontRef, upfrontRefCode, upfrontPriceCents } = await import('../lib/upfront-prices.js');
const { decideUpfront } = await import('../jobs/ingest-tyro.js');

describe('upfront-prices table', () => {
  it('maps tier/path → canonical ref code + amount (vault doc figures)', () => {
    expect(upfrontRefCode('T1', 'standard')).toBe('PIF T1');
    expect(upfrontRefCode('T2', 'post_casual')).toBe('PCL T2');
    expect(upfrontPriceCents('T1', 'standard')).toBe(43700);
    expect(upfrontPriceCents('T2', 'standard')).toBe(64600);
    expect(upfrontPriceCents('T3', 'standard')).toBe(81700);
    expect(upfrontPriceCents('T1', 'post_casual')).toBe(29000);
    expect(upfrontPriceCents('T2', 'post_casual')).toBe(51000);
    expect(upfrontPriceCents('T3', 'post_casual')).toBe(69000);
  });

  it('has no upfront option for continuity', () => {
    expect(upfrontRefCode('Independent', 'continuity')).toBeNull();
    expect(upfrontPriceCents('Independent', 'continuity')).toBeNull();
  });

  it('parses references case- and space-tolerantly', () => {
    expect(parseUpfrontRef('PIF T1')).toMatchObject({ prefix: 'PIF', tier: 'T1', refCode: 'PIF T1' });
    expect(parseUpfrontRef('pcl t3')).toMatchObject({ refCode: 'PCL T3' });
    expect(parseUpfrontRef('PIFT2')).toMatchObject({ refCode: 'PIF T2' });
    expect(parseUpfrontRef('INV-1234')).toBeNull();
    expect(parseUpfrontRef('')).toBeNull();
  });
});

describe('decideUpfront', () => {
  const pending = [
    { id: 'exp:1', patient_name: 'Jane Doe', cliniko_id: '101', expected_amount_cents: 43700 },
  ];

  it('non-PIF/PCL reference → none (normal handling)', () => {
    expect(decideUpfront({ reference: 'INV-9', name: 'Jane Doe', amount: 437, pending }).kind).toBe('none');
  });

  it('clean single name + amount match → match', () => {
    const d = decideUpfront({ reference: 'PIF T1', name: 'jane  doe', amount: 437, pending });
    expect(d.kind).toBe('match');
    expect(d.exp.id).toBe('exp:1');
  });

  it('name matches but amount differs → mismatch (flag, never silent-book)', () => {
    const d = decideUpfront({ reference: 'PIF T1', name: 'Jane Doe', amount: 400, pending });
    expect(d.kind).toBe('mismatch');
    expect(d.expectedCents).toBe(43700);
  });

  it('no name match → ambiguous', () => {
    expect(decideUpfront({ reference: 'PIF T1', name: 'Someone Else', amount: 437, pending }).kind).toBe('ambiguous');
  });

  it('multiple same-name pending → ambiguous (manual review)', () => {
    const dupes = [
      { id: 'exp:1', patient_name: 'Jane Doe', cliniko_id: '101', expected_amount_cents: 43700 },
      { id: 'exp:2', patient_name: 'Jane Doe', cliniko_id: '102', expected_amount_cents: 43700 },
    ];
    const d = decideUpfront({ reference: 'PIF T1', name: 'Jane Doe', amount: 437, pending: dupes });
    expect(d.kind).toBe('ambiguous');
    expect(d.candidates).toHaveLength(2);
  });

  it('cardholder ≠ patient: matches on the typed name field, not the card', () => {
    // The name passed in is the typed patient field; a partner paying doesn't break it.
    const d = decideUpfront({ reference: 'PIF T1', name: 'Jane Doe', amount: 437, pending });
    expect(d.kind).toBe('match');
  });
});
