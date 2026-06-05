# Moveify - Clinical Exercise Program Builder

## Project Overview

Moveify is a clinical exercise prescription and patient management platform (similar to Physitrack, VALD MoveHealth). It enables clinicians to build exercise programs and assign them to patients, who can then log completions, track progress, and complete daily wellness check-ins.

**⚠ SECURITY: Never read, print, log, or display any API key or secret.** This applies to every credential, including but not limited to: `CLINIKO_API_KEY*`, `JWT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `STRIPE_API_KEY*`, `billing_stripe_webhook_secret*`, `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET`/`XERO_REFRESH_TOKEN`/`XERO_TENANT_ID`, `billing_admin_token`. Never inspect values from Secret Manager, env vars, Cloud Run config, or any other source. Hard rule, no exceptions.

**⚠ PRODUCTION APP WITH REAL PATIENTS.** Real patients are actively using this app. When making changes:
- **Never delete or rename exercises** that are in assigned programs — this breaks completion history
- **Never drop/alter DB columns** without safe migrations (use defaults, nullable columns, `IF NOT EXISTS`)
- **Never make destructive schema changes** without confirming with the user first
- **Backend redeployments** cause brief downtime (~30s) — prefer deploying outside business hours (AEST)
- **Frontend changes** deploy instantly via Vercel and are low-risk (patient sees updates on refresh)
- **Test breaking changes locally first** — don't experiment on production data
- If unsure whether a change could affect existing patient data or programs, ask before proceeding

## Architecture

**Monorepo** with these top-level directories:

- `frontend/` — React 19 + TypeScript + Vite SPA
- `backend/` — Node.js + Express + PostgreSQL API
- `billing-worker/` — separate Cloud Run service consuming Stripe webhooks and Tyro CSVs, writing to Xero. See `billing-worker/HANDOVER.md` for internals.
- `clinic-website/` — marketing site (independent). **Source lives on the `clinic-website` branch, NOT `dev`/`main`.** See "Clinic Website" section below.

### Frontend Stack

- **React 19** with TypeScript 5.9
- **Vite 7** for dev server and builds
- **Tailwind CSS 3** for styling (utility-first, no CSS modules or styled-components)
- **React Router DOM 7** for public routes only (login, setup-password, reset-password)
- **@dnd-kit** for drag-and-drop (program builder exercise reordering)
- **Lucide React** for icons

### Backend Stack

- **Express 4** (CommonJS, not ESM)
- **PostgreSQL** via `pg` driver (no ORM)
- **firebase-admin** for GCP Identity Platform token verification (primary auth)
- **jsonwebtoken** + **bcrypt** — legacy JWT verification / password hashing, retained only for the dual-mode fallback until Phase 4 cleanup (see `docs/identity-platform-migration.md`)
- **express-rate-limit** for brute force protection
- **helmet** for security headers
- **Gmail API** for transactional emails
- **PM2** for process management in production

### Billing Worker

Cloud Run service `moveify-billing-worker` (separate from `moveify-backend`). Public surface: `/webhooks/stripe` (HMAC-verified) and `/webhooks/tho` (placeholder). All `/admin/*` routes require an `X-Admin-Token` header matching the `billing_admin_token` Secret Manager secret. The worker holds no patient-facing endpoints. See `billing-worker/HANDOVER.md` for full internals (jobs, Xero adapter).

**State store: PostgreSQL (`billing` database in shared `moveify-db` Cloud SQL instance).** Schema in `billing-worker/db/init.sql`, applied at startup via `db/init.js`. Service layer in `services/billing-db.js`. The worker uses its own DB user `billing_worker_user` which is walled off from the `moveify` (patient) DB at the Postgres role level — `cloudsqlsuperuser` membership is explicitly revoked (see `scripts/apply-grants.js`). Sheets is no longer in the runtime path.

**Xero target: "Moveify Health Solutions" production tenant.**
- `XERO_TENANT_ID` secret = `feb50776-7262-4464-adc3-947c93fb0a13`
- `XERO_TYRO_CLEARING_ACCOUNT_ID` env = `0298aadd-45b3-4052-9f52-fa4e0bb0c2cf`
- `XERO_STRIPE_CLEARING_ACCOUNT_ID` env = `ef70673e-507a-42d2-8d81-33500439a8ac`

Re-consenting OAuth (after scope changes / token revocation): run `node billing-worker/scripts/get-xero-token.js` with `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` in env, pick the tenant in the browser flow, then force a worker cold start (`gcloud run services update moveify-billing-worker --region=australia-southeast1 --update-env-vars=BUMP=$(date +%s)`).

**Clean-slate replay tooling:** `/admin/wipe-billing-state` truncates all 15 tables (gated by `confirm: "I-mean-it"`, dry-run by default). `/admin/replay-from-scratch` orchestrates re-seed bank rules → Cliniko sync → Stripe backfill (oldest first, so credit accrues before allocation) → Cliniko appointment backfill → Tyro Drive ingest. Both are admin-only.

**P&P (Program & Platform) invoices:** Created in the Stripe webhook handler (`jobs/stripe-handler.js` `maybeCreatePpInvoice`) when a DD payment lands. The fee covers gym + app access separately from per-session billing — schedule defined in `lib/rates.js` `PP_FEES`. Cadence:
- **Block products** (T1/T2/T3 Foundation/Progress/Performance): one P&P per `subscription.start_date`. Only the first weekly DD creates it; later DDs find the idempotency key and skip.
- **4-weekly products** (Independent / Maintain / Evolve / Independent-Discounted): one P&P per Stripe invoice `period_start` — every 4-week DD cycle gets its own.
- **Elite, Remote Weekly/Fortnightly, App-Only**: no P&P invoice (`amount: 0`).

The P&P invoice is auto-allocated against the just-created Xero overpayment (DD payment → contact credit → P&P consumes it). Idempotency key format: `pp:<cliniko_id>:<anchor_date>`.

### Service-Agreement → Stripe Automation (sign-up flow)

Replaces the manual "Cliniko form + Payment Link + hand-set Cancel-at". **Behind `AGREEMENT_AUTOMATION_ENABLED`** (worker + backend). The frontend gates its "Generate agreement" button at runtime via `GET /api/config` → `agreementAutomationEnabled` (reflects the backend flag — shows on staging, hidden in prod, no rebuild). Flow: clinician mints a one-time tokenised link (operator sets tier/path/start-date) → patient signs Part A on `moveifyapp.com/agreement?token=…` → backend stores the signed PDF in Cliniko (`service_agreements` row) and calls the worker's `POST /admin/agreements/checkout-setup` → worker opens a Stripe **Checkout setup-mode** session (card / BECS / wallets via dynamic payment methods, no charge yet) → `checkout.session.completed` webhook sets the default payment method and creates the Stripe object per shape:

- **Block standard** → Subscription **Schedule**, 6 weekly debits, `end_behavior=cancel`.
- **Post-casual** → Schedule, 1 trial week (no charge) → 5 weekly debits → cancel.
- **Continuity** → plain rolling **Subscription** (4-weekly Price), cancelled manually.

Plan catalog: `lib/service-catalog.js` `SUBSCRIPTION_PLANS` (keyed `{path}:{tier}`). **Product names MUST match `lib/rates.js` `PP_FEES` keys** — the existing `invoice.payment_succeeded` Pattern-7 credit + P&P path is **unchanged** and resolves tier from the Stripe product name. Each plan's Price ID is read from a per-plan env var (`STRIPE_PRICE_*`) so test/live differ. Agreement copy: `backend/lib/agreement-content.js` `buildAgreement({tier,path,startDate})` builds the full structured doc (provider header + Part A clinical + Part B DDRSA, mapped to the Cliniko service agreements) consumed by the PDF renderer, `GET /api/agreements/validate/:token`, and the sign page; per-plan billing/charge wording + amounts (`PLAN_BILLING`, must match the worker's Stripe Prices) + `AGREEMENT_VERSION` live in `backend/lib/agreement-template.js`. ⚠ Clinical/legal copy still needs a final review before go-live.

**Reliability:** the webhook acks 200 before processing, so failures can't rely on Stripe retries — `handleCheckoutCompleted`/`provisionFromSetupSession` flags **every** failure (`agreement_setup_failed`), creation uses a Stripe `idempotencyKey` keyed on the session, and objects are stamped with `metadata.agreement_session`. A **reconcile sweep** (`jobs/reconcile-agreements.js`, `POST /cron/reconcile-agreements` OIDC + `POST /admin/agreements/reconcile` dry-run) self-heals any completed setup checkout that never got a schedule (worker crash window). Staging runs it every 6h (`moveify-staging-reconcile-agreements`); prod runs it every 6h too (`moveify-reconcile-agreements`, created at go-live 2026-06-02). A **test-mode worker** (`moveify-billing-worker-staging`, `STRIPE_MODE=test`) runs the whole flow against test Stripe with no Xero env so its invoice path no-ops.

**LIVE in production since 2026-06-02** (`AGREEMENT_AUTOMATION_ENABLED=true` on prod backend + worker). The prod runtime Stripe key (`STRIPE_API_KEY` secret) must carry the agreement-flow scopes on top of the billing-pipeline ones: **write** on Customers / Subscriptions (covers Schedules) / Checkout Sessions; **read** on Charges, PaymentIntents, Invoices, Balance, SetupIntents, Products, Prices. The **live Stripe webhook endpoint** must subscribe to `checkout.session.completed`, `subscription_schedule.completed`, `customer.subscription.deleted` (added 2026-06-04) in addition to the existing `invoice.payment_succeeded`/`invoice.payment_failed`/`charge.dispute.created` — without them, completed checkouts only get a schedule via the 6-hourly reconcile sweep, not in real time.

⚠ **Worker cron OIDC-audience gotcha:** the worker's `OIDC_EXPECTED_AUDIENCE` must equal the audience the existing Cloud Scheduler jobs send — the `…-1097567971198.australia-southeast1.run.app` URL form, **not** the `…-{hash}-ts.a.run.app` form from `gcloud run services describe … status.url`. Mismatching it makes the worker reject **every** cron with OIDC "Wrong recipient, payload audience != requiredAudience". Any new scheduler hitting the worker must use the 1097 audience. (One-off admin scripts run as Cloud Run **Jobs** built from the worker image with `--set-secrets` binding the needed secret — never handle the secret locally.)

### Deployment

- Frontend: **Vercel** (vite build → `dist/`) — live at **https://www.moveifyapp.com**
- Backend: **GCP Cloud Run** (Docker container) + **Cloud SQL PostgreSQL** (`australia-southeast1`)
- Environment variable `VITE_API_URL` points frontend to backend (falls back to `localhost:3000`)
- Cloud Run connects to Cloud SQL via Unix socket (`/cloudsql/{INSTANCE_CONNECTION_NAME}`)
- `backend/Dockerfile` builds the container; `backend/database/db.js` switches between Cloud SQL socket and `DATABASE_URL` based on env vars
- Domain: **moveifyapp.com** registered on Cloudflare, DNS pointing to Vercel (DNS only, no proxy)

### Mobile App (Android)

- **Capacitor 8** wraps the existing React SPA into a native Android app for Google Play
- Android project lives at `frontend/android/`, app ID: `com.moveifyhealth.app`
- Build: `cd frontend && npm run build:android` (builds SPA + syncs to Android project)
- APK is built via Gradle: `cd frontend/android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug`
- The Android WebView loads local files; API calls go to the Cloud Run backend via `VITE_API_URL` baked in at build time (from `frontend/.env.production`)
- CORS allows `https://localhost` and `capacitor://localhost` for WebView origins
- `FRONTEND_URL` env var on Cloud Run controls where email links (invitations, password resets) point — currently `https://www.moveifyapp.com`
- **When the app is on Google Play:** email links will open in the browser, not the app. Deep linking (Android App Links) is a future enhancement if needed
- **When modifying email templates or links:** consider that patients may be using the website OR the Android app. Links should always use `FRONTEND_URL` and point to the web domain (works in both contexts)

## Project Structure

```
frontend/src/
├── components/          # All React components (PascalCase files)
│   ├── modals/          # Modal components (9 modals)
│   ├── App.tsx          # Main router, centralized state, tab navigation
│   ├── LoginPage.tsx    # Auth flow
│   ├── PatientPortal.tsx
│   ├── ProgramBuilder.tsx
│   ├── ExerciseLibrary.tsx
│   └── ...
├── types/index.ts       # All TypeScript interfaces
├── utils/api.ts         # Fetch wrapper with retry logic, Identity Platform token management, async auth headers
├── data/exercises.ts    # Default exercise database
├── config.ts            # API URL configuration
└── main.tsx             # Entry point

backend/
├── middleware/
│   ├── auth.js          # Dual-mode token verify (Identity Platform RS256 + legacy JWT), role check
│   └── ownership.js     # Access control (requirePatientAccess, requireAdmin, requireSelf)
├── services/
│   └── audit.js         # Fire-and-forget audit logging
├── routes/              # All API route files
├── database/
│   ├── db.js            # PostgreSQL pool
│   └── init.js          # Schema + migrations
├── server.js            # Express app, middleware, rate limiting
└── Dockerfile
```

## Conventions

### Code Style

- **Functional components only** with hooks (useState, useEffect)
- **No external state management** — state lives in App.tsx, passed via props
- **PascalCase** for component files and names (e.g., `PatientProfile.tsx`)
- **camelCase** for utilities and non-component files
- **Props interfaces** use `ComponentNameProps` suffix
- TypeScript strict mode is enabled — no `any` types without justification

### Styling

- **Tailwind utility classes only** — never write custom CSS unless absolutely necessary
- **Fonts:** `font-display` = Sora (headings), `font-sans` = DM Sans (body text)
- Use the Moveify brand color palette defined in `tailwind.config.js`:
  - Primary: `primary-400` (teal `#46c1c0`) — buttons, links, accents
  - Secondary: `secondary-500` (navy `#132232`) — headers, dark backgrounds
  - Use semantic scale (`primary-50` through `primary-900`) for variants
- Named brand colors available as `moveify-teal`, `moveify-navy`, `moveify-ocean`
- Responsive design using Tailwind breakpoints (`sm:`, `md:`, `lg:`)

### Component Patterns

- Modals go in `components/modals/` directory
- New pages/views go directly in `components/`
- Use `ConfirmModal` for destructive action confirmations
- Use `NotificationModal` for toast-like feedback
- Drag-and-drop uses `@dnd-kit` — follow existing `ProgramBuilder.tsx` patterns
- **Modals are fully controlled by App.tsx** — parent manages `show*Modal` boolean state and passes `onClose`/`onUpdate` callbacks. Modals never manage their own open/close state.

### API Integration

- All API calls attach auth via `await getAuthHeaders()` from `utils/api.ts` — it is **async** (mints the Identity Platform ID token at call time). New call sites must `await` it.
- `utils/api.ts` also provides retry logic with exponential backoff, token helpers (`getToken`, `clearAuth`), and 401 handling that force-refreshes the token once before clearing auth + redirecting to login
- API base URL comes from `config.ts` — never hardcode URLs
- Backend endpoints follow REST: `GET/POST/PUT/PATCH/DELETE /api/{resource}`
- **Never pass `clinicianId` or `patientId` in request bodies for identity** — the backend derives these from the verified token via `req.user.id`

## Exercise Naming Convention

Exercise names follow the pattern: **`[Modifier] [Movement] with [Equipment]`**

- **Movement comes first**, equipment last after "with": `Squat with Barbell`, `Calf Raise with Dumbbells`
- **Modifiers before the movement:** `Single Leg`, `Elevated`, `Assisted`, `Lateral`, `Ipsilateral`
- **No suffix = bodyweight is still explicit:** use `with Bodyweight` (e.g., `Squat with Bodyweight`)
- **Parenthetical aliases** for searchability: `Isometric Wall Squat (Wall Sit)`
- **`+` combiner** for compound movements: `Glute Bridge + Hip Abduction with Resistance Band`
- **Plural for dumbbells:** `with Dumbbells` (not `with Dumbbell`)
- **Singular for everything else:** `with Barbell`, `with Kettlebell`, `with Resistance Band`
- **"with Support"** for assisted variations (e.g., `Forward Lunge with Support`)
- **Title case** throughout: `Bulgarian Split Squat with Dumbbells`
- **Equipment names in exercises must match equipment filter values** — see `EQUIPMENT_OPTIONS` in `AddExerciseModal.tsx`

Equipment values: `Bodyweight`, `Dumbbells`, `Barbell`, `Resistance Band`, `Machine`, `Kettlebell`, `Medicine Ball`, `Foam Roller`, `Stability Ball`, `Cable`, `Support`

Exercise planning doc: `docs/exercise-plan.md`

## Domain Model

Key entities and their relationships:

- **Patient** — has demographics (name, DOB, condition, contact info), has many AssignedPrograms
- **AssignedProgram** — has ProgramConfig (dates, frequency, duration) and many ProgramExercises
- **Exercise** — defined by name, joint area, muscle group, equipment, video URL
- **ProgramExercise** — Exercise + prescription (sets, reps, weight, periodization)
- **CompletionData** — logged per exercise (sets performed, RPE 1-10, pain 0-10, notes, date)
- **DailyCheckIn** — patient wellness (mood, pain, energy, sleep ratings)
- **EducationModule** — educational content (text/video) assignable to patients

## User Roles

- **Clinician**: manages patients, builds programs, assigns exercises, views analytics, manages education library
- **Patient**: views assigned programs, logs exercise completions, does daily check-ins, views education

## Commands

```bash
# Frontend
cd frontend && npm run dev      # Dev server on :5173
cd frontend && npm run build    # TypeScript check + production build
cd frontend && npm run lint     # ESLint

# Backend
cd backend && npm run dev       # Nodemon dev server on :3000
cd backend && npm start         # Production server

# Billing worker
cd billing-worker && npm test                                       # Vitest
gcloud run services logs tail moveify-billing-worker --region australia-southeast1
```

## Frontend Navigation

**Authenticated pages do NOT use React Router.** Navigation is state-driven via `currentPage` in App.tsx:

- `'exercises'` → ExerciseLibrary + ProgramBuilder (side by side)
- `'patients'` → PatientsPage
- `'programs'` → PatientProfile (viewing a specific patient's programs)
- `'education'` → EducationLibrary
- `'analytics'` → ProgressAnalytics

React Router is only used for public/unauthenticated routes: `/` (login), `/setup-password`, `/reset-password`, `/privacy-policy`.

**Do not add new `<Route>` components for authenticated views.** Add new tabs by extending the `currentPage` state pattern.

## App.tsx State

App.tsx is the **centralized state monolith** (~60+ state variables). All child components receive state via props. Key state categories:

- **Auth:** `isLoggedIn`, `userRole`, `loggedInPatient`, `loggedInUser`
- **Navigation:** `currentPage`, `viewingPatient`, `viewingProgramIndex`
- **Program builder:** `programExercises`, `programName`, `selectedPatient`, `programConfig`, `pendingBlockData`
- **Patients:** `patients` (all), `newPatient` (form), `editingPatient`
- **Modals:** 13 separate `show*Modal` booleans
- **Notifications:** `notification` (success/error toast)

When adding new state, add it to App.tsx and pass via props. Do not introduce Context API or external state management.

## Auth & Security

### Authentication (GCP Identity Platform)

Auth was migrated from custom JWTs to **GCP Identity Platform** (Phases 0–3 live in prod; legacy-JWT removal is Phase 4, earliest 2026-06-02). See `docs/identity-platform-migration.md`. The PostgreSQL `users` table still holds all profile/role data; Identity Platform only holds credentials. Each user row links to its IP account via the `firebase_uid` column (`moveify-<id>`).

1. **Login:** client-side `signInWithEmailAndPassword` via the Firebase SDK (`frontend/src/lib/firebase.ts`). On success the app calls `GET /api/auth/me` with the ID token to load the Postgres user. There is no `POST /api/auth/login` anymore.
2. **Token format:** Identity Platform **ID token** (RS256, ~1 hour expiry). The Firebase SDK refreshes it automatically using a long-lived refresh token. **"Remember me"** chooses persistence: ticked → `browserLocalPersistence` (refresh token survives browser close, effectively indefinite until sign-out/revocation); unticked → `browserSessionPersistence` (dies when the tab closes). The 1-hour figure is the ID-token lifetime, not the session length.
3. **Token storage:** the ID token lives **in memory only** (Firebase SDK + a cache in `firebase.ts`), never in `localStorage` — this closed the XSS gap that motivated the migration. `localStorage` holds only `moveify_user` (non-sensitive profile). A stale `moveify_token` key from the pre-migration era is defensively cleared on load.
4. **Attaching auth:** `getAuthHeaders()` in `utils/api.ts` is **async** — it mints the token at call time via `user.getIdToken()`, which returns the in-memory token instantly when valid and only hits the network when expired/near-expiry. Always `await getAuthHeaders()`. (A `focus`/`visibilitychange`/`online` listener in `firebase.ts` also re-warms the cache, since the SDK only auto-refreshes while the tab is foregrounded.)
5. **401 handling:** `fetchWithRetry` first attempts one forced token refresh (`getIdToken(true)`) and retries the request; only if the fresh token is also rejected does it `clearAuth()` (sign out + clear `moveify_user`) and redirect to login.
6. **Session restoration:** `App.tsx` uses `onAuthStateChanged` — on load, if the SDK restores a user, it fetches `GET /api/auth/me` and rehydrates without re-login.
7. **Invitation:** clinician generates invite → creates Postgres user row + a disabled IP account → patient sets password via `/setup-password` (Admin SDK `updateUser`, enables the account).
8. **Password reset:** Admin SDK `generatePasswordResetLink` → emailed via the existing Gmail service.
9. **Backend verification:** `authenticate` is **dual-mode** — it verifies IP ID tokens (RS256) via `firebase-admin`, falling back to legacy HS256 JWTs for any sessions predating the cutover. The legacy fallback (and `JWT_SECRET`) is slated for removal in Phase 4.

### Authorization (middleware)

All backend routes (except public auth routes) are protected by middleware in `backend/middleware/`:

- **`authenticate`** — verifies the bearer token (Identity Platform ID token first, legacy JWT fallback), sets `req.user = { id, role, email, is_admin }`
- **`requireRole(...roles)`** — checks `req.user.role` is in allowed list
- **`requireSelf(paramName)`** — verifies `req.params[paramName]` === `req.user.id` (patient accessing own data)
- **`requirePatientAccess`** — any clinician can access any patient; patients can only access their own data
- **`requireAdmin`** — checks `req.user.is_admin === true` (for admin-only actions like deleting patients)

**When adding new routes:** always apply `authenticate` middleware. Use `requireRole` for role-specific routes. Use `requireAdmin` for admin-only actions. Never trust client-supplied IDs for identity — use `req.user.id`.

### Shared Access Model

- **All clinicians see all patients, programs, exercises, and education modules** — there is no per-clinician ownership filtering
- `clinician_id` is still stored on `programs`, `exercises`, and `invitation_tokens` as an **audit trail** (who created it), but does not gate access
- The `clinician_patients` junction table still exists in the schema but is **no longer queried** — kept to avoid breaking existing deployments
- **Admin flag** (`is_admin` boolean on `users` table) controls admin-only actions: deleting patients, future clinician management
- The first clinician is automatically set as admin during DB initialization

### Security Hardening

- **Rate limiting:** Auth endpoints (`/api/auth/login`, `/api/auth/forgot-password`): 10 requests per 15 min per IP. General API: 100 requests per minute per IP.
- **Security headers:** `helmet()` middleware (CSP, X-Frame-Options, etc.)
- **CORS:** Production requires `CORS_ORIGIN` env var (no wildcard). Development defaults to `http://localhost:5173`.
- **Input validation:** Email format validation on login/invitation, password min 8 chars on set-password
- **No public signup:** Users can only be created via clinician invitation
- **Admin role:** `is_admin` flag on users controls admin-only actions (patient deletion). First clinician is auto-promoted to admin

### Audit Logging

- `audit_logs` table records key operations (login, patient access, program CRUD, exercise completions, check-ins)
- Logged via `backend/services/audit.js` — fire-and-forget (never fails the request)
- Each log includes: `user_id`, `action`, `resource_type`, `resource_id`, `details` (JSONB), `ip_address`, `created_at`

## Backend API Routes

All routes are prefixed with `/api`. Routes marked with a lock require authentication.

### Public routes (no auth required)
| Route file | Endpoints |
|-----------|--------|
| `auth.js` | `POST /login`, `POST /forgot-password`, `GET /verify-reset-token/:token`, `POST /reset-password` |
| `invitations.js` | `GET /validate/:token`, `POST /set-password` |

### Protected routes (require JWT)
| Route file | Prefix | Key endpoints | Auth |
|-----------|--------|---------------|------|
| `auth.js` | `/api/auth` | `GET /me` | Any authenticated user |
| `invitations.js` | `/api/invitations` | `POST /generate` | Clinician only |
| `patients.js` | `/api/patients` | `GET /` (all patients), `GET /:id`, `DELETE /:id` | Clinician (DELETE = admin only) |
| `programs.js` | `/api/programs` | `POST /patient/:patientId`, `PUT /:programId`, `DELETE /:programId` | Clinician only |
| `programs.js` | `/api/programs` | `PATCH /exercise/:exerciseId/complete` | Patient only (uses `req.user.id`) |
| `programs.js` | `/api/programs` | `GET /patient/:patientId`, `GET /analytics/patient/:patientId` | Both roles + access check |
| `exercises.js` | `/api/exercises` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, favorites | Clinician only |
| `check-ins.js` | `/api/check-ins` | `POST /` | Patient only (uses `req.user.id`) |
| `check-ins.js` | `/api/check-ins` | `GET /today/:patientId`, `GET /history/:patientId` | Patient self-access |
| `check-ins.js` | `/api/check-ins` | `GET /patient/:patientId`, `GET /averages/:patientId` | Both roles + access check |
| `education.js` | `/api/education` | Module CRUD, categories | Clinician only |
| `education.js` | `/api/education` | Assign/unassign modules | Clinician only |
| `education.js` | `/api/education` | `POST .../viewed`, `GET /patient/:patientId/modules` | Both roles + access check |
| `blocks.js` | `/api/blocks` | Templates CRUD, `GET /flags` | Clinician only |
| `blocks.js` | `/api/blocks` | Block read/prescription | Both roles + access check |
| `agreements.js` | `/api/agreements` | `POST /generate` (mint tokenised link) | Clinician only |
| `agreements.js` | `/api/agreements` | `GET /validate/:token`, `POST /:token/sign` | Public (token-gated, rate-limited) |
| `scribe-handout.js` | `/api/scribe/sessions` | `POST /:id/handout/generate`, `POST /:id/handout/docx` | Clinician only (ephemeral, audit only) |
| `scribe-reassessment.js` | `/api/scribe/sessions` | `POST /:id/reassessment/{generate,regrade,narrative,docx}` | Clinician only (baseline vs latest comparison; `audience` 'patient'\|'gp' + docx `variant`; `generate` takes optional `previousReportText` + optional `baselineSessionId`; ephemeral, audit only) |
| `scribe-documents.js` | `/api/scribe/documents` | `POST /extract` (PDF/DOCX/TXT → text, multer in-memory) | Clinician only (ephemeral, nothing stored/logged) |

## Database Schema

Defined in `backend/database/init.js`. Key tables:

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users` | id, email, password_hash, role (`'clinician'`/`'patient'`), name, dob, phone, condition, is_admin | Single table for both roles. `is_admin` controls admin privileges for clinicians |
| `programs` | patient_id, clinician_id, name, frequency, start_date, duration | `frequency` is a **JSON string** (e.g., `'["Mon","Wed","Fri"]'`) — must `JSON.parse()` on read |
| `program_exercises` | program_id, exercise_name, sets, reps, prescribed_weight, exercise_order | `prescribed_weight` is **nullable** — not all programs track weight |
| `exercise_completions` | exercise_id, patient_id, completion_date, sets/reps/weight_performed, rpe_rating, pain_level | `completion_date` is **DATE not DATETIME** — only tracks day, not time |
| `daily_check_ins` | patient_id, check_in_date, overall_feeling (1-5), general_pain_level (0-10), energy_level (1-5), sleep_quality (1-5) | One per patient per day |
| `exercises` | clinician_id, name, category, joint_area, muscle_group, equipment, video_url | Custom exercises. Metadata fields are **comma-separated strings** (e.g., `"Knee, Hip"`) |
| `block_schedules` | program_id, block_duration (4/6/8 weeks), current_week, status | Periodization blocks |
| `education_modules` | title, content, category, estimated_duration_minutes, created_by | Text/video education |
| `clinician_patients` | clinician_id, patient_id | **Legacy** — still exists in schema but no longer queried. Kept for migration safety |
| `audit_logs` | user_id, action, resource_type, resource_id, details (JSONB), ip_address | Audit trail for key operations |
| `invitation_tokens` | ..., clinician_id | Links invitations to the clinician who created them |
| `app_state` | key (PK), value, updated_at | Generic key/value store. Holds the Cliniko auto-sync cursor `cliniko_patient_last_sync` |
| `service_agreements` | cliniko_patient_id, clinician_id, tier, path, status, token, signed_name/at/ip, agreement_version, stripe_customer_id, stripe_schedule_id, cliniko_attachment_id | Sign-up automation. One row per minted agreement link. See "Service-Agreement → Stripe Automation" below |

### Database patterns

- **Transactions:** use `const client = await db.getClient()` then `client.query('BEGIN')` / `COMMIT` / `ROLLBACK` / `client.release()`. Used in program creation.
- **No joins in patient loading** — `patients.js` fetches patient → programs → exercises → completions in sequential queries (N+1 pattern)
- **Date handling:** use `toLocalDateString()` helper to avoid UTC timezone shifts

## Cliniko Patient Sync

Cliniko is the source of truth for patient demographics. A Moveify patient is **linked** to a
Cliniko record (`users.cliniko_patient_id`) at invite time (clinician picks the Cliniko patient)
or via `POST /api/cliniko/link/:patientId`. Linked patients are then kept fresh automatically.

- **Direction is Cliniko → Moveify only** (read-only against Cliniko). Synced fields:
  `name` (always), `dob`/`sex`/`phone`/`address` (COALESCE — only fill blanks). **Email is
  never synced** — it's the Moveify login credential.
- **Shared logic:** `services/cliniko-sync.js` — `buildPatientFields(cp)` + `applySync(userId, cp)`.
  Used by both the manual per-patient sync (`POST /api/cliniko/sync/:patientId`) and the
  scheduled job, so they behave identically. **Change the mapping here, not in the routes.**
- **Scheduled job:** `jobs/sync-cliniko-patients.js`. Pulls Cliniko patients changed since the
  `app_state.cliniko_patient_last_sync` cursor (`getPatientsUpdatedSince`, paginated) and applies
  only those matching a linked Moveify user. First run (no cursor) fetches each linked patient
  individually to avoid a full-clinic pull. Per-patient failures are caught/counted (no PHI logged).
- **Triggers:**
  - Cloud Scheduler → `POST /api/internal/cron/sync-cliniko-patients` (`routes/internal-cron.js`),
    OIDC-verified (mirrors the billing-worker's `requireOidc`) using `CRON_OIDC_SA` +
    `CRON_OIDC_AUDIENCE`. Mounted **before** the per-IP rate limiter.
  - `POST /api/cliniko/sync-all` (admin) — on-demand run of the same job (testing / manual).
- **Deploy (per environment):** set `CRON_OIDC_SA` + `CRON_OIDC_AUDIENCE` on the Cloud Run
  service, then create the scheduler job. Demographics change rarely, so it runs **twice
  daily** (12-hourly) rather than continuously — keep it low to conserve Cliniko API quota:
  ```
  gcloud scheduler jobs create http moveify-sync-cliniko-patients \
    --location=australia-southeast1 --schedule="0 */12 * * *" --time-zone="Australia/Sydney" \
    --uri="<BACKEND_URL>/api/internal/cron/sync-cliniko-patients" --http-method=POST \
    --oidc-service-account-email="<CRON_OIDC_SA>" --oidc-token-audience="<BACKEND_URL>"
  ```
  Use the `moveify-backend-staging` URL for staging and `moveify-backend` URL for prod.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `DATABASE_URL` | Yes (local) | — | PostgreSQL connection string (local dev) |
| `INSTANCE_CONNECTION_NAME` | Yes (GCP) | — | Cloud SQL socket path (production) |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Yes (GCP) | — | Cloud SQL credentials (production) |
| `FIREBASE_PROJECT_ID` | **Yes** | — | GCP Identity Platform project (`moveify-app`). Used by `firebase-admin` to verify ID tokens. |
| `FIREBASE_CLIENT_EMAIL` | **Yes** | — | Identity Platform service-account email |
| `FIREBASE_PRIVATE_KEY` | **Yes** | — | Identity Platform service-account private key (`\n`-escaped; deploy via `--env-vars-file` YAML) |
| `JWT_SECRET` | Legacy | — | HS256 signing key for the **legacy** JWT fallback only. Still required until Phase 4 removes the dual-mode path. ID-token sessions don't use it. |
| `CORS_ORIGIN` | Yes (prod) | `http://localhost:5173` (dev) | Allowed frontend origin. **No wildcard in production.** |
| `FRONTEND_URL` | No | `http://localhost:5173` | Used in invitation/reset email links |
| `GOOGLE_CLIENT_ID` | No | — | Gmail API OAuth client ID (emails fail silently without it) |
| `GOOGLE_CLIENT_SECRET` | No | — | Gmail API OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | No | — | Gmail API OAuth refresh token |
| `EMAIL_FROM` | No | `ryan@moveifyhealth.com` | Sender email address |
| `CLINIKO_API_KEY` | No | — | Cliniko API key. Deployed services run `NODE_ENV=production`, so this is the var the code reads (the `CLINIKO_API_KEY_STAGING` fallback is local-dev only). On Cloud Run (prod **and** staging) it sources from the **`CLINIKO_API_KEY_ADMIN`** Secret Manager secret. `.trim()`-ed in code to survive trailing newlines. Cliniko integration disabled if unset. |
| `CLINIKO_SUBDOMAIN` | No | — | Cliniko shard subdomain (e.g. `au1`) for the API base URL |
| `CRON_OIDC_SA` | No (prod for auto-sync) | — | Service-account email allowed to call `/api/internal/cron/*` (Cloud Scheduler caller). Cron 503s if unset. |
| `CRON_OIDC_AUDIENCE` | No (prod for auto-sync) | — | Expected OIDC `aud` for cron calls = this service's Cloud Run URL. Cron 503s if unset. |
| `AGREEMENT_AUTOMATION_ENABLED` | No | `false` | Feature flag for the service-agreement → Stripe sign-up flow. `'true'` enables `POST /api/agreements/generate` + `/:token/sign`. **Enabled in prod since 2026-06-02.** |
| `BILLING_WORKER_URL` | No (agreement flow) | — | Base URL of `moveify-billing-worker`. Backend calls its `/admin/agreements/checkout-setup` to open the Stripe setup Checkout. |
| `BILLING_ADMIN_TOKEN` | No (agreement flow) | — | `X-Admin-Token` for the worker admin call. Sources from the `billing_admin_token` Secret Manager secret. |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_API_URL` | No | `http://{hostname}:3000/api` | Backend API URL (dynamic hostname fallback in `config.ts`) |
| `VITE_FIREBASE_API_KEY` | **Yes** | — | Identity Platform web API key (login fails without it) |
| `VITE_FIREBASE_AUTH_DOMAIN` | **Yes** | — | `moveify-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | **Yes** | — | `moveify-app` |

## Known Technical Debt

- **No error boundaries** for API failures — only React render errors caught by `ErrorBoundary.tsx`

## Important Notes

- The app is a **SPA with client-side routing** — all routes rewrite to index.html (configured in vercel.json)
- The exercise library has 100+ built-in exercises in `data/exercises.ts` — clinicians can also create custom exercises
- Page layouts should use `h-screen` with flex containers for proper scrolling
- Tests use **Vitest** — backend tests in `backend/tests/*.test.mjs`, frontend tests colocated (e.g., `src/utils/api.test.ts`)

## Privacy & Compliance (Australian Privacy Act 1988)

Moveify stores **sensitive health information** (patient demographics, conditions, pain scores, exercise completions, daily wellness check-ins). This carries legal obligations under Australian law. When writing code that touches patient data, always consider these requirements.

### Key rules

- Moveify is fully covered by the Privacy Act and all 13 APPs (health data = sensitive information, no small business exemption for health service providers)
- **Do not move Cloud SQL to a non-Australian region** without legal review (data must stay in `australia-southeast1`)
- Compliance docs: `docs/breach-response-plan.md`, `docs/data-retention-policy.md`
- Privacy policy at `/privacy-policy`, data export/deletion feature exists, health data consent on signup

### Remaining compliance gap

- **IAM permissions not yet reviewed** for least-privilege

### Development guidelines

- **Never log patient health data** (pain scores, conditions, check-in responses) to console or files — use anonymized IDs only
- **Never expose health data in URLs** (query params, path segments)
- **Always validate authorization** before returning patient data — a patient must only see their own data; any clinician can access any patient
- **Treat all patient-facing endpoints as security-critical** — validate input, sanitize output, check roles
- **Do not add analytics, tracking, or third-party scripts** that could access patient health data without explicit legal review

## Clinic Website

The marketing site at **https://www.moveifyhealth.com** lives on its own orphan-style branch `clinic-website` (not on `dev` or `main`). It is a static Tailwind site deployed by Vercel, separate from the patient app.

**To work on it:** use the existing git worktree at `../moveify-clinic-website` (sibling to this repo). Editing the `clinic-website/` directory on `dev` will not affect the live site — that directory on `dev` is empty/stale by design.

- Homepage HTML: `clinic-website/tailwind css template/index.html`
- Privacy policy: `clinic-website/tailwind css template/privacy-policy.html`
- Copy reference doc: `clinic-website/COPY.md` (canonical source for homepage copy rewrites)
- Vercel config: `clinic-website/vercel.json` (routes `/(.*)` → `tailwind css template/$1`)

**Deploy:** push to `origin/clinic-website` → Vercel auto-deploys. No backend redeploy needed.

If the worktree is missing, recreate with: `git worktree add ../moveify-clinic-website clinic-website`

## Workflow

### Keeping context fresh (avoid doc drift)

`docs/worklog.md` is a dated, reverse-chronological log of **notable** changes
(migrations, new/removed env vars, auth/security/schema changes — anything that
makes this file or a prior assumption stale). It exists because `CLAUDE.md` once
drifted badly (described custom-JWT auth long after the Identity Platform migration).

- **At session start:** skim the top entries of `docs/worklog.md` for recent context.
- **When a change alters how the system works** (not a plain bug fix): add a dated
  entry to `docs/worklog.md` **and** update the affected `CLAUDE.md` section **in the
  same commit**. Treat a contradiction between code and `CLAUDE.md` as a bug to fix,
  not to work around.
- Keep it lean — don't log routine fixes or anything git history already captures.

### Branches

- **`dev`** — active development branch. Push here for staging. Vercel auto-deploys a preview URL; backend targets `moveify-backend-staging` + `moveify_staging` DB.
- **`main`** — production. Only merge `dev → main` when ready to release.

**⚠ Default push target is `dev`. Never push directly to `main` unless explicitly asked.**

### Daily workflow (dev branch)

1. Use `/commit-commands:commit` to create the commit
2. **Immediately** run `git push origin dev`
3. Vercel preview auto-deploys. Never leave commits unpushed.

**Backend changes on dev:** redeploy staging:
```
gcloud run deploy moveify-backend-staging --source backend/ --region australia-southeast1 --platform managed --allow-unauthenticated --add-cloudsql-instances moveify-app:australia-southeast1:moveify-db
```

**Billing worker changes:** deploy directly (no staging variant exists yet):
```
gcloud run deploy moveify-billing-worker --source ./billing-worker --region australia-southeast1 --platform managed --allow-unauthenticated
```
After secret rotations or refresh-token updates, force a cold start so cached values reload:
```
gcloud run services update moveify-billing-worker --region australia-southeast1 --update-env-vars BUMP=$(date +%s)
```

### Merging dev → main (production release)

Before merging, verify:
1. **DB migrations** — if the change adds/alters schema, run the migration on production Cloud SQL *before* deploying the backend
2. **New env vars** — add any new env vars to the production Cloud Run service *before* deploying
3. **Breaking API changes** — redeploy production backend *before* merging (frontend deploys instantly on merge)

Then:
```
git checkout main && git merge dev && git push origin main
```
Then redeploy production backend if `backend/` changed:
```
gcloud run deploy moveify-backend --source backend/ --region australia-southeast1 --platform managed --allow-unauthenticated --add-cloudsql-instances moveify-app:australia-southeast1:moveify-db
```
If `gcloud auth` has expired, run `gcloud auth login` first.

**Android app changes:** After frontend changes that should be reflected in the Android app, rebuild:
```
cd frontend && npm run build:android
```
Then rebuild the APK/AAB via Android Studio or Gradle for testing/submission.

## Business & Compliance Context (vault)

Strategy, pricing, billing design, and compliance docs live in the executive-assistant
vault at `C:\Users\dilig\Documents\executive-assistant` (read-only from here; it is
PHI-free and secret-free by rule, so safe to read). Start at the index and read on
demand — don't bulk-load (some docs are long):

  `C:\Users\dilig\Documents\executive-assistant\20-Projects\Moveify-App\Context Index for Code Sessions.md`

The index maps "working on X → read Y". Consult it when touching:
- **billing/claims** — billing-worker, Stripe/Tyro/Xero, P&P fees, pricing tiers
- **patient-facing legal copy** — `TermsPage.tsx`, privacy, consent, cancellation/refund wording
- **clinic-website** marketing copy

The vault is authoritative for *intent/rationale*; the repo is authoritative for *code*.
Don't copy vault content into the repo — link by path. Flag any code↔vault mismatch.
(The vault dir is granted read access via `permissions.additionalDirectories` in
`.claude/settings.local.json`.)
