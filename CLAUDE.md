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
- `billing-worker/` — separate Cloud Run service consuming Stripe webhooks and Tyro CSVs, writing to Xero. See `docs/billing-worker.md` (also `billing-worker/HANDOVER.md`).
- `clinic-website/` — marketing site (independent). **Source lives on the `clinic-website` branch, NOT `dev`/`main`.** See `docs/clinic-website.md`.

### Frontend Stack

- **React 19** with TypeScript 5.9, **Vite 7**
- **Tailwind CSS 4** (utility-first, `@theme` tokens in `src/index.css`, no `tailwind.config.js`, no CSS modules or styled-components)
- **React Router DOM 7** for public routes only (login, setup-password, reset-password)
- **@dnd-kit** for drag-and-drop (program builder exercise reordering), **Lucide React** for icons

### Backend Stack

- **Express 4** (CommonJS, not ESM), **PostgreSQL** via `pg` driver (no ORM)
- **firebase-admin** for GCP Identity Platform token verification (sole auth — legacy JWT/bcrypt removed Phase 4, 2026-06-10)
- **express-rate-limit**, **helmet**, **Gmail API**, **PM2**

### Service-Agreement → Stripe automation

See `docs/agreement-automation.md` (sign-up flow, Stripe Schedules, reconcile sweep, OIDC-audience gotcha). Behind `AGREEMENT_AUTOMATION_ENABLED`. LIVE in prod since 2026-06-02.

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
- **Fonts:** Manrope everywhere (`font-display` and `font-sans` both resolve to Manrope) — matches the printed handout branding in `backend/scripts/handout-kit.js`. (Sora/DM Sans were retired 2026-06-10.)
- Use the Moveify brand color palette defined in the `@theme` block of `frontend/src/index.css` (Tailwind 4 — there is no `tailwind.config.js`):
  - Primary: `primary-400` (teal `#46c1c0`) — buttons, links, accents
  - Secondary: `secondary-500` (navy `#132232`) — headers, dark backgrounds
  - Use semantic scale (`primary-50` through `primary-900`) for variants
- Named brand colors available as `moveify-teal`, `moveify-navy`, `moveify-ocean`, plus handout-palette extensions `moveify-ink`, `moveify-sub`, `moveify-soft`, `moveify-rule`
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

See `docs/exercise-naming.md` (naming pattern `[Modifier] [Movement] with [Equipment]` + equipment values). Match `EQUIPMENT_OPTIONS` in `AddExerciseModal.tsx`.

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

- `'dashboard'` → DashboardPage (clinician landing page — adherence triage overview)
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

See `docs/auth-security.md` (Identity Platform auth flow, shared-email login, authorization middleware, shared access model, security hardening, audit logging). Key invariants:
- `getAuthHeaders()` is **async** — always `await` it.
- Never trust client-supplied IDs for identity — use `req.user.id`.
- All clinicians see all patients (no per-clinician ownership filtering); `clinician_id` is audit-only.

## Backend API Routes

See `docs/api-routes.md` (full route table by file). All routes prefixed with `/api`. Public routes: `auth.js` (`POST /forgot-password`), `invitations.js` (`GET /validate/:token`, `POST /set-password`). Everything else requires auth.

## Database Schema

See `docs/database-schema.md` (full table reference + transaction/date-handling patterns). Schema defined in `backend/database/init.js`. Note: `users.email` is **not unique** (identity is `firebase_uid`); `programs.frequency` is a JSON string.

## Cliniko Patient Sync

See `docs/cliniko-sync.md` (sync direction, scheduled job, deploy). Cliniko is source of truth for demographics; direction is Cliniko → Moveify only; email is never synced.

## Environment Variables

See `docs/environment-variables.md` (backend `backend/.env` + frontend `frontend/.env` tables).

## Privacy & Compliance (Australian Privacy Act 1988)

See `docs/privacy-compliance.md` (key rules, compliance docs, development guidelines). Moveify stores sensitive health information — never log patient health data; data must stay in `australia-southeast1`; compliance docs in `docs/breach-response-plan.md` + `docs/data-retention-policy.md`.

## Clinic Website

See `docs/clinic-website.md` (lives on `clinic-website` branch, worktree at `../moveify-clinic-website`, deployed by Vercel).

## Deployment & Workflow

See `docs/deployment-workflow.md` (Vercel/Cloud Run deploy, Android build, branches, daily workflow, dev→main merge, gcloud commands, vault context).

### Branches (quick reference)

- **`dev`** — active development → staging. **Default push target. Never push directly to `main` unless explicitly asked.** Staging auth is a separate Firebase project (`moveify-staging`), isolated from prod.
- **`main`** — production. Merge `dev → main` only when ready to release.

## Known Technical Debt

- **No error boundaries** for API failures — only React render errors caught by `ErrorBoundary.tsx`

## Important Notes

- The app is a **SPA with client-side routing** — all routes rewrite to index.html (configured in vercel.json)
- The exercise library has 100+ built-in exercises in `data/exercises.ts` — clinicians can also create custom exercises
- Page layouts should use `h-screen` with flex containers for proper scrolling
- Tests use **Vitest** — backend tests in `backend/tests/*.test.mjs`, frontend tests colocated (e.g., `src/utils/api.test.ts`)
