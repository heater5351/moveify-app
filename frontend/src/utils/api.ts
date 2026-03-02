// API utility with retry logic, error handling, and JWT auth
import { API_URL } from '../config';

const TOKEN_KEY = 'moveify_token';
const USER_KEY = 'moveify_user';

// Token management
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
 * Get auth headers for API calls
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
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

      // Handle 401 — clear auth and redirect to login
      if (response.status === 401) {
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
      ...getAuthHeaders(),
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
    const response = await fetch('http://localhost:3000/health', {
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
