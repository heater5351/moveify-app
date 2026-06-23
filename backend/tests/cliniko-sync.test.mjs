import { describe, it, expect } from 'vitest';

// buildPatientFields is the single source of truth for mapping a Cliniko patient
// onto a Moveify user row — used by BOTH the manual per-patient sync and the
// scheduled auto-sync job. Testing it here guarantees the security-critical
// property (email is never part of the update) and the field mapping for both
// paths. (This codebase's tests deliberately cover pure logic; the job's IO is
// verified end-to-end on staging — see the plan's verification section.)
const { buildPatientFields } = await import('../services/cliniko-sync.js');

const clinikoPatient = (overrides = {}) => ({
  id: '100',
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane@cliniko.example', // must NEVER be written to Moveify
  date_of_birth: '1990-05-01',
  sex: 'Female',
  patient_phone_numbers: [{ number: '0400111222' }],
  address_1: '1 Main St',
  city: 'Sydney',
  state: 'NSW',
  post_code: '2000',
  // PMS-enrichment fields Cliniko owns (see buildPatientFields)
  title: 'Ms',
  preferred_first_name: 'Janey',
  occupation: 'Teacher',
  medicare: '1234567890',
  referral_source: 'GP referral',
  dva: 'DVA123',
  ...overrides,
});

describe('buildPatientFields', () => {
  it('maps Cliniko fields and joins the address parts', () => {
    expect(buildPatientFields(clinikoPatient())).toEqual({
      name: 'Jane Doe',
      dob: '1990-05-01',
      sex: 'Female',
      phone: '0400111222',
      address: '1 Main St, Sydney, NSW, 2000',
      title: 'Ms',
      preferredName: 'Janey',
      occupation: 'Teacher',
      medicareNumber: '1234567890',
      referralSource: 'GP referral',
      dvaNumber: 'DVA123',
    });
  });

  it('never includes email (the Moveify login credential)', () => {
    const f = buildPatientFields(clinikoPatient());
    expect(Object.keys(f)).not.toContain('email');
    expect(Object.values(f)).not.toContain('jane@cliniko.example');
  });

  it('returns null for missing optional fields (so COALESCE preserves existing data)', () => {
    expect(buildPatientFields({ first_name: 'No', last_name: 'Data' })).toEqual({
      name: 'No Data',
      dob: null,
      sex: null,
      phone: null,
      address: null,
      title: null,
      preferredName: null,
      occupation: null,
      medicareNumber: null,
      referralSource: null,
      dvaNumber: null,
    });
  });

  it('takes the first phone number when several are present', () => {
    const f = buildPatientFields(
      clinikoPatient({ patient_phone_numbers: [{ number: '0411000000' }, { number: '0422000000' }] })
    );
    expect(f.phone).toBe('0411000000');
  });
});
