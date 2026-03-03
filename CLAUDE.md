# Moveify - Clinical Exercise Program Builder

## Project Overview

Moveify is a clinical exercise prescription and patient management platform (similar to Physitrack, VALD MoveHealth). It enables clinicians to build exercise programs and assign them to patients, who can then log completions, track progress, and complete daily wellness check-ins.

## Architecture

**Monorepo** with two directories:

- `frontend/` — React 19 + TypeScript + Vite SPA
- `backend/` — Node.js + Express + PostgreSQL API

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
- **bcrypt** for password hashing
- **jsonwebtoken** for JWT authentication
- **express-rate-limit** for brute force protection
- **helmet** for security headers
- **Gmail API** for transactional emails
- **PM2** for process management in production

### Deployment

- Frontend: **Vercel** (vite build → `dist/`)
- Backend: **GCP Cloud Run** (Docker container) + **Cloud SQL PostgreSQL** (`australia-southeast1`)
- Environment variable `VITE_API_URL` points frontend to backend (falls back to `localhost:3000`)
- Cloud Run connects to Cloud SQL via Unix socket (`/cloudsql/{INSTANCE_CONNECTION_NAME}`)
- `backend/Dockerfile` builds the container; `backend/database/db.js` switches between Cloud SQL socket and `DATABASE_URL` based on env vars

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
├── utils/api.ts         # Fetch wrapper with retry logic, JWT token management, auth headers
├── data/exercises.ts    # Default exercise database
├── config.ts            # API URL configuration
└── main.tsx             # Entry point

backend/
├── middleware/
│   ├── auth.js          # JWT verify, role check, token generation
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

- All API calls use `getAuthHeaders()` from `utils/api.ts` which attaches the JWT Bearer token
- `utils/api.ts` also provides retry logic with exponential backoff, token management (`getToken`, `setToken`, `clearAuth`), and automatic 401 handling (clears auth + redirects to login)
- API base URL comes from `config.ts` — never hardcode URLs
- Backend endpoints follow REST: `GET/POST/PUT/PATCH/DELETE /api/{resource}`
- **Never pass `clinicianId` or `patientId` in request bodies for identity** — the backend derives these from the JWT token via `req.user.id`

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

Equipment values: `Bodyweight`, `Dumbbells`, `Barbell`, `Resistance Band`, `Machine`, `Kettlebell`, `Medicine Ball`, `Foam Roller`, `Stability Ball`, `Support`

Exercise planning doc: `docs/exercise-plan.md`

## Domain Model

Key entities and their relationships:

- **Patient** — has demographics (name, DOB, condition, contact info), has many AssignedPrograms
- **AssignedProgram** — has ProgramConfig (dates, frequency, duration) and many ProgramExercises
- **Exercise** — defined by name, joint area, muscle group, equipment, difficulty, video URL
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

### Authentication (JWT)

1. **Login:** `POST /api/auth/login` → returns `{ user, token }` → token stored in `localStorage` (`moveify_token`), user stored in `moveify_user`
2. **Session restoration:** On page load, App.tsx reads token from localStorage and calls `GET /api/auth/me` to validate. If valid, session is restored without re-login.
3. **Token format:** JWT signed with `JWT_SECRET`, payload `{ id, role, email, is_admin }`, default expiry `7d`
4. **All authenticated requests** include `Authorization: Bearer <token>` header via `getAuthHeaders()` from `utils/api.ts`
5. **401 handling:** If any API call returns 401, `utils/api.ts` automatically clears localStorage and redirects to login
6. **Invitation:** clinician generates invite (requires auth) → creates user row with `password_hash = NULL` → patient receives email link → sets password via `/setup-password`
7. **Password reset:** `POST /api/auth/forgot-password` → token (1hr expiry) → email link → `POST /api/auth/reset-password`

### Authorization (middleware)

All backend routes (except public auth routes) are protected by middleware in `backend/middleware/`:

- **`authenticate`** — verifies JWT token, sets `req.user = { id, role, email, is_admin }`
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

### Database patterns

- **Transactions:** use `const client = await db.getClient()` then `client.query('BEGIN')` / `COMMIT` / `ROLLBACK` / `client.release()`. Used in program creation.
- **No joins in patient loading** — `patients.js` fetches patient → programs → exercises → completions in sequential queries (N+1 pattern)
- **Date handling:** use `toLocalDateString()` helper to avoid UTC timezone shifts

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `DATABASE_URL` | Yes (local) | — | PostgreSQL connection string (local dev) |
| `INSTANCE_CONNECTION_NAME` | Yes (GCP) | — | Cloud SQL socket path (production) |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Yes (GCP) | — | Cloud SQL credentials (production) |
| `JWT_SECRET` | **Yes** | — | JWT signing key (min 32 random chars). Server will not start without it. |
| `JWT_EXPIRY` | No | `7d` | JWT token expiration |
| `CORS_ORIGIN` | Yes (prod) | `http://localhost:5173` (dev) | Allowed frontend origin. **No wildcard in production.** |
| `FRONTEND_URL` | No | `http://localhost:5173` | Used in invitation/reset email links |
| `GOOGLE_CLIENT_ID` | No | — | Gmail API OAuth client ID (emails fail silently without it) |
| `GOOGLE_CLIENT_SECRET` | No | — | Gmail API OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | No | — | Gmail API OAuth refresh token |
| `EMAIL_FROM` | No | `ryan@moveifyhealth.com` | Sender email address |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_API_URL` | No | `http://{hostname}:3000/api` | Backend API URL (dynamic hostname fallback in `config.ts`) |

## Known Technical Debt

- **N+1 queries** in `patients.js` patient loading — no SQL joins used
- **No error boundaries** for API failures — only React render errors caught by `ErrorBoundary.tsx`
- **No test framework** — when adding tests, prefer Vitest (matches Vite ecosystem)

## Important Notes

- The app is a **SPA with client-side routing** — all routes rewrite to index.html (configured in vercel.json)
- The exercise library has 25+ built-in exercises in `data/exercises.ts` — clinicians can also create custom exercises
- Page layouts should use `h-screen` with flex containers for proper scrolling (see recent git history for scroll fixes)

## Privacy & Compliance (Australian Privacy Act 1988)

Moveify stores **sensitive health information** (patient demographics, conditions, pain scores, exercise completions, daily wellness check-ins). This carries legal obligations under Australian law. When writing code that touches patient data, always consider these requirements.

### Why the Privacy Act applies

- Health data is classified as **"sensitive information"** under the Privacy Act — the highest protection tier
- **Health service providers are NOT exempt** from the Privacy Act regardless of revenue (the normal $3M small business exemption does not apply to health service providers — Privacy Act s6D(4))
- Australia has **no controller/processor distinction** (unlike GDPR). Any entity that *holds* personal information is an APP entity with full obligations. This means both the clinics using Moveify AND Moveify as the platform are almost certainly covered, since Moveify holds the data
- **Conservative position:** treat Moveify as fully covered by the Privacy Act and all 13 APPs. Consult a privacy lawyer to confirm the exact classification

### Key obligations (Australian Privacy Principles)

| APP | Requirement | What it means for Moveify |
|-----|-------------|---------------------------|
| **APP 3** | Collection — only collect sensitive info with consent and if reasonably necessary | Must have explicit consent flow; don't collect health data beyond what's needed |
| **APP 5** | Notification — tell individuals what you collect, why, and who gets it | Requires a privacy policy displayed in-app |
| **APP 6** | Use & disclosure — only for the primary purpose it was collected for | Don't repurpose patient health data (e.g., analytics, marketing) without consent |
| **APP 8** | Cross-border disclosure — accountable if overseas recipient mishandles data | Data is in `australia-southeast1` (Sydney) so this is currently a non-issue. **Do not move Cloud SQL to a non-Australian region without legal review** |
| **APP 11** | Security — take "reasonable steps" to protect from misuse, loss, unauthorized access | Encryption at rest/transit (Cloud SQL + Cloud Run defaults), access controls, bcrypt hashing, patching |
| **APP 12** | Access — individuals can request access to their data | Need a data export/access mechanism |
| **APP 13** | Correction — individuals can request correction of their data | Need ability for patients to request corrections |

### Notifiable Data Breaches (NDB) scheme

If a breach is **likely to cause serious harm**:
1. **Assess** within **30 calendar days** of becoming aware (s26WH)
2. **Notify the OAIC and all affected individuals** "as soon as practicable" after forming a reasonable belief the breach is eligible (s26WK, s26WL) — there is no fixed day count, but the OAIC enforces this strictly
3. Health sector is the #1 reported breach category (~20% of all NDB notifications)

### Current technical safeguards (in place)

- Encryption at rest (Cloud SQL default) and in transit (HTTPS/TLS on Cloud Run)
- Automated daily backups with 7-day retention
- Data stored in `australia-southeast1` — no cross-border transfer
- Non-root Docker container, no hardcoded credentials
- Passwords hashed with bcrypt
- **JWT authentication** on all API routes with role-based authorization
- **Admin-gated destructive actions** — only admin clinicians can delete patients
- **Patients can only access their own data** via self-access checks
- **Rate limiting** on auth endpoints (10 req/15min) and general API (100 req/min)
- **Security headers** via helmet (CSP, X-Frame-Options, etc.)
- **CORS hardened** — no wildcard in production
- **Audit logging** of key operations (login, patient access, program CRUD, completions, check-ins)
- **No public signup** — users created via clinician invitation only
- **Input validation** — email format, password minimum length
- **Explicit health data consent** — required checkbox during patient signup (APP 3), stored with timestamp and version in `users` table

### Known compliance gaps (TODO)

- ~~**No privacy policy** displayed in-app (APP 1, APP 5)~~ — **DONE:** `/privacy-policy` public route, linked from login and setup-password pages
- **No data export or deletion** feature for patients (APP 12, APP 13, APP 11)
- **No documented breach response plan** (NDB scheme)
- **No data retention policy** — APP 11 requires destroying data no longer needed
- **IAM permissions not yet reviewed** for least-privilege

### Development guidelines

- **Never log patient health data** (pain scores, conditions, check-in responses) to console or files — use anonymized IDs only
- **Never expose health data in URLs** (query params, path segments)
- **Always validate authorization** before returning patient data — a patient must only see their own data; any clinician can access any patient
- **Treat all patient-facing endpoints as security-critical** — validate input, sanitize output, check roles
- **Do not add analytics, tracking, or third-party scripts** that could access patient health data without explicit legal review

## Workflow

- **Always commit and push** after completing a task. Don't wait for the user to ask.

## Plugins

When using Claude Code with this project, the following plugins are recommended:

- `frontend-design` — for generating UI components and layouts. Use when building new pages, redesigning existing views, or creating component mockups.
- `commit-commands` — for streamlined git workflows. Use `/commit-commands:commit` for commits.
