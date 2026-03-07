import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set JWT_SECRET before importing (ownership imports auth which checks this)
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

const { requireSelf, requirePatientAccess, requireAdmin } = await import('../middleware/ownership.js');

describe('requireSelf', () => {
  let req, res, next;

  beforeEach(() => {
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('calls next when user ID matches param', () => {
    req = { user: { id: 5 }, params: { patientId: '5' } };
    requireSelf('patientId')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user ID does not match', () => {
    req = { user: { id: 5 }, params: { patientId: '6' } };
    requireSelf('patientId')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requirePatientAccess', () => {
  let req, res, next;

  beforeEach(() => {
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('allows clinician to access any patient', () => {
    req = { user: { id: 1, role: 'clinician' }, params: { patientId: '99' } };
    requirePatientAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows patient to access own data', () => {
    req = { user: { id: 5, role: 'patient' }, params: { patientId: '5' } };
    requirePatientAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('denies patient accessing another patient', () => {
    req = { user: { id: 5, role: 'patient' }, params: { patientId: '6' } };
    requirePatientAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 400 for invalid patient ID', () => {
    req = { user: { id: 1, role: 'clinician' }, params: { patientId: 'abc' } };
    requirePatientAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('requireAdmin', () => {
  let req, res, next;

  beforeEach(() => {
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('allows admin clinician', () => {
    req = { user: { id: 1, role: 'clinician', is_admin: true } };
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('denies non-admin clinician', () => {
    req = { user: { id: 2, role: 'clinician', is_admin: false } };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('denies patient even if is_admin is set', () => {
    req = { user: { id: 3, role: 'patient', is_admin: true } };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('denies when no user', () => {
    req = { user: null };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
