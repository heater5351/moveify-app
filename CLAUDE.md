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
- **React Router DOM 7** for client-side routing
- **@dnd-kit** for drag-and-drop (program builder exercise reordering)
- **Lucide React** for icons

### Backend Stack

- **Express 4** (CommonJS, not ESM)
- **PostgreSQL** via `pg` driver (no ORM)
- **bcrypt** for password hashing
- **Resend** for transactional emails
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
├── utils/api.ts         # Fetch wrapper with retry logic
├── data/exercises.ts    # Default exercise database
├── config.ts            # API URL configuration
└── main.tsx             # Entry point
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

### API Integration

- All API calls go through `utils/api.ts` which provides retry logic with exponential backoff
- API base URL comes from `config.ts` — never hardcode URLs
- Backend endpoints follow REST: `GET/POST/PUT/PATCH/DELETE /api/{resource}`

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

## Important Notes

- The app is a **SPA with client-side routing** — all routes rewrite to index.html (configured in vercel.json)
- No test framework is set up yet — when adding tests, prefer Vitest (matches Vite ecosystem)
- The exercise library has 25+ built-in exercises in `data/exercises.ts` — clinicians can also create custom exercises
- Page layouts should use `h-screen` with flex containers for proper scrolling (see recent git history for scroll fixes)
- Auth is session-based with role checking — always handle both clinician and patient views when modifying shared components

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

### Known compliance gaps (TODO)

- **No privacy policy** displayed in-app (APP 1, APP 5)
- **No explicit consent flow** for health data collection at signup (APP 3)
- **No audit logging** of who accessed/modified patient records (APP 11)
- **No data export or deletion** feature for patients (APP 12, APP 13, APP 11)
- **No documented breach response plan** (NDB scheme)
- **No data retention policy** — APP 11 requires destroying data no longer needed
- **IAM permissions not yet reviewed** for least-privilege

### Development guidelines

- **Never log patient health data** (pain scores, conditions, check-in responses) to console or files — use anonymized IDs only
- **Never expose health data in URLs** (query params, path segments)
- **Always validate authorization** before returning patient data — a patient must only see their own data, a clinician only their own patients
- **Treat all patient-facing endpoints as security-critical** — validate input, sanitize output, check roles
- **Do not add analytics, tracking, or third-party scripts** that could access patient health data without explicit legal review

## Workflow

- **Always commit and push** after completing a task. Don't wait for the user to ask.

## Plugins

When using Claude Code with this project, the following plugins are recommended:

- `frontend-design` — for generating UI components and layouts. Use when building new pages, redesigning existing views, or creating component mockups.
- `commit-commands` — for streamlined git workflows. Use `/commit-commands:commit` for commits.
