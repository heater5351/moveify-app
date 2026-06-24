# Backend API Routes

All routes are prefixed with `/api`. Routes marked with a lock require authentication.

## Public routes (no auth required)
| Route file | Endpoints |
|-----------|--------|
| `auth.js` | `POST /forgot-password` (login is client-side via the Firebase SDK — no `POST /login`) |
| `invitations.js` | `GET /validate/:token`, `POST /set-password` |

## Protected routes (require JWT)
| Route file | Prefix | Key endpoints | Auth |
|-----------|--------|---------------|------|
| `auth.js` | `/api/auth` | `GET /me` | Any authenticated user |
| `invitations.js` | `/api/invitations` | `POST /generate` | Clinician only |
| `patients.js` | `/api/patients` | `GET /` (all patients), `GET /:id`, `DELETE /:id` | Clinician (DELETE = admin only) |
| `patients.js` | `/api/patients` | `GET /adherence-summary?days=14` (Dashboard: one compact adherence row per active-program patient — completion %, days-since-activity, high-pain flag, status. Computed via `services/adherence.js`. **Registered before `/:patientId`.**) | Clinician only |
| `patients.js` | `/api/patients` | `GET/POST/PUT/DELETE /:patientId/contacts[/:linkId]` — link/unlink directory contacts to a patient (`patient_contacts`). POST links an existing `{contactId}` or create-and-links `{contact:{…}}`, plus `{relationship, isReportRecipient, isEmergency}`. Setting `isReportRecipient` clears any prior one in a tx (partial-unique index). | Clinician only |
| `contacts.js` | `/api/contacts` | `GET /?q=&type=` (directory search), `POST /`, `GET /:id` (+ linked patients), `PUT /:id`, `DELETE /:id` (cascades `patient_contacts`). Shared clinic-wide contacts directory; audit-logged; never logs PII. | Clinician only |
| `programs.js` | `/api/programs` | `POST /patient/:patientId`, `PUT /:programId`, `DELETE /:programId`, `GET /:programId/revisions` | Clinician only |
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
| `agreements.js` | `/api/agreements` | `GET /validate/:token`, `POST /:token/sign`, `GET /:token/pdf` (printable PDF — unsigned preview while pending, signed copy once signed) | Public (token-gated, rate-limited) |
| `scribe-soap-notes.js` | `/api/scribe/sessions` | `POST /:id/soap-note/generate` (body `useHistory`, default true — injects rolling patient summary + last completed note as context-only prompt block via `buildSoapUserMessage` in `services/scribe-llm.js`), transcript/note CRUD | Clinician only |
| `scribe-handout.js` | `/api/scribe/sessions` | `POST /:id/handout/generate` (objective findings table is built from the session's tap-captured `scribe_session_measurements` via `measurement-render.js` `renderMeasurementsForHandout` — authoritative, age/sex-grounded, **replaces** the transcript extraction; falls back to transcript-only `extractFindings` when no structured findings exist. Narrative sections still come from the transcript), `POST /:id/handout/docx` | Clinician only (ephemeral, audit only) |
| `scribe-reassessment.js` | `/api/scribe/sessions` | `POST /:id/reassessment/{generate,regrade,narrative,docx}` | Clinician only (baseline vs latest comparison; `audience` 'patient'\|'gp' + docx `variant`; `generate` takes optional `previousReportText` + optional `baselineSessionId`; ephemeral, audit only) |
| `scribe-mrss.js` | `/api/scribe/sessions` | `POST /:id/mrss/{generate,docx}` (Melbourne ACL Return-to-Sport Score /100). Body `{involvedSide, involvedIsDominant}` — the involved limb is a scoring-time param (LSI = involved ÷ uninvolved × 100), not a stored field. **Recomputed from the session's stored components** (`scribe_session_measurements` + the IKDC PROM) via pure `services/mrss-scoring.js` + `data/mrss-protocol.json` (Part A grade→points maps + LSI→points table); DOCX via `services/mrss-docx.js` (programmatic, no template). Pass = total > 95 AND two clinician-attested criteria. **Ephemeral — no DB write/migration, audit only.** UI: `MrssPanel.tsx` from `ScribeReportsPage`. | Clinician only |
| `scribe-documents.js` | `/api/scribe/documents` | `POST /extract` (PDF/DOCX/TXT → text, multer in-memory) | Clinician only (ephemeral, nothing stored/logged) |
| `scribe-measurements.js` | `/api/scribe` | `GET /assessment-catalog`; per-session `GET`/`POST` (upsert) / `DELETE /sessions/:id/measurements/...` (tap-captured ROM/strength/balance → `scribe_session_measurements`; measure keys aligned to `normative-data.json` so values are graded deterministically via `interpretByKey` into the SOAP `OBJECTIVE MEASUREMENTS` block); `GET /patients/:patientId/measurements` (longitudinal trend series for the patient-profile Assessments tab, via `services/measurement-series.js`) | Clinician only |
| `scribe-proms.js` | `/api/scribe` | `GET /prom-catalog`; session `POST`/`GET /sessions/:id/outcomes`; `GET /patients/:id/outcomes`; `POST /kiosk-pin`(set) `GET /kiosk-pin`(isset) `POST /kiosk-pin/verify`. Patient-completed PROMs (NPRS/PSFS) via the kiosk → scored server-side (`services/prom-scoring.js`), responses **encrypted** in `scribe_session_outcomes`, score+band into the SOAP `PATIENT-REPORTED OUTCOME MEASURES` block. Kiosk-exit PIN scrypt-hashed in `clinician_preferences.kiosk_pin_hash` | Clinician only (kiosk runs as the clinician; PIN gates exit) |
