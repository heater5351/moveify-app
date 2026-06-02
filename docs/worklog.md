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

## 2026-06-02 — Agreement copy mapped to the Cliniko service agreements + brand redesign

- **What:** the automated sign-up agreement now mirrors the full Cliniko service agreements
  (provider header, Part A clinical services, Part B Direct Debit Request Service Agreement)
  instead of the earlier placeholder Part A. New `backend/lib/agreement-content.js`
  `buildAgreement({tier,path,startDate})` returns a structured doc (parts → sections with
  body/bullets/note/subsections) consumed identically by the PDF renderer, `GET
  /api/agreements/validate/:token` (now returns `agreement`, not `paragraphs`), and the sign
  page. Tier-specific inclusions/fees come from Part-Time Pricing Scheme v3.1; generic legal
  copy (DDRSA, privacy, failed payments, disputes) reproduced from the Cliniko agreement.
- **Design:** `AgreementPage.tsx` restyled to the handout brand language (navy masthead/banner,
  teal accents, structured sections). The signed PDF (`services/agreement-pdf.js`) rebuilt to
  match.
- **Per-plan billing copy:** `billingTerms()` in `agreement-template.js` generates accurate
  "Payment Authorisation" + "When Charges Occur" text per shape; amounts in `PLAN_BILLING`
  MUST match the worker's Stripe Prices (`scripts/create-agreement-prices.js` `PLAN_PRICING`).
- **Version** bumped to `v2.0-2026-06-02`. ⚠ Clinical/legal copy still needs Ryan's final read
  before the flag goes live. Open: provider postcode shows 5351 here vs 5352 in Cliniko; no
  `Independent-Discounted` plan exists in the catalog yet.

## 2026-06-02 — Service-agreement → Stripe subscription automation (behind flag)

- **What:** new sign-up flow that replaces the manual "Cliniko form + Payment Link + hand-set
  Cancel-at". A clinician mints a one-time tokenised link (operator-set tier/path/start-date) →
  patient signs Part A in-app → Stripe **Checkout setup mode** (card / BECS / wallets, dynamic
  payment methods) saves a payment method → `checkout.session.completed` webhook builds a
  **self-capping Subscription Schedule** (blocks: 6 debits; post-casual: 1 trial wk + 5; cancel)
  or a **plain rolling Subscription** (continuity). Credit still keys off the unchanged
  `invoice.payment_succeeded` Pattern-7 path.
- **Ships dormant** behind `AGREEMENT_AUTOMATION_ENABLED` (worker + backend). The frontend
  "Generate agreement" button is gated at **runtime** via `GET /api/config`
  (`agreementAutomationEnabled`) — it reflects the backend flag, so the UI shows on
  staging/preview (flag on) and stays hidden in prod (flag off) with no frontend rebuild.
  Verify in Stripe **test mode** before enabling the worker side.
- **New env vars:**
  - Worker: `AGREEMENT_AUTOMATION_ENABLED`, and one Stripe Price ID per plan —
    `STRIPE_PRICE_{T1,T2,T3}_STANDARD`, `STRIPE_PRICE_{T1,T2,T3}_POST_CASUAL`,
    `STRIPE_PRICE_{INDEPENDENT,MAINTAIN,EVOLVE,ELITE,REMOTE_WEEKLY,REMOTE_FORTNIGHTLY,APP_ONLY}`.
  - Backend: `AGREEMENT_AUTOMATION_ENABLED`, `BILLING_WORKER_URL`, `BILLING_ADMIN_TOKEN`
    (sources from the `billing_admin_token` secret — used to call the worker's new admin endpoint).
  - Frontend: `VITE_AGREEMENT_AUTOMATION_ENABLED`.
- **New schema:** additive `service_agreements` table (`backend/database/init.js`) — one row per
  minted link; stores token, signed name/at/ip, agreement version, Stripe customer/schedule ids,
  Cliniko attachment id. No destructive change.
- **New code:** worker — `lib/service-catalog.js` (`SUBSCRIPTION_PLANS` keyed `{path}:{tier}`,
  product names locked to `PP_FEES`), `services/stripe.js` Checkout/customer/schedule helpers,
  `routes/admin.js` `POST /admin/agreements/checkout-setup`, `jobs/stripe-handler.js`
  `checkout.session.completed` + `subscription_schedule.completed` + `customer.subscription.deleted`
  handlers. Backend — `routes/agreements.js` (generate/validate/sign), `services/cliniko.js`
  `uploadAttachment`, `services/agreement-pdf.js` (pdfkit, new dep), `lib/agreement-template.js`
  (⚠ placeholder Part A copy — confirm canonical wording + bump `AGREEMENT_VERSION` before live).
  Frontend — `components/AgreementPage.tsx` (public `/agreement*` routes) +
  `modals/GenerateAgreementModal.tsx`.
- **Deps:** backend gains `pdfkit`.
- **Reconcile self-heal (same day):** closes the "worker crashes after acking the webhook 200,
  before creating the schedule" gap. Schedules/subscriptions are stamped with
  `metadata.agreement_session`; `jobs/reconcile-agreements.js` lists recent COMPLETED setup
  checkouts and recreates any with no linked object (idempotent — DB key + Stripe idempotencyKey
  + metadata link; recovered cases raise an `agreement_schedule_recovered` flag). Endpoints:
  `POST /cron/reconcile-agreements` (OIDC, scheduled) + `POST /admin/agreements/reconcile`
  (X-Admin-Token, dry-run default). **Staging** runs it every 6h via Cloud Scheduler
  `moveify-staging-reconcile-agreements` (worker needs `OIDC_EXPECTED_AUDIENCE` = its own URL).
  **Prod go-live:** create the equivalent scheduler against the prod worker when the flag is enabled.
- **Going live:** run `billing-worker/scripts/create-agreement-prices.js` (TEST key first:
  `STRIPE_SECRET_KEY=sk_test_… node scripts/create-agreement-prices.js`) to create the
  Products/Prices and print the `STRIPE_PRICE_*` env lines; `--dry-run` lists the catalog with
  no key. Idempotent (find-or-reuse). Amounts in that script must be re-confirmed before live.
- **Payment-safety hardening (same day):** the worker acks the Stripe webhook 200 *before*
  processing, so there is **no Stripe retry** — every `checkout.session.completed` failure path
  now raises an `agreement_setup_failed` reconciliation flag (the whole handler is wrapped).
  tier/path/start_date are read from the **session** metadata (immutable per checkout), not the
  mutable customer metadata. Schedule/subscription creation passes a Stripe **idempotencyKey**
  keyed on the session (no same-session double-create), and the backend **invalidates prior
  pending agreements** per patient on mint (no two-links-both-create). `clinikoId` is validated
  numeric in both the backend and the worker before the Stripe customer-search interpolation
  (injection / mis-link guard). Sign reverts to `pending` on worker failure so the same link
  retries; the Cliniko PDF upload is guarded against duplicates.
- Plan + rationale: vault *Build Plan - Service Agreement & Stripe Subscription Automation* /
  *Decision - Service Agreement and Stripe Automation Direction*.

## 2026-06-01 — Cliniko API-key consolidation + block-progress activated

- **Key consolidation:** the standalone `CLINIKO_API_KEY` and `CLINIKO_API_KEY_STAGING`
  Secret Manager secrets were **deleted**. `CLINIKO_API_KEY` turned out to be a **dead key**
  (401 on every request) — its admin-write consumers (billing-worker referrals pipeline) had
  been silently failing, masked by low referral volume. All consumers now use:
  - **`CLINIKO_API_KEY_ADMIN`** — full-access (writes + default reads). Backend `CLINIKO_API_KEY`
    env (prod + staging) now sources from it; billing-worker `lib/secrets.js` maps
    `cliniko-api-key`/`-admin`/`-staging` → `CLINIKO_API_KEY_ADMIN`.
  - **`CLINIKO_API_KEY_FINANCE`** — read-only (poller/sync/reconcile). Unchanged.
  - Both `1097567971198-compute@` (backend) and `billing-worker@` SAs granted `secretAccessor`
    on `CLINIKO_API_KEY_ADMIN`.
- **Backend trim fix:** `backend/services/cliniko.js` now `.trim()`s the key/subdomain (Secret
  Manager values often carry a trailing newline → malformed Basic-auth header → 401). The
  billing-worker already trimmed.
- **Staging Cliniko was misconfigured:** it set `CLINIKO_API_KEY_STAGING` env, but deployed
  services run `NODE_ENV=production`, so the code reads `CLINIKO_API_KEY`. Fixed by setting
  staging's `CLINIKO_API_KEY` env from the admin secret (the `_STAGING` path is local-dev only).
- **Block-progress → `appointment_notes` activated:** the worker's block-progress feature
  (writes a `[BLOCK] …` session-count line into Cliniko) was deployed-but-paused, uncommitted,
  and untested. Now **committed** (`jobs/sync-block-progress.js`, `lib/block-bundles.js`,
  `services/cliniko.js` additions, `routes/cron.js`), **tested** (new `tests/block-bundles.test.mjs`,
  20 cases — first vitest suite in the worker), validated via dry-run, and the Cloud Scheduler
  job `billing-sync-block-progress` is **un-paused** (runs every 15 min, real writes).
- **Worker Dockerfile:** `npm ci` → `npm install --omit=dev` (adding vitest's Linux-only optional
  deps broke `npm ci`'s strict cross-platform lockfile check).
- **Known follow-up:** prod backend lacks the trim fix — if `CLINIKO_API_KEY_ADMIN` has a trailing
  newline, prod Import-from-Cliniko/manual-sync could still 401. Verify in-app; ship the trim fix
  to prod if needed.

## 2026-06-01 — Automatic Cliniko → Moveify patient sync (scheduled)

- **What changed:** Cliniko-linked patients' demographics now refresh automatically on a
  schedule instead of only via the manual per-patient sync button. New backend job
  `jobs/sync-cliniko-patients.js` pulls Cliniko patients changed since a stored cursor
  (`updated_at[gt]`), matches them to Moveify users by `cliniko_patient_id`, and applies the
  **same** field mapping the manual sync uses. Direction is Cliniko → Moveify only; **email
  is never synced** (login credential). First run (no cursor) fetches each linked patient
  individually; steady state uses the incremental list.
- **Shared logic:** extracted into `services/cliniko-sync.js` (`buildPatientFields`,
  `applySync`, plus `getState`/`setState`). `routes/cliniko.js POST /sync/:patientId` was
  refactored to call it, so manual + auto sync are identical.
- **Trigger:** Cloud Scheduler → OIDC-protected `POST /api/internal/cron/sync-cliniko-patients`
  (`routes/internal-cron.js`, mirrors the billing-worker's `requireOidc`). Admins can also run
  it on demand via `POST /api/cliniko/sync-all`.
- **New env vars (backend Cloud Run):** `CRON_OIDC_SA` (scheduler service-account email) and
  `CRON_OIDC_AUDIENCE` (this service's Cloud Run URL). Without both, the cron endpoint 503s.
- **Schema:** additive `app_state` table (key/value/updated_at) for the sync cursor
  (`cliniko_patient_last_sync`). No `users` column changes.
- **New dep:** `google-auth-library` (was transitive via `googleapis`) now explicit.
- **Deploy note:** set the two env vars and create the Cloud Scheduler job per environment
  (staging URL + prod URL) — see `CLAUDE.md` "Cliniko Patient Sync".
- Updated `CLAUDE.md` (new section + env-var table + schema table).

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
