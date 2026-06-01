// API utility with retry logic, error handling, and Identity Platform auth.
// Token lives in memory only (Firebase SDK caches it via onIdTokenChanged).
import { API_URL } from '../config';
import { auth, getCachedToken, setCachedToken } from '../lib/firebase';
import { signOut } from 'firebase/auth';

const USER_KEY = 'moveify_user';
const LEGACY_TOKEN_KEY = 'moveify_token';

// One-time defensive cleanup of the pre-Identity-Platform JWT entry.
// Harmless if absent; closes the XSS surface for users carrying a stale
// orphaned token from a pre-cutover session.
try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* SSR / restricted */ }

// Token management — backed by Firebase in-memory cache. localStorage no
// longer holds the token (closes XSS gap that motivated the migration).
export function getToken(): string | null {
  return getCachedToken();
}

export function clearAuth(): void {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  // Fire-and-forget; if signOut races with redirect that's fine
  void signOut(auth).catch(() => { /* already signed out */ });
}

export function getStoredUser(): { id: number; email: string; role: string; name: string } | null {
  try {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: { id: number; email: string; role: string; name: string }): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Get auth headers for API calls.
 *
 * Mints the token at call time via Firebase `getIdToken()`, which returns the
 * in-memory token instantly if still valid and only hits the network when it
 * has expired (or is within ~5 min of expiry). This is the fix for "Token
 * expired" bounces: the old synchronous cache only updated on
 * `onIdTokenChanged`, which does not fire while the tab is backgrounded or the
 * machine is asleep — so a stale, expired token was shipped on the next call.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const user = auth.currentUser;
  if (user) {
    try {
      headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    } catch {
      /* signed out or offline — send unauthenticated, backend will 401 */
    }
  } else {
    // Brief window on cold load before currentUser is populated: fall back to
    // whatever the auth-state observer last seeded into the cache.
    const cached = getCachedToken();
    if (cached) headers['Authorization'] = `Bearer ${cached}`;
  }
  return headers;
}

/**
 * Force a token refresh (network round-trip) and update the cache. Used by the
 * one-shot 401 retry below to recover from a token the backend rejects.
 */
async function forceRefreshToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken(true);
    setCachedToken(token);
    return token;
  } catch {
    return null;
  }
}

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Enhanced fetch with automatic retry on failure
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 30000,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;
  let triedTokenRefresh = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 — try one forced token refresh before giving up. Covers the
      // edge cases the call-time mint can't (clock skew, mid-flight expiry,
      // revoked-then-reissued token). Only clear auth + redirect if the fresh
      // token is also rejected.
      if (response.status === 401) {
        if (!triedTokenRefresh) {
          triedTokenRefresh = true;
          const fresh = await forceRefreshToken();
          if (fresh) {
            fetchOptions.headers = {
              ...(fetchOptions.headers as Record<string, string> | undefined),
              Authorization: `Bearer ${fresh}`,
            };
            continue; // retry immediately with the fresh token
          }
        }
        clearAuth();
        window.location.href = '/';
        return response;
      }

      // Don't retry on client errors (4xx), only server errors (5xx) and network errors
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      console.warn(`Attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, lastError.message);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Check if it's a timeout or network error
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`Attempt ${attempt + 1}/${retries + 1} timed out for ${url}`);
      } else {
        console.warn(`Attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, lastError.message);
      }
    }

    // Don't delay after the last attempt
    if (attempt < retries) {
      // Exponential backoff
      const delay = retryDelay * Math.pow(2, attempt);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  throw new Error(
    `Failed to fetch ${url} after ${retries + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Wrapper for API calls with automatic retry and JSON parsing
 */
export async function apiCall<T = unknown>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;

  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      ...(await getAuthHeaders()),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || errorData.error?.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Check if backend server is available
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL.replace(/\/api$/, '')}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for server to be ready (useful after crash recovery)
 */
export async function waitForServer(maxWaitTime: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds

  while (Date.now() - startTime < maxWaitTime) {
    const isHealthy = await checkServerHealth();
    if (isHealthy) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  return false;
}

export { API_URL };
