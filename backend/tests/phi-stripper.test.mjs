import { describe, it, expect } from 'vitest';
import { stripPhi } from '../services/phi-stripper.js';

describe('stripPhi', () => {
  it('strips phone numbers', () => {
    const { cleaned, phiDetected } = stripPhi('Call 0412 345 678 for appointment');
    expect(cleaned).toContain('[PHONE]');
    expect(cleaned).not.toContain('0412');
    expect(phiDetected).toBeGreaterThan(0);
  });

  it('strips email addresses', () => {
    const { cleaned } = stripPhi('Email: patient@example.com about results');
    expect(cleaned).toContain('[EMAIL]');
    expect(cleaned).not.toContain('patient@example.com');
  });

  it('strips DOB patterns', () => {
    const { cleaned } = stripPhi('DOB: 15/03/1990, presenting with knee pain');
    expect(cleaned).toContain('[DOB]');
    expect(cleaned).not.toContain('15/03/1990');
  });

  it('strips known patient names', () => {
    const { cleaned, phiDetected } = stripPhi(
      'John Smith presents with right knee pain post ACL reconstruction',
      ['John Smith', 'Jane Doe']
    );
    expect(cleaned).toContain('[PATIENT]');
    expect(cleaned).not.toContain('John');
    expect(cleaned).not.toContain('Smith');
    expect(phiDetected).toBeGreaterThan(0);
  });

  it('preserves clinical content', () => {
    const { cleaned } = stripPhi('Post ACL reconstruction week 6. Pain level 3/10. Knee ROM 120 degrees.');
    expect(cleaned).toContain('ACL reconstruction');
    expect(cleaned).toContain('Pain level 3/10');
    expect(cleaned).toContain('Knee ROM');
  });

  it('handles null/empty input', () => {
    expect(stripPhi('').cleaned).toBe('');
    expect(stripPhi(null).cleaned).toBe('');
  });

  it('strips addresses', () => {
    const { cleaned } = stripPhi('Lives at 42 Smith Street near the clinic');
    expect(cleaned).toContain('[ADDRESS]');
    expect(cleaned).not.toContain('42 Smith Street');
  });
});
