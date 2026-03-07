import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getToken, setToken, clearAuth, getAuthHeaders, getStoredUser, setStoredUser } from './api';

// Mock localStorage
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

describe('Token management', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('getToken returns null when no token stored', () => {
    expect(getToken()).toBeNull();
  });

  it('setToken stores and getToken retrieves', () => {
    setToken('abc123');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('moveify_token', 'abc123');
    expect(getToken()).toBe('abc123');
  });

  it('clearAuth removes token and user', () => {
    setToken('abc123');
    clearAuth();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('moveify_token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('moveify_user');
  });
});

describe('getAuthHeaders', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('includes Content-Type header', () => {
    const headers = getAuthHeaders();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes Authorization when token exists', () => {
    setToken('my-jwt');
    const headers = getAuthHeaders();
    expect(headers['Authorization']).toBe('Bearer my-jwt');
  });

  it('omits Authorization when no token', () => {
    const headers = getAuthHeaders();
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
