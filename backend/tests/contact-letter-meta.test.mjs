import { describe, it, expect } from 'vitest';
import { contactToLetterMeta, mergeLetterMeta } from '../services/contact-letter-meta.js';

describe('contactToLetterMeta', () => {
  it('maps a directory contact row to the GP letter recipient block', () => {
    const meta = contactToLetterMeta({
      name: 'Patel', organisation: 'Northside Clinic',
      address: '12 Smith St, Newcastle', email: 'reception@northside.example',
    });
    expect(meta).toEqual({
      gpName: 'Patel',
      practiceName: 'Northside Clinic',
      practiceAddress: '12 Smith St, Newcastle',
      practiceEmail: 'reception@northside.example',
    });
  });

  it('returns null when there is no contact (clean fallback)', () => {
    expect(contactToLetterMeta(null)).toBeNull();
    expect(contactToLetterMeta(undefined)).toBeNull();
  });

  it('coalesces missing columns to empty strings', () => {
    expect(contactToLetterMeta({ name: 'Lee' })).toEqual({
      gpName: 'Lee', practiceName: '', practiceAddress: '', practiceEmail: '',
    });
  });
});

describe('mergeLetterMeta', () => {
  const base = {
    gpName: 'Patel', practiceName: 'Northside Clinic',
    practiceAddress: '12 Smith St', practiceEmail: 'reception@northside.example',
  };

  it('uses the directory base when there is no uploaded report', () => {
    expect(mergeLetterMeta(base, null)).toEqual({
      ...base, patientName: '', dob: '',
    });
  });

  it('lets a non-empty uploaded-report field win over the directory base', () => {
    const out = mergeLetterMeta(base, { gpName: 'Singh', practiceEmail: 'admin@south.example' });
    expect(out.gpName).toBe('Singh');
    expect(out.practiceEmail).toBe('admin@south.example');
    // Fields the report didn't supply fall back to the directory base.
    expect(out.practiceName).toBe('Northside Clinic');
    expect(out.practiceAddress).toBe('12 Smith St');
  });

  it('ignores blank/whitespace overlay fields and keeps the base', () => {
    const out = mergeLetterMeta(base, { gpName: '   ', practiceName: '' });
    expect(out.gpName).toBe('Patel');
    expect(out.practiceName).toBe('Northside Clinic');
  });

  it('takes patient name/DOB only from the uploaded report', () => {
    const out = mergeLetterMeta(base, { patientName: 'Jane Doe', dob: '1958-04-02' });
    expect(out.patientName).toBe('Jane Doe');
    expect(out.dob).toBe('1958-04-02');
    // base carries no patient identity, so without a report these stay empty
    expect(mergeLetterMeta(base, null).patientName).toBe('');
  });

  it('handles no base (no directory recipient) by using the report alone', () => {
    const out = mergeLetterMeta(null, { gpName: 'Singh', patientName: 'Jane Doe' });
    expect(out.gpName).toBe('Singh');
    expect(out.practiceName).toBe('');
    expect(out.patientName).toBe('Jane Doe');
  });
});
