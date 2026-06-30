import { describe, it, expect } from 'vitest';

// Pure-logic tests for the service-agreement template + PDF renderer. The route
// IO (token mint/validate/sign, Cliniko upload, worker call) is verified
// end-to-end in Stripe test mode on staging — see the plan. Here we lock the
// tier-label catalog (which the sign page renders) and that a valid PDF is
// produced for the signed-agreement record.
const { tierLabel, TIER_LABELS, VALID_PATHS, PART_A_PARAGRAPHS, AGREEMENT_VERSION, upfrontPrice, upfrontRefCode } =
  await import('../lib/agreement-template.js');
const { renderAgreementPdf } = await import('../services/agreement-pdf.js');
const { buildAgreement } = await import('../lib/agreement-content.js');

describe('tierLabel', () => {
  it('labels every block + post-casual tier the mint modal can select', () => {
    for (const path of ['standard', 'post_casual']) {
      for (const tier of ['T1', 'T2', 'T3']) {
        expect(tierLabel(tier, path), `${tier}/${path}`).toBeTruthy();
      }
    }
  });

  it('labels every continuity tier', () => {
    for (const tier of ['Independent', 'Maintain', 'Evolve', 'Elite', 'Remote Weekly', 'Remote Fortnightly', 'App-Only']) {
      expect(tierLabel(tier, 'continuity'), tier).toBeTruthy();
    }
  });

  it('returns null for unknown combinations', () => {
    expect(tierLabel('T1', 'continuity')).toBeNull();
    expect(tierLabel('Independent', 'standard')).toBeNull();
    expect(tierLabel('', '')).toBeNull();
  });

  it('only uses recognised paths in its keys', () => {
    for (const key of Object.keys(TIER_LABELS)) {
      expect(VALID_PATHS).toContain(key.split(':')[0]);
    }
  });
});

describe('Part A copy', () => {
  it('has a version string and non-empty paragraphs', () => {
    expect(AGREEMENT_VERSION).toMatch(/\S/);
    expect(PART_A_PARAGRAPHS.length).toBeGreaterThan(0);
    expect(PART_A_PARAGRAPHS.every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
  });
});

describe('upfront pricing (must match billing-worker/lib/upfront-prices.js)', () => {
  it('maps block tier/path → canonical ref code + cents (vault doc figures)', () => {
    expect(upfrontRefCode('T1', 'standard')).toBe('PIF T1');
    expect(upfrontRefCode('T3', 'post_casual')).toBe('PCL T3');
    expect(upfrontPrice('T1', 'standard')).toBe(43700);
    expect(upfrontPrice('T2', 'standard')).toBe(64600);
    expect(upfrontPrice('T3', 'standard')).toBe(81700);
    expect(upfrontPrice('T1', 'post_casual')).toBe(29000);
    expect(upfrontPrice('T2', 'post_casual')).toBe(51000);
    expect(upfrontPrice('T3', 'post_casual')).toBe(69000);
  });

  it('offers no upfront option for continuity', () => {
    expect(upfrontPrice('Independent', 'continuity')).toBeNull();
    expect(upfrontRefCode('Independent', 'continuity')).toBeNull();
  });
});

describe('buildAgreement payment method', () => {
  it('DD keeps Part B (DDRSA); upfront drops it and uses the lump fee summary', () => {
    const dd = buildAgreement({ tier: 'T1', path: 'standard', paymentMethod: 'dd' });
    const up = buildAgreement({ tier: 'T1', path: 'standard', paymentMethod: 'upfront' });
    expect(dd.parts.map((p) => p.key)).toEqual(['A', 'B']);
    expect(up.parts.map((p) => p.key)).toEqual(['A']);
    expect(up.paymentMethod).toBe('upfront');
    expect(up.feesSummary).toBe('$437 paid in full upfront');
  });

  it('upfront on continuity falls back to DD (no lump price)', () => {
    const cont = buildAgreement({ tier: 'Independent', path: 'continuity', paymentMethod: 'upfront' });
    expect(cont.paymentMethod).toBe('dd');
    expect(cont.parts.map((p) => p.key)).toEqual(['A', 'B']);
  });
});

describe('renderAgreementPdf', () => {
  it('produces a non-empty PDF buffer', async () => {
    const buf = await renderAgreementPdf({
      patientName: 'Test Patient', tier: 'T2', path: 'standard', startDate: '2026-06-15',
      signedName: 'Test Patient', signedAt: new Date().toISOString(), signedIp: '1.2.3.4',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });
});
