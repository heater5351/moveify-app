import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Set JWT_SECRET before importing auth module
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

const { generateToken, authenticate, requireRole } = await import('../middleware/auth.js');

describe('generateToken', () => {
  it('creates a valid JWT with user payload', () => {
    const user = { id: 1, role: 'clinician', email: 'test@test.com', is_admin: true };
    const token = generateToken(user);

    const decoded = jwt.verify(token, 'test-secret-key-for-testing-only');
    expect(decoded.id).toBe(1);
    expect(decoded.role).toBe('clinician');
    expect(decoded.email).toBe('test@test.com');
    expect(decoded.is_admin).toBe(true);
  });

  it('defaults is_admin to false for non-admin users', () => {
    const user = { id: 2, role: 'patient', email: 'p@test.com' };
    const token = generateToken(user);

    const decoded = jwt.verify(token, 'test-secret-key-for-testing-only');
    expect(decoded.is_admin).toBe(false);
  });
});

describe('authenticate middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('returns 401 if no Authorization header', () => {
    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if header does not start with Bearer', () => {
    req.headers.authorization = 'Basic abc123';
    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user and calls next on valid token', () => {
    const token = jwt.sign(
      { id: 1, role: 'clinician', email: 'test@test.com', is_admin: true },
      'test-secret-key-for-testing-only'
    );
    req.headers.authorization = `Bearer ${token}`;

    authenticate(req, res, next);

    expect(req.user).toEqual({ id: 1, role: 'clinician', email: 'test@test.com', is_admin: true });
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 on expired token', () => {
    const token = jwt.sign(
      { id: 1, role: 'clinician', email: 'test@test.com', is_admin: true },
      'test-secret-key-for-testing-only',
      { expiresIn: '0s' }
    );
    req.headers.authorization = `Bearer ${token}`;

    // Small delay to ensure token is expired
    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
  });

  it('returns 401 on invalid token', () => {
    req.headers.authorization = 'Bearer totally-invalid-token';
    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
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
