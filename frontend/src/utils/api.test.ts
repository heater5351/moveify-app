import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Firebase token cache before importing the module under test.
vi.mock('../lib/firebase', () => ({
  auth: {},
  getCachedToken: vi.fn(),
  setCachedToken: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(() => Promise.resolve()),
}));

import { getToken, clearAuth, getAuthHeaders, getStoredUser, setStoredUser } from './api';
import { getCachedToken } from '../lib/firebase';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('Token management (Identity Platform)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('getToken returns null when Firebase has no cached token', () => {
    vi.mocked(getCachedToken).mockReturnValue(null);
    expect(getToken()).toBeNull();
  });

  it('getToken returns the cached Firebase token', () => {
    vi.mocked(getCachedToken).mockReturnValue('ip-token-abc');
    expect(getToken()).toBe('ip-token-abc');
  });

  it('clearAuth removes stored user from localStorage', () => {
    localStorage.setItem('moveify_user', 'x');
    clearAuth();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('moveify_user');
  });
});

describe('getAuthHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // auth.currentUser is undefined in the mock, so getAuthHeaders falls back to
  // the cached token — which is what these assertions exercise.
  it('includes Content-Type header', async () => {
    vi.mocked(getCachedToken).mockReturnValue(null);
    const headers = await getAuthHeaders();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes Authorization when a token is cached', async () => {
    vi.mocked(getCachedToken).mockReturnValue('my-ip-token');
    const headers = await getAuthHeaders();
    expect(headers['Authorization']).toBe('Bearer my-ip-token');
  });

  it('omits Authorization when no token', async () => {
    vi.mocked(getCachedToken).mockReturnValue(null);
    const headers = await getAuthHeaders();
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('User storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('getStoredUser returns null when empty', () => {
    expect(getStoredUser()).toBeNull();
  });

  it('setStoredUser and getStoredUser round-trip', () => {
    const user = { id: 1, email: 'test@test.com', role: 'clinician', name: 'Test' };
    setStoredUser(user);
    expect(getStoredUser()).toEqual(user);
  });
});
