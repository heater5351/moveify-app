import { describe, it, expect } from 'vitest';

const {
  buildNdisAgreement,
  isValidLineItem,
  NDIS_RATE_CAP_CENTS,
  MANAGEMENT_TYPES,
  NDIS_LINE_ITEMS,
} = await import('../lib/ndis-agreement-content.js');
const { renderAgreementPdf } = await import('../services/agreement-pdf.js');

const validDetails = {
  ndisNumber: '430000000',
  planStart: '2026-07-01',
  planEnd: '2027-06-30',
  lineItem: '15_200_0126_1_3',
  rateCents: 16699,
  managementType: 'plan_managed',
  delivery: 'In clinic',
  frequency: '1 × 60 min / week',
  planManager: { name: 'Plan Co', contact: 'invoices@planco.example' },
  goals: ['Improve functional capacity', 'Increase mobility'],
};

describe('NDIS line items & caps', () => {
  it('recognises the two EP line items and nothing else', () => {
    expect(isValidLineItem('15_200_0126_1_3')).toBe(true);
    expect(isValidLineItem('12_027_0128_3_3')).toBe(true);
    expect(isValidLineItem('nope')).toBe(false);
    expect(Object.keys(NDIS_LINE_ITEMS)).toHaveLength(2);
  });

  it('caps the rate at $166.99/hr', () => {
    expect(NDIS_RATE_CAP_CENTS).toBe(16699);
  });

  it('excludes NDIA-managed from accepted management types', () => {
    expect(MANAGEMENT_TYPES).toEqual(['self_managed', 'plan_managed']);
    expect(MANAGEMENT_TYPES).not.toContain('ndia_managed');
  });
});

describe('buildNdisAgreement', () => {
  it('returns null for invalid line item / management type', () => {
    expect(buildNdisAgreement({ details: { ...validDetails, lineItem: 'bad' } })).toBeNull();
    expect(buildNdisAgreement({ details: { ...validDetails, managementType: 'ndia_managed' } })).toBeNull();
    expect(buildNdisAgreement({ details: null })).toBeNull();
  });

  it('builds the same structured shape as the private builder (no Part B)', () => {
    const a = buildNdisAgreement({ details: validDetails, patientName: 'Jane Doe', patientDob: '1990-01-01' });
    expect(a.kind).toBe('ndis');
    expect(a.parts).toHaveLength(1); // no Part B / DDRSA
    expect(a.docTitle).toMatch(/NDIS/);
    expect(a.feesSummary).toMatch(/GST-free/);
  });

  it('always includes the 7-clear-day cancellation rule and the Code of Conduct', () => {
    const a = buildNdisAgreement({ details: validDetails, patientName: 'Jane Doe' });
    const text = JSON.stringify(a.parts[0].sections);
    expect(text).toMatch(/7 clear days/);
    expect(text).toMatch(/up to 100%/);
    expect(text).toMatch(/NDIS Code of Conduct/);
    expect(text).toMatch(/GST-free/);
  });

  it('lists all 8 Code of Conduct elements (incl. sexual misconduct + fair pricing)', () => {
    const a = buildNdisAgreement({ details: validDetails });
    const coc = a.parts[0].sections.find((s) => /Code of Conduct/.test(s.heading));
    expect(coc.bullets).toHaveLength(8);
    const text = JSON.stringify(coc.bullets);
    expect(text).toMatch(/sexual misconduct/);
    expect(text).toMatch(/fair prices/);
  });

  it('covers travel + non-face-to-face supports per the toggles', () => {
    const clinic = buildNdisAgreement({ details: { ...validDetails, travelApplicable: false, nonFaceToFace: true } });
    const clinicText = JSON.stringify(clinic.parts[0].sections);
    expect(clinicText).toMatch(/no provider travel is charged/);
    expect(clinicText).toMatch(/Progress and outcome report writing/);
    expect(clinicText).toMatch(/non-face-to-face option/);

    const mobile = buildNdisAgreement({ details: { ...validDetails, travelApplicable: true, nonFaceToFace: false } });
    const mobileText = JSON.stringify(mobile.parts[0].sections);
    expect(mobileText).toMatch(/\$0\.99 per kilometre/);
    expect(mobileText).toMatch(/50% of the hourly support rate/);
    expect(mobileText).toMatch(/not separately charged/);
  });

  it('numbers clauses sequentially after the participant header', () => {
    const a = buildNdisAgreement({ details: validDetails });
    expect(a.parts[0].sections[0].heading).toBe('Participant & Plan');
    expect(a.parts[0].sections[1].heading).toMatch(/^1\. /);
    expect(a.parts[0].sections[2].heading).toMatch(/^2\. /);
  });

  it('renders the matching management-type payment clause only', () => {
    const paymentClause = (a) => JSON.stringify(a.parts[0].sections.find((s) => /Payment & claiming/.test(s.heading)));

    const planManaged = paymentClause(buildNdisAgreement({ details: validDetails }));
    expect(planManaged).toMatch(/invoice the participant’s plan manager/);

    const selfManaged = paymentClause(buildNdisAgreement({
      details: { ...validDetails, managementType: 'self_managed', planManager: undefined },
    }));
    expect(selfManaged).toMatch(/invoice the participant directly/);
    expect(selfManaged).not.toMatch(/plan manager/);
  });
});

describe('renderAgreementPdf (NDIS)', () => {
  it('produces a valid PDF from a pre-built NDIS agreement', async () => {
    const agreement = buildNdisAgreement({ details: validDetails, patientName: 'Jane Doe', patientDob: '1990-01-01' });
    const buf = await renderAgreementPdf({
      agreement,
      patientName: 'Jane Doe',
      signedName: 'Jane Doe',
      signedAt: new Date().toISOString(),
      signedIp: '1.2.3.4',
      signedCapacity: 'plan nominee',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });
});
