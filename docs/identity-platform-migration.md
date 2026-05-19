# Identity Platform Authentication Migration Plan

> **Status (as of 2026-05-19):** Phases 0–3 complete and live in production. Phase 4 cleanup is gated on a 14-day soak — earliest execution **2026-06-02**. Scheduled reminder routine: `trig_014XyQy1KApvhrtiqPZ6SSCU`.

## Context

Moveify's current custom JWT auth has three security gaps flagged during a security audit:
1. No token revocation — stolen JWTs stay valid up to 14 days
2. Tokens stored in `localStorage` (XSS-vulnerable)
3. No MFA option for clinicians

Migrating to **GCP Identity Platform** fixes all three without migrating the PostgreSQL database. Identity Platform handles auth; Cloud SQL keeps all health data. Existing patients don't need to reset passwords because the `importUsers()` API accepts bcrypt hashes directly.

The migration is phased so **no existing session breaks at any point**.

---

## Why Identity Platform (not Firebase Auth)

Identity Platform is GCP's enterprise-grade build of Firebase Auth. The SDKs and Admin APIs are identical — same `firebase` npm package, same `firebase-admin` server package.

The reason we use Identity Platform rather than the free Firebase Auth tier:

- **Pricing.** Free for the first 50,000 MAU. At Moveify's scale this is effectively free for years.
- **Same project.** Lives inside the existing `moveify-app` GCP project alongside Cloud Run + Cloud SQL — no second vendor to add to data flow maps.
- **Enterprise features** available when needed: MFA, SAML/OIDC, blocking functions, anomaly detection.

## Residency tradeoff (acknowledged)

Identity Platform does **not** offer regional pinning for auth records at the project or tenant level (verified against the Tenant REST API reference — no `location` field exists). User auth records (email, bcrypt-imported password hash, UID, last-sign-in metadata) sit on Google's global infrastructure.

**All patient health data continues to live in Cloud SQL in `australia-southeast1`** — exercise programs, completions, check-ins, conditions, notes, etc. Identity Platform only stores authentication credentials, which under the Privacy Act (s 6FA) are access metadata, not "health information".

Action items:
- Privacy officer / legal sign-off on this position before Phase 2 user import
- Add Identity Platform to the data-flow diagram in the security questionnaire as a sub-processor for authentication credentials only
- Update `docs/data-retention-policy.md` to note this scope split

If residency on auth records is later required, the upgrade path is Assured Workloads with the Australia Data Boundary control package — significant cost and project-level org-policy work, deferred until/unless a stakeholder requires it.

---

## Phases Overview

| Phase | What changes | User impact | Status |
|-------|-------------|-------------|--------|
| 0 | GCP setup — enable Identity Platform, service account, env vars | None | ✅ Done |
| 1 | Backend accepts both Identity Platform + legacy JWT | None — existing sessions keep working | ✅ Done |
| 2 | Import users + update frontend login | None — existing passwords still work | ✅ Done (12 prod users imported 2026-05-19) |
| 3 | Update invitation + password flows | None — same UX | ✅ Done |
| 4 (14+ days later) | Remove legacy JWT, clean up | None | ⏳ Earliest 2026-06-02 |

---

## Phase 0 — GCP setup

**Goal:** Enable Identity Platform in the existing `moveify-app` GCP project and prepare credentials for backend + frontend. No code changes yet.

### 0a. Enable Identity Platform

1. GCP console → search "Identity Platform" → **Enable Identity Platform** in the `moveify-app` project. *(Already done.)*
2. Enable the **Email/Password** provider. Leave "Allow passwordless login" off. *(Already done.)*
3. (Optional, Phase 3+) Configure email templates for password reset / verification — use Moveify branding and `EMAIL_FROM` sender (`ryan@moveifyhealth.com`).

Note on data location: Identity Platform has no region setting at the project or tenant level. See "Residency tradeoff" section above.

### 0b. Create service account for backend

1. IAM & Admin → Service Accounts → **Create service account** `identity-platform-admin@moveify-app.iam.gserviceaccount.com`.
2. Grant roles:
   - `roles/firebaseauth.admin` — needed for `admin.auth().importUsers()`, `createUser`, `updateUser`, `generatePasswordResetLink`.
3. Create a JSON key, download it. **Do not commit.** Treat like any other Moveify secret.
4. Store in Secret Manager as `identity_platform_service_account` (or split into the three env vars — see 0d).

### 0c. Generate frontend web config

1. Identity Platform → **Application setup details** → copy the Web API key + auth domain.
2. The frontend uses the standard Firebase SDK (`firebase` npm package). Config shape:
   ```
   apiKey: <Web API key>
   authDomain: moveify-app.firebaseapp.com
   projectId: moveify-app
   ```

### 0d. Add env vars (do not deploy yet)

**Backend (Cloud Run + local `.env`):**
```
FIREBASE_PROJECT_ID=moveify-app
FIREBASE_CLIENT_EMAIL=identity-platform-admin@moveify-app.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```
Use `--env-vars-file` YAML on Cloud Run deploy to preserve `\n` in the private key (same pattern as `GOOGLE_SERVICE_ACCOUNT_KEY`).

**Frontend (Vercel + local `.env` / `.env.production`):**
```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=moveify-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=moveify-app
```

### 0e. Update compliance docs

- Add an entry to `docs/data-retention-policy.md` stating: "Identity Platform stores authentication credentials (email, password hash, UID, last-sign-in metadata) on Google's global infrastructure. All patient health data remains in Cloud SQL `australia-southeast1`. Auth credentials are access metadata, not health information per Privacy Act s 6FA."
- Update the security questionnaire's data-flow section to list Identity Platform as a sub-processor for authentication credentials only.
- Obtain privacy-officer / legal sign-off before Phase 2 user import (when real credentials first leave Australia).

---

## Phase 1 — Backend dual-mode auth

**Goal:** Backend accepts both Identity Platform ID tokens and legacy JWTs simultaneously. Deploy this first; nothing breaks for anyone currently logged in.

### 1a. Add `firebase_uid` column to DB

File: `backend/database/init.js` — add migration:
```js
await db.query(`
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE
`);
```

(Column is named `firebase_uid` because the Admin SDK npm package is `firebase-admin` even when targeting Identity Platform — keeping the column name aligned with the SDK avoids confusion.)

### 1b. Add firebase-admin to backend

File: `backend/package.json` — add `"firebase-admin": "^13.x.x"` to dependencies.

### 1c. Initialize Admin SDK

File: `backend/server.js` — add near the top:
```js
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
```

### 1d. Rewrite `authenticate()` middleware for dual-mode

File: `backend/middleware/auth.js`

```js
const admin = require('firebase-admin');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];

  // Try Identity Platform first
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const user = await db.getOne(
      'SELECT id, role, email, is_admin, firebase_uid FROM users WHERE firebase_uid = $1',
      [decoded.uid]
    );
    if (user) {
      req.user = { id: user.id, role: user.role, email: user.email, is_admin: !!user.is_admin, firebase_uid: user.firebase_uid };
      return next();
    }
  } catch (_) { /* not an IP token, fall through */ }

  // Fall back to legacy JWT (covers existing active sessions)
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: decoded.id, role: decoded.role, email: decoded.email, is_admin: !!decoded.is_admin };
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
  }

  return res.status(401).json({ error: 'Invalid token' });
}
```

**Deploy backend (staging first) after Phase 1. No frontend changes yet.**

---

## Phase 2 — Import users + update frontend login

### 2a. One-time user import script

New file: `backend/scripts/import-identity-platform-users.js`

Run once from local machine with DB access. Reads users with non-null `password_hash`, imports them via Admin SDK with bcrypt hashes, writes `firebase_uid` back:

```js
const admin = require('firebase-admin');
const db = require('../database/db');

admin.initializeApp({ /* same service account config as server.js */ });

async function run() {
  const users = await db.query(
    "SELECT id, email, name, password_hash FROM users WHERE password_hash IS NOT NULL"
  );

  const ipUsers = users.rows.map(u => ({
    uid: `moveify-${u.id}`,
    email: u.email,
    displayName: u.name,
    passwordHash: Buffer.from(u.password_hash),
  }));

  const result = await admin.auth().importUsers(ipUsers, {
    hash: { algorithm: 'BCRYPT' }
  });

  console.log(`Imported ${ipUsers.length - result.errors.length} users`);
  result.errors.forEach(e => console.error(e.index, e.error));

  for (const u of users.rows) {
    await db.query(
      'UPDATE users SET firebase_uid = $1 WHERE id = $2',
      [`moveify-${u.id}`, u.id]
    );
  }
}
run();
```

Run against staging DB first, then production.

### 2b. Add Firebase SDK to frontend

File: `frontend/package.json` — add `"firebase": "^11.x.x"`. (Same package for both Firebase Auth and Identity Platform — Identity Platform just makes the backend talk to a regional store.)

### 2c. Create config module

New file: `frontend/src/lib/firebase.ts`:
```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
```

### 2d. Update token management in `frontend/src/utils/api.ts`

Replace localStorage token management with an in-memory cache updated by `onIdTokenChanged`. Keeps `getAuthHeaders()` **synchronous** — zero changes to existing API call sites:

```ts
import { onIdTokenChanged } from 'firebase/auth';
import { firebaseAuth } from '../lib/firebase';

let _currentIdToken: string | null = null;

export function initTokenRefresh() {
  onIdTokenChanged(firebaseAuth, async (user) => {
    _currentIdToken = user ? await user.getIdToken() : null;
    if (!user) localStorage.removeItem(USER_KEY);
  });
}

export function getToken(): string | null {
  return _currentIdToken;
}

export function clearAuth(): void {
  _currentIdToken = null;
  localStorage.removeItem(USER_KEY);
  firebaseAuth.signOut();
}

export function setToken(_token: string): void {} // no-op during transition
```

Tokens are no longer in `localStorage` — closes the XSS gap.

### 2e. Update `LoginPage.tsx`

Replace `POST /api/auth/login` fetch with SDK:
- Import `signInWithEmailAndPassword`, `setPersistence`, `browserLocalPersistence`, `browserSessionPersistence`
- Set persistence based on `rememberMe` before sign-in
- After sign-in, call `GET /api/auth/me` with the ID token to fetch Postgres user data

```ts
await setPersistence(firebaseAuth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
const idToken = await credential.user.getIdToken();
// fetch /api/auth/me, then onLogin
```

### 2f. Update session restoration in `App.tsx`

```ts
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from './lib/firebase';
import { initTokenRefresh } from './utils/api';

useEffect(() => {
  initTokenRefresh();
  const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
    if (!fbUser) { setIsRestoringSession(false); return; }
    const idToken = await fbUser.getIdToken();
    // fetch /api/auth/me (same logic as current restoreSession)
    setIsRestoringSession(false);
  });
  return unsubscribe;
}, []);
```

**Deploy frontend + backend (staging) after Phase 2. Test login with existing patient credentials before promoting to prod.**

---

## Phase 3 — Invitation and password flows

### 3a. Update `/api/invitations/generate`

File: `backend/routes/invitations.js`

After creating the Postgres user row, create a disabled Identity Platform user:
```js
const ipUser = await admin.auth().createUser({
  uid: `moveify-${patientId}`,
  email,
  displayName: name,
  disabled: true,
});
await client.query(
  'UPDATE users SET firebase_uid = $1 WHERE id = $2',
  [ipUser.uid, patientId]
);
```

### 3b. Update `/api/invitations/set-password`

Replace `bcrypt.hash()` with Admin SDK:
```js
const user = await db.getOne('SELECT id, firebase_uid FROM users WHERE email = $1', [invitation.email]);
await admin.auth().updateUser(user.firebase_uid, { password, disabled: false });
// keep: health_data_consent update (unchanged), drop password_hash write
```

### 3c. Update change-password

File: `backend/routes/auth.js` — `PATCH /change-password`

```js
await admin.auth().updateUser(req.user.firebase_uid, { password: newPassword });
// keep: audit.log, DELETE password_reset_tokens
```

### 3d. Update password reset

```js
const resetLink = await admin.auth().generatePasswordResetLink(email);
await sendPasswordResetEmail(user.email, resetLink); // reuses existing Gmail service
```
Remove: `password_reset_tokens` inserts, `verify-reset-token` route, `reset-password` route.

---

## Phase 4 — Cleanup (14+ days after Phase 2)

1. `backend/middleware/auth.js` — remove `jwt.verify()` fallback and `JWT_SECRET` references
2. `backend/routes/auth.js` — remove forgot-password, verify-reset-token, reset-password routes
3. `backend/routes/invitations.js` — remove `bcrypt` import and `bcrypt.hash()` calls
4. `frontend/src/utils/api.ts` — remove `setToken()` no-op and `TOKEN_KEY` localStorage key
5. `frontend/src/components/modals/ResetPasswordModal.tsx` — remove
6. Eventually: `ALTER TABLE users DROP COLUMN password_hash` (after confirming all users have `firebase_uid`)

---

## Critical Files

| File | Change |
|------|--------|
| `backend/middleware/auth.js` | Dual-mode authenticate() → Phase 4: IP-only |
| `backend/routes/auth.js` | change-password, forgot-password use Admin SDK |
| `backend/routes/invitations.js` | generate + set-password use Admin SDK |
| `backend/database/init.js` | Add `firebase_uid` column migration |
| `backend/server.js` | Admin SDK init |
| `backend/package.json` | Add firebase-admin |
| `frontend/src/utils/api.ts` | Token management via onIdTokenChanged |
| `frontend/src/components/LoginPage.tsx` | signInWithEmailAndPassword |
| `frontend/src/App.tsx` | onAuthStateChanged replaces restoreSession |
| `frontend/src/lib/firebase.ts` | **NEW** — SDK init |
| `frontend/package.json` | Add firebase |
| `backend/scripts/import-identity-platform-users.js` | **NEW** — one-time migration script |
| `docs/data-retention-policy.md` | Note IP residency in `australia-southeast1` |

---

## Testing Strategy

1. Test locally first (local backend + local Postgres + separate dev Identity Platform tenant).
2. Use the `dev` branch — staging backend (`moveify-backend-staging`) + Vercel preview.
3. Run import script against staging DB first, then production.
4. Phase 1 is safe to push to production directly (backend-only, additive).

## Verification Checklist

- [ ] Phase 0: Identity Platform enabled, region confirmed `australia-southeast1`, service account JSON in Secret Manager, frontend config in Vercel
- [ ] Phase 1: Existing patient logs in, existing session token still works after deploy
- [ ] Phase 2: Existing patient logs in with existing password via Identity Platform flow (no password reset)
- [ ] Phase 2: Session restores on page refresh
- [ ] Phase 3: Invite test patient → setup-password flow → login works
- [ ] Phase 3: Change password as clinician → logout → login with new password
- [ ] Phase 3: Forgot password → reset email received → reset → login works
- [ ] Phase 4: After 14 days, no 401s in Cloud Run logs after removing legacy JWT path
