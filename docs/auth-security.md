# Auth & Security

## Authentication (GCP Identity Platform)

Auth was migrated from custom JWTs to **GCP Identity Platform** (all phases complete — Phase 4 legacy-JWT removal landed 2026-06-10). See `docs/identity-platform-migration.md`. The PostgreSQL `users` table still holds all profile/role data; Identity Platform only holds credentials. Each user row links to its IP account via the `firebase_uid` column (`moveify-<id>`).

1. **Login:** client-side `signInWithEmailAndPassword` via the Firebase SDK (`frontend/src/lib/firebase.ts`). On success the app calls `GET /api/auth/me` with the ID token to load the Postgres user. There is no `POST /api/auth/login` anymore. The login field accepts an **email or a login name** — `toLoginIdentifier()` (`config.ts`) maps a bare login name to its synthetic account email before the SDK call (see "Shared-email login" below).
2. **Token format:** Identity Platform **ID token** (RS256, ~1 hour expiry). The Firebase SDK refreshes it automatically using a long-lived refresh token. **"Remember me"** chooses persistence: ticked → `browserLocalPersistence` (refresh token survives browser close, effectively indefinite until sign-out/revocation); unticked → `browserSessionPersistence` (dies when the tab closes). The 1-hour figure is the ID-token lifetime, not the session length.
3. **Token storage:** the ID token lives **in memory only** (Firebase SDK + a cache in `firebase.ts`), never in `localStorage` — this closed the XSS gap that motivated the migration. `localStorage` holds only `moveify_user` (non-sensitive profile). A stale `moveify_token` key from the pre-migration era is defensively cleared on load.
4. **Attaching auth:** `getAuthHeaders()` in `utils/api.ts` is **async** — it mints the token at call time via `user.getIdToken()`, which returns the in-memory token instantly when valid and only hits the network when expired/near-expiry. Always `await getAuthHeaders()`. (A `focus`/`visibilitychange`/`online` listener in `firebase.ts` also re-warms the cache, since the SDK only auto-refreshes while the tab is foregrounded.)
5. **401 handling:** `fetchWithRetry` first attempts one forced token refresh (`getIdToken(true)`) and retries the request; only if the fresh token is also rejected does it `clearAuth()` (sign out + clear `moveify_user`) and redirect to login.
6. **Session restoration:** `App.tsx` uses `onAuthStateChanged` — on load, if the SDK restores a user, it fetches `GET /api/auth/me` and rehydrates without re-login.
7. **Invitation:** clinician generates invite → creates Postgres user row + a disabled IP account → patient sets password via `/setup-password` (Admin SDK `updateUser`, enables the account).
8. **Password reset:** Admin SDK `generatePasswordResetLink` → emailed via the existing Gmail service. The forgot-password field also accepts a login name (resolves to the synthetic account, delivers the link to the real contact email).
9. **Backend verification:** `authenticate` verifies IP ID tokens (RS256) via `firebase-admin` only. The legacy HS256 fallback, `POST /api/auth/login`, `generateToken`, and the `JWT_SECRET` requirement were all removed in Phase 4 (2026-06-10). The email→user fallback resolves **only on an exact single match** (shared emails fail closed; synthetic login-name accounts always carry `firebase_uid` so never reach it).

## Shared-email login (spouses on one email)

Older patients often share an email/phone with a spouse. Email is a **contact field, not a login key** — identity is `firebase_uid`, and `users.email` is **not unique**. When an invite hits an email already held by an *active* patient, `POST /api/invitations/generate` returns `409 { emailShared, existingName }`; the clinician confirms (re-submits with `allowSharedEmail: true`) and the **second** patient is created with an auto-generated `login_username` (`john-smith`, `-2` on collision). That maps to a synthetic IP account email `<login_username>@login.moveifyapp.com` (`LOGIN_USERNAME_DOMAIN`, mirrored in `backend/lib/login-identity.js` ↔ `frontend/src/config.ts` — nothing is ever mailed there). The first spouse keeps logging in by email; **patients who don't share an email are unchanged.** `invitation_tokens.user_id` ties a token to its exact user so `set-password` resolves the right row when the email is shared. Profile-edit only enforces email uniqueness when the email actually changes.

## Authorization (middleware)

All backend routes (except public auth routes) are protected by middleware in `backend/middleware/`:

- **`authenticate`** — verifies the bearer token (Identity Platform ID token first, legacy JWT fallback), sets `req.user = { id, role, email, is_admin }`
- **`requireRole(...roles)`** — checks `req.user.role` is in allowed list
- **`requireSelf(paramName)`** — verifies `req.params[paramName]` === `req.user.id` (patient accessing own data)
- **`requirePatientAccess`** — any clinician can access any patient; patients can only access their own data
- **`requireAdmin`** — checks `req.user.is_admin === true` (for admin-only actions like deleting patients)

**When adding new routes:** always apply `authenticate` middleware. Use `requireRole` for role-specific routes. Use `requireAdmin` for admin-only actions. Never trust client-supplied IDs for identity — use `req.user.id`.

## Shared Access Model

- **All clinicians see all patients, programs, exercises, and education modules** — there is no per-clinician ownership filtering
- `clinician_id` is still stored on `programs`, `exercises`, and `invitation_tokens` as an **audit trail** (who created it), but does not gate access
- The `clinician_patients` junction table still exists in the schema but is **no longer queried** — kept to avoid breaking existing deployments
- **Admin flag** (`is_admin` boolean on `users` table) controls admin-only actions: deleting patients, future clinician management
- The first clinician is automatically set as admin during DB initialization

## Security Hardening

- **Rate limiting:** Sensitive public endpoints (`/api/auth/forgot-password`, invitation validate/set-password, agreement validate/sign): 10 requests per 15 min per IP. General API: 100 requests per minute per IP.
- **SPA security headers:** set in `frontend/vercel.json` (CSP, HSTS, X-Frame-Options, Permissions-Policy — `microphone=(self)` is required for the scribe recorder). The backend's helmet CSP only covers API responses.
- **Transcript retention:** scribe transcripts are hard-deleted 48h after recording by the hourly `moveify-purge-transcripts` Cloud Scheduler job → `POST /api/internal/cron/purge-transcripts` (plus the lazy on-read check).
- **Security headers:** `helmet()` middleware (CSP, X-Frame-Options, etc.)
- **CORS:** Production requires `CORS_ORIGIN` env var (no wildcard). Development defaults to `http://localhost:5173`.
- **Input validation:** Email format validation on login/invitation, password min 8 chars on set-password
- **No public signup:** Users can only be created via clinician invitation
- **Admin role:** `is_admin` flag on users controls admin-only actions (patient deletion). First clinician is auto-promoted to admin

## Audit Logging

- `audit_logs` table records key operations (login, patient access, program CRUD, exercise completions, check-ins)
- Logged via `backend/services/audit.js` — fire-and-forget (never fails the request)
- Each log includes: `user_id`, `action`, `resource_type`, `resource_id`, `details` (JSONB), `ip_address`, `created_at`
