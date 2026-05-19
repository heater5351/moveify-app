// Firebase / Identity Platform client SDK setup.
//
// The token is cached in memory and refreshed automatically by Firebase
// via onIdTokenChanged. Never stored in localStorage — closes the XSS gap
// that motivated this migration.
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onIdTokenChanged,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User as FirebaseUser,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

if (!firebaseConfig.apiKey) {
  console.warn('VITE_FIREBASE_API_KEY not set — Identity Platform login will fail');
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// In-memory token cache, refreshed automatically by Firebase. Synchronous
// readers (e.g. getAuthHeaders) read from this; on initial mount the cache
// is seeded explicitly by the auth-state observer (which awaits getIdToken
// on the loaded user) before any API call is dispatched, so we never need
// a "wait" primitive.
let cachedToken: string | null = null;

onIdTokenChanged(auth, async (user) => {
  if (user) {
    try {
      cachedToken = await user.getIdToken();
    } catch {
      cachedToken = null;
    }
  } else {
    cachedToken = null;
  }
});

export function getCachedToken(): string | null {
  return cachedToken;
}

export function setCachedToken(token: string | null): void {
  cachedToken = token;
}

export function setSessionPersistence(rememberMe: boolean): Promise<void> {
  return setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
}

export { onAuthStateChanged };
export type { FirebaseUser };
