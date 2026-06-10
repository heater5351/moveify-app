import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  // Note: requireAdmin re-checks is_admin in the DB (not the stale token
  // claim), and the backend is CommonJS — Vitest's vi.mock cannot intercept
  // require()d modules, so the DB-backed allow/deny branch can't be unit
  // tested offline. Only the pure role gates are covered here.

  it('denies patient even if is_admin is set', async () => {
    req = { user: { id: 3, role: 'patient', is_admin: true } };
    await requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('denies when no user', async () => {
    req = { user: null };
    await requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
