import { describe, it, expect, vi, beforeEach } from 'vitest';

// Identity Platform disabled in tests — authenticate() rejects everything
// that isn't a verifiable IP ID token, which is all we can assert offline.
const { authenticate, requireRole } = await import('../middleware/auth.js');

describe('authenticate middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('returns 401 if no Authorization header', async () => {
    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if header does not start with Bearer', async () => {
    req.headers.authorization = 'Basic abc123';
    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 on a token that is not an Identity Platform ID token', async () => {
    req.headers.authorization = 'Bearer totally-invalid-token';
    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRole middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: null };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('returns 401 if no user on request', () => {
    const middleware = requireRole('clinician');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if user role is not allowed', () => {
    req.user = { role: 'patient' };
    const middleware = requireRole('clinician');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next if user role is allowed', () => {
    req.user = { role: 'clinician' };
    const middleware = requireRole('clinician');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('accepts multiple allowed roles', () => {
    req.user = { role: 'patient' };
    const middleware = requireRole('clinician', 'patient');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
