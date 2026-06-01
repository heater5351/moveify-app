# Engineering Worklog

Reverse-chronological log of **notable** changes — architecture shifts, migrations,
new/removed env vars, auth & security changes, schema changes, and anything that
makes `CLAUDE.md` or a prior assumption stale. Newest first.

**Why this exists:** `CLAUDE.md` drifted out of date (it described the old custom-JWT
auth long after the app had migrated to Identity Platform), because code changes
shipped without a trigger to update the canonical context. This log + the
self-maintenance rule in `CLAUDE.md` ("Keeping context fresh") close that gap.

**How to use it**
- Read the top few entries at the start of a work session for recent context.
- When you make a change that alters *how the system works* (not a plain bug fix),
  add a dated entry here **and** update the affected `CLAUDE.md` section **in the
  same commit**.
- Keep entries short. Link to the detailed doc/PR rather than duplicating it.
- Don't log routine bug fixes, copy tweaks, or anything git history already captures.

Entry format: `## YYYY-MM-DD — Title` then 1–4 bullets (what changed, why,
what to know now, links).

---

## 2026-06-01 — Async `getAuthHeaders` + token-expiry fix

- **Problem:** clinicians kept getting "Token expired" / bounced to login. Root cause:
  `getAuthHeaders()` read a synchronous in-memory token cache that only updated on
  `onIdTokenChanged`, which doesn't fire while the tab is backgrounded/asleep — so a
  stale, expired Identity Platform ID token (1 h lifetime) was shipped on the next call.
- **Fix:** `getAuthHeaders()` is now **async** and mints the token at call time via
  `user.getIdToken()` (cheap when valid, network-refreshes only near expiry). All ~25
  call sites now `await` it. `fetchWithRetry` does one forced `getIdToken(true)` retry on
  a 401 before clearing auth. `firebase.ts` re-warms the cache on `focus`/`visibilitychange`/`online`.
- **Know now:** new API call sites must `await getAuthHeaders()`. Token lifetime is the
  ID-token's 1 h (auto-refreshed); session length is governed by persistence ("Remember me").
- Updated `CLAUDE.md` Authentication section + env-var tables to match.

## 2026-05-19 — Auth migrated to GCP Identity Platform (Phases 0–3)

- Custom JWT auth replaced by **GCP Identity Platform** (RS256 ID tokens, server-side
  revocation, no token in `localStorage`, MFA-capable). Postgres `users` keeps all
  profile/role data; IP holds only credentials, linked via `users.firebase_uid`.
- Backend `authenticate` is **dual-mode** (IP token first, legacy HS256 JWT fallback).
  Phase 4 removes the legacy path + `JWT_SECRET` — earliest **2026-06-02**.
- New env vars: backend `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
  `FIREBASE_PRIVATE_KEY`; frontend `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` /
  `VITE_FIREBASE_PROJECT_ID`. `JWT_EXPIRY` is dead.
- Full plan & phases: `docs/identity-platform-migration.md`.
