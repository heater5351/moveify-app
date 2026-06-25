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

## 2026-06-25 — NDIS EP price cap lowered to $161.99/hr

- **What:** NDIA reduced the Exercise Physiology maximum price limit from $166.99 → **$161.99/hr**.
  `NDIS_RATE_CAP_CENTS` is now `16199` in `backend/lib/ndis-agreement-content.js` (single source of
  truth — the `/agreements/generate` route validation + its error message derive from it). Also updated
  the frontend mirror + prefilled default in `GenerateAgreementModal.tsx` and the legacy `ndis-rtwsa.js` rate.
- **Why:** new NDIS Pricing Arrangements price limit for Exercise Physiology.
- **To know:** the agreement clause wording doesn't embed the dollar figure (it only states "does not
  exceed the NDIS price limit"), so `NDIS_AGREEMENT_VERSION` was deliberately **not** bumped.
- **Open follow-ups:** existing signed NDIS agreements locked at $166.99 may need re-issuing/amending for
  claims on/after the effective date; vault "NDIS EP Billing Reference" still cites $166.99; billing-worker
  not yet redeployed (its NDIS rate lives in the inert `ndis-rtwsa.js` job).
- Shipped to prod 2026-06-25 (backend rev `moveify-backend-00112-2m8` + Vercel frontend).

## 2026-06-24 — Stripe resolver validates metadata.cliniko_id (household mislink fix)

- **What:** `resolveClinikoPatient` (billing-worker `jobs/stripe-handler.js`) no longer
  blindly trusts `customer.metadata.cliniko_id`. It checks that id's contact name
  token-matches the Stripe customer name; on mismatch it ignores the cached id,
  re-resolves by name, and raises a `stripe_metadata_name_mismatch` reconciliation flag.
- **Why:** a shared household email cached the wrong patient's id onto a Stripe customer,
  so one spouse's monthly DD booked entirely onto the other's Xero contact (Heath, June).
- **Also:** extracted pure `assertNumericClinikoId` in `services/stripe.js` and rewrote
  `tests/stripe-guards.test.mjs` to test it directly — the old test reached
  `stripe.customers.create()` and created LIVE customers when run with secrets.
- **To know:** takes effect on the next **billing-worker redeploy** (currently deferred).

## 2026-06-24 — Shared contacts directory + GP-letter auto-fill

- **What:** a clinic-wide **Contacts** directory (new top-level tab, `currentPage === 'contacts'`)
  of reusable contacts — GPs, specialists, NDIS support coordinators, parents/guardians — linked
  **many-to-many** to patients. Supersedes the flat `emergency_contact_*` / `referring_gp` fields
  added 2026-06-23 (kept nullable/deprecated, **not dropped**; no longer surfaced or written).
- **Why:** contacts are inherently shared (one GP refers many patients) and one-to-many per
  patient; flat columns forced re-typing and couldn't model NDIS coordinators. Also wires the GP
  reassessment letter's recipient block to the patient's flagged **report-recipient** GP.
- **Schema (additive, idempotent in `init.js`):** `contacts` (directory) + `patient_contacts`
  (join: `relationship`, `is_report_recipient`, `is_emergency`, `UNIQUE(patient_id, contact_id)`)
  with a **partial-unique index** `(patient_id) WHERE is_report_recipient` (one recipient GP per
  patient). No drops.
- **Backend:** `routes/contacts.js` (directory CRUD, clinician-only, audit-logged, never logs
  PII); patient-link endpoints `GET/POST/PUT/DELETE /api/patients/:patientId/contacts` in
  `patients.js` (report-recipient swap done in a tx to respect the partial-unique index). GP
  auto-fill: `routes/scribe-reassessment.js` bases `result.meta` on the report-recipient GP,
  overlaying any uploaded-report fields — precedence extracted to pure, unit-tested
  `services/contact-letter-meta.js` (`backend/tests/contact-letter-meta.test.mjs`).
- **Frontend:** Contacts tab + `ContactsDirectory.tsx` + `ContactModal.tsx`; per-patient
  **Contacts tab** on the profile (`PatientContacts.tsx`); Overview emergency + referring-GP now
  derive from links; flat fields removed from `EditPatientModal.tsx`. New `utils/contacts-api.ts`.
- **Security:** new PHI/third-party-PII surface — clinician-only, parameterized queries, IDs
  validated, link mutations scoped by `patient_id`, no contact PII in logs. Stays in
  `australia-southeast1` Postgres.
- **Deploy:** additive migration runs at backend boot. **`moveify-backend-staging` must be
  redeployed** for the new endpoints + tables before the dev-branch Vercel preview works. No new
  env vars. Built on `dev` (not yet on `main`/prod).

## 2026-06-23 — GP reassessment report: new hand-maintained template + tokens

- **Replaced `backend/assets/GP_Reassessment_Template.docx`** with Ryan's hand-edited
  version. The cover-letter prose and the clinician sign-off (name/quals/phone/email) are
  now **baked into the template**, so those tokens (`cover_letter`, `clinician_*`) are gone.
- **New tokens wired** in `services/scribe-gp-reassessment-docx.js`: `practice_email`,
  `patient_first_name` (split from the full name), `appointment_date` (defaults to the
  reassessment date), and `initial_assessment_date` / `reassessment_date` (rename of
  `baseline_date` / `latest_date`).
- **Frontend (`GPReassessmentPreview.tsx`):** added a Practice-email input; removed the
  now-dead Cover-Letter textarea (prose lives in the template). `extractLetterMeta`
  (`scribe-llm.js`) + the `meta` type now also pull the practice email from an uploaded
  prior report.
- **Know now:** the template is **maintained by hand** — edit `GP_Reassessment_Template.docx`
  directly (don't run `scripts/build-gp-reassessment-template.js`; it's flagged SUPERSEDED).

## 2026-06-23 — Split CLAUDE.md into lean root + docs/ reference files (progressive disclosure)

- **`CLAUDE.md` cut from 595 → 230 lines** (~61% smaller). Detail sections moved verbatim
  into `docs/` reference files read on demand, keeping only what every session needs in the
  root (security warnings, architecture, conventions, nav/state rules, commands, branches).
- **New `docs/` files:** `billing-worker.md`, `agreement-automation.md`, `auth-security.md`,
  `api-routes.md`, `database-schema.md`, `cliniko-sync.md`, `environment-variables.md`,
  `exercise-naming.md`, `privacy-compliance.md`, `clinic-website.md`, `deployment-workflow.md`.
- **Nothing rewritten** — content moved as-is; each root section replaced with a one-line
  pointer + 1-sentence "when to read it". Cross-references between docs updated to new paths
  (e.g. `database-schema.md` points to `docs/auth-security.md` for shared-email login).
- Motivation: reduce per-turn context tokens (CLAUDE.md loads on every message). See the
  "Keeping context fresh" rule — treat a contradiction between code and any of these docs
  as a bug to fix, not to work around.

## 2026-06-23 — Multi-trial averaging + standardized positions for strength tests

- **HHD and grip are noisy single-tap reads — added 2–3 trial capture + server-side
  aggregation.** A measure can now carry `trials` (N attempts) + `aggregate`
  (`mean`/`max`) in `data/assessment-catalog.json`. The capture picker
  (`AssessmentPanel.tsx`) collects the attempts (Add button, running mean, tap-to-
  remove); the **backend recomputes the aggregate** (`services/measurement-trials.js`,
  never trusts the client), stores it in `value`, and keeps the raw trials in the
  existing `detail` JSONB. Applied: HHD + grip → **mean of 3**, hops → mean of 2,
  SEBT → **max of 3**. No schema change; default (no `trials`) = old single-tap.
- **Standardized test positions.** Measures can carry an `instruction` string
  (position / dynamometer placement / make-test) surfaced in the capture picker.
  Authored for every HHD test, grip, the hops and SEBT (positions per Mentiplay/
  ASHT-style protocols; flags belt-fixation for the strong lower-limb tests where
  hand-held under-reads).
- Tests: `measurement-trials.test.mjs`. Backend 238 green.

## 2026-06-22 — Dynamometry, MMT & the Melbourne ACL Return-to-Sport Score (MRSS)

- **Three new assessment families in the scribe Assessment panel**, all driven by
  `data/assessment-catalog.json` + `data/normative-data.json` (the panel UI is
  data-driven, so most of this is JSON, not code):
  - **Joint isometric dynamometry** (HHD): `shoulder_dynamometry`, `hip_dynamometry`,
    `knee_dynamometry` — keypad kg tables.
  - **Manual Muscle Testing** (Oxford 0–5): `shoulder_mmt`/`hip_mmt`/`knee_mmt`/
    `ankle_mmt` — presets 0–5 tables. New `grade` unit (renders with no suffix) added
    to the unit maps in `measurement-render.js`, `normative-data.js`, `AssessmentPanel.tsx`.
  - **MRSS components**: `acl_knee_exam` (effusion/Lachman/pivot toggles +
    extension-deficit), hop tests, `sebt` table, `less_landing` (reuses the instrument
    runner), and a new **IKDC** PROM in `prom-catalog.json` (percentage scoring, 18
    items, sum/87×100 — ⚠ verify against the official sheet before go-live).
  - All new measures graded **by symmetry/LSI + neutral baseline** (no fabricated
    population norms) — registered as `type:"qualitative"` per the project stance.
- **MRSS /100 scoring layer** (the only substantial new code):
  `data/mrss-protocol.json` (component→measure map, Part A grade→points maps, LSI→points
  table) + pure `services/mrss-scoring.js` + `services/mrss-docx.js` (programmatic via
  the `docx` lib, no template) + `routes/scribe-mrss.js`
  (`POST /api/scribe/sessions/:id/mrss/{generate,docx}`, clinician-only, **ephemeral** —
  recomputed from stored components, no DB write/migration). Involved-limb + dominance
  are scoring-time **parameters** (LSI = involved ÷ uninvolved × 100). Front end:
  `MrssPanel.tsx`, launched from `ScribeReportsPage`.
- **Multi-toggle render fix:** toggle renderers now include the measure label when an
  assessment has >1 toggle (the ACL exam is the first such case) — `measurement-render.js`,
  `measurement-series.js`, `AssessmentPanel.tsx`.
- No schema change, no new env vars. Tests: `mrss-scoring.test.mjs` (LSI→points, Part
  A/B/C, pass>95 worked example). Backend 233 tests green; the catalog↔norm alignment
  test (`measurement-render.test.mjs`) is the guardrail enforcing a norm entry per measure.

## 2026-06-21 — Email-edit → Identity Platform sync + deterministic resend

- **P2:** editing a patient's email (`PATCH /api/auth/profile`, `PUT /api/patients/:id`)
  now propagates to the Identity Platform login email via new `login-identity.js`
  `updateLoginEmail()`, so an email-login patient can sign in with the new address
  (previously the IP account kept the old email). No-op for synthetic-login patients
  (their IP email is the login name) and pre-setup rows. Done before the DB write; an
  `email-already-exists` collision returns 400 so DB + IP stay consistent.
- **P4:** Resend Invitation now passes the exact `resendUserId`, so it re-invites the
  right row even when spouses on one email share a name (was name-heuristic only).
  Added a shared-email hint on the login page + forgot-password modal ("use the login
  name we gave you"). P3 (data-deletion clears `login_username`/IP account) already
  shipped with the 2026-06-21 lifecycle entry below.

## 2026-06-21 — Shared-email login lifecycle hardening + isolated staging Firebase project

- **Bug found:** the shared-email login names (2nd spouse on one email → synthetic
  `<slug>@login.moveifyapp.com` account) could leave **orphaned Identity Platform
  accounts** on patient delete (neither hard-delete nor data-deletion removed the IP
  account or freed `login_username`). A later re-invite reusing the freed slug then
  hit set-password's `email-already-exists` fallback, which wrote the freshly-derived
  uid to `users.firebase_uid` instead of the **existing** account's uid → patient
  could set a password but never log in.
- **Fix (`0280a36`):** set-password now mirrors the *effective* IP uid; patient
  hard-delete (`patients.js`) and data-deletion anonymization (`data-requests.js`)
  best-effort delete the IP account + clear `login_username`/`firebase_uid` via new
  `lib/login-identity.js` `deleteLoginAccount()`. Also fixed earlier: Resend
  Invitation no longer 409s for a shared-email patient (`f23476a`, shipped prior).
- **Staging Firebase split:** discovered staging + prod **shared one** Identity
  Platform project (`moveify-app`) — so staging testing mutated real patient auth and
  the new delete-cleanup would have deleted real accounts. Created a dedicated
  **`moveify-staging`** project (Email/Password, authorized domains = Vercel preview +
  localhost). Staging backend now inits **keyless via ADC** (`052e186` adds the
  fallback to `lib/identity-platform.js`; runtime SA granted `roles/firebaseauth.admin`
  on `moveify-staging`; org policy `iam.disableServiceAccountKeyCreation` forbids key
  files). Dev-branch Vercel **Preview** `VITE_FIREBASE_*` repointed to `moveify-staging`.
- **What to know now:** prod auth = `moveify-app` (unchanged, JSON-creds path); staging
  auth = `moveify-staging` (ADC path). See the Branches note in `CLAUDE.md`. Leftover
  test accounts remain in `moveify-app` but are inert (free tier; no DB row → 401) —
  optional cleanup later via prod-DB `firebase_uid` cross-reference.

## 2026-06-21 — Patient handout objective table sources from the Assessment tab

- **Problem:** since the structured Assessment tab landed (scribe Phase 3), the
  patient handout's objective-findings table was still built by an LLM extraction of
  the **transcript** (`extractFindings`), so tap-captured values were ignored and
  spoken numbers (less reliable) drove the table. The SOAP note already treated the
  tapped values as authoritative; the handout did not.
- **Fix:** `POST /handout/generate` now loads the session's `scribe_session_measurements`
  and `generateHandout` renders them into the handout's `Test | Result | Interpretation`
  rows via new `measurement-render.js` `renderMeasurementsForHandout` — deterministically
  age/sex-grounded (same engine/verdicts as the SOAP block). When any structured
  findings render, they **replace** the transcript extraction; with none, it falls
  back to `extractFindings` (older sessions, or only special-test toggles captured).
- **What to know now:** handout objective data = the Assessment tab, not the
  transcript. Toggles (pass/fail special tests) are excluded from the table (numeric/
  graded findings only). Narrative sections still come from the transcript. The handout
  is generated before the SOAP note exists, so it reads the measurements directly (not
  the note). Backend-only; the pipe-row format is unchanged so the table UI + docx are
  untouched. Covered by `tests/measurement-render.test.mjs`.

## 2026-06-19 — Shared-email login (spouses on one email/phone)

- **Problem:** older patients often share an email (and phone) with a spouse, but
  email was the login key — `users.email` had a `UNIQUE` constraint and Identity
  Platform enforces unique account emails, so the second spouse couldn't be invited.
- **Fix (reactive, low-blast-radius):** email is now treated as a **contact field,
  not a login key** (identity is already `firebase_uid`). When an invite hits an
  email that already belongs to an *active* patient, the clinician confirms it's a
  shared household email; the **second** patient gets an auto-generated **login
  name** (`john-smith`, `-2` on collision) backed by a synthetic IP account email
  `<name>@login.moveifyapp.com` (nothing is mailed there). The first spouse keeps
  logging in by email. **Patients who don't share an email are completely unchanged.**
- **Schema migration** (`init.js`, additive + relaxing): dropped `users_email_key`
  UNIQUE (kept a plain index), added `users.login_username` (partial-unique on
  `LOWER(login_username)`), added `invitation_tokens.user_id` so set-password
  resolves the right row when the email is shared.
- **Login/reset:** the login + forgot-password fields now accept an email **or** a
  login name (frontend appends the domain; `LOGIN_USERNAME_DOMAIN` mirrored in
  `frontend/src/config.ts` ↔ `backend/lib/login-identity.js`). Reset links for a
  login-name patient generate against the synthetic account but deliver to the real
  shared inbox.
- **Hardening:** the middleware email→user fallback and the legacy set-password
  email fallback now resolve **only on an exact single match** (fail closed) so a
  shared email can never mis-resolve a session or set a password on the wrong row.
- Login error is now generic ("Invalid login or password"); 9 new helper/collision
  tests; full suite 202 backend tests pass; frontend builds clean.
- ⚠ Deploy note: verify on **staging first** that the prod `users` email UNIQUE
  constraint is named `users_email_key` (standard for inline `UNIQUE`); if it isn't,
  the `DROP CONSTRAINT IF EXISTS` no-ops and shared-email inserts would fail closed.

## 2026-06-17 — PROM library batch 2 (sourced from official forms)

- Added **NDI**, **ODI**, **UEFI**, **Roland-Morris (RMDQ)**, **Örebro-SF** — catalog
  now 10 PROMs. Item content transcribed verbatim from official forms (WA L&I ODI,
  MSU NDI, MAIC Örebro) — still to verify, but sourced not invented.
- Exercises every engine shape: NDI/ODI = 10 choice-statement sections → **percentage**;
  RMDQ = 24 **yes/no** → sum; Örebro = **reverse**-scored items 3/4/8 → sum (>50 high risk);
  UEFI = sum/80.
- **ODI** included with a licence note (©Fairbank/Mapi — free for non-funded research &
  individual clinical practice; commercial/electronic use may need a licence; Ryan's call).
- **PROMIS-10** now added too: new `tscore` scoring shape — each subscale sums its
  (recoded) items then maps the raw sum to a standardised T-score via the official
  lookup tables. Physical = Global03/06/07/08, Mental = Global02/04/05/10; pain item
  recoded 0-10→5-1; fatigue/emotional response values pre-reversed (v1.2). Sourced from
  the HealthMeasures scoring manual. **PROM library now 11 instruments**; 191 backend
  tests pass. (Phase 4b PDF→Cliniko still the only deferred piece.)

## 2026-06-17 — Phase 4 (4a): patient-completed outcome measures (PROM kiosk)

- **PromKiosk.tsx** — full-screen patient-facing questionnaire (one item per screen,
  big 0–N tappable scale), launched from the Assessments view. PSFS has a clinician
  setup step (enter the patient's activities) before handover. Exit is **PIN-gated**
  (4–6 digit clinician PIN, scrypt-hashed in `clinician_preferences.kiosk_pin_hash`);
  completion shows a hand-back screen that also requires the PIN. iPadOS Guided Access
  is the documented second layer.
- **Encrypted storage:** new `scribe_session_outcomes` table — raw responses are
  patient self-report health data, so `responses_enc` is AES-256-GCM (like notes);
  derived `score` + `score_band` stored plain for the note/trend. `prom_completed`
  audit logs the PROM key only, never the responses.
- **Deterministic scoring** (`services/prom-scoring.js`, server-authoritative, unit-
  tested). Generalized item model — numeric `scale`, choice `options`, or `yesno`,
  with optional `reverse`/`subscale`; scoring shapes single/average/sum/percentage/
  **subscales** (per-subscale sum × multiplier, e.g. DASS-21 ×2). Subscale breakdown
  stored in `scribe_session_outcomes.detail` (additive JSONB). Score+band feed a new
  SOAP `PATIENT-REPORTED OUTCOME MEASURES` block (`buildSoapUserMessage`, one line per
  subscale). Catalog `data/prom-catalog.json` seeds **NPRS** (3-item composite), **PSFS**
  (clinician-entered activities, defaults to 3), **LEFS**, **K10**, **DASS-21** — all
  free/public-domain. ⚠ Item wording **authored from the standard forms — to verify
  against the official instruments**. Remaining (UEFI, RMDQ, NDI, ODI [licence-flag],
  Örebro-SF, PROMIS-10) = next batch.
- Routes (`routes/scribe-proms.js`, clinician-only, `/api/scribe`): `GET /prom-catalog`,
  session `POST`/`GET /outcomes`, `GET /patients/:id/outcomes`, kiosk-PIN set/verify.
- **Deferred (4b):** PDF render → Cliniko attachment; LEFS/NDI/Örebro catalog expansion
  (need sourcing + licensing — Mini-BEST/LEFS/etc. carry commercial-use caveats).
  The scoring engine + runner pattern are shared with the Berg/Mini-BEST instruments.

## 2026-06-17 — ROM rework: movement×L/R table + all planes (capture-only)

- ROM assessments restructured into a **goniometry-style table** (movement rows ×
  Left/Right) — `layout: "table"` on the assessment; `AssessmentPanel` renders the grid
  and a cell tap opens the existing centred preset picker (Next cycles cells). Replaces
  the stacked one-movement-per-card flow.
- **All clinically-measured planes** per joint: Cervical, Shoulder (×5), Elbow/forearm
  (new ×4), Wrist (×4), Spine (×5), Hip (×6), Knee (×2), Ankle (×4). New planes are
  **capture-only** (qualitative, value + ≥10% L/R asymmetry, no within/below verdict) —
  added to `normative-data.json` (~18 keys, `symmetry_not_norm`/`method_dependent` caveats,
  AAOS-normal note for reference only). Existing graded ROM keys + the handout's
  transcript grounding are untouched.
- **Note output:** `measurement-render.js` now renders one line per joint for ROM
  tables — `Hip ROM — Flexion L110/R115°; Internal Rotation L30/R40° (25% lower on left)`
  — instead of a line per movement. Non-table measures unchanged.
- Catalog now restructured (lumbar_flexion + thoracic_extension folded into **Spine ROM**;
  new **Elbow ROM**). No schema change; existing measure keys preserved. 193 backend tests.

## 2026-06-17 — Multi-item instruments: Berg + Mini-BESTest (guided runner)

- Berg Balance Scale (14 items × 0–4) and Mini-BESTest (14 items × 0–2, 4 sections)
  are now full **scored instruments**, not a single typed total. New catalog `input`
  kind `instrument` with an `instrument` block (`items[]`: name, instruction, anchored
  `options`, optional `bilateral`/`section`). Item content sourced verbatim from the
  official protocols (Berg public-domain; Mini-BEST ©OHSU, free clinical use w/
  attribution — **licensing to confirm before commercial go-live**).
- **Guided one-item-per-screen runner** (`InstrumentRunner.tsx`, full-screen portal):
  instruction + anchored descriptor buttons, progress bar + running total, review
  screen to edit any item, save. Bilateral items (Mini-BEST 3 & 6) capture L+R.
- **Scoring is server-authoritative + deterministic** (`services/instrument-scoring.js`,
  unit-tested): sum of items, worse (lower) side for bilateral. The total stores in
  `value` (graded vs the existing `berg_balance`/`mini_bestest` norm); per-item scores
  in a new additive **`detail JSONB`** column. Berg fall-risk bands corrected to the
  standard 41–56 / 21–40 / 1–20 (norm + `normative-data.md`).
- Tests: `instrument-scoring.test.mjs` (sum, bilateral worse-side, validation, grading).
  This scoring engine is the foundation the Phase 4 PROM kiosk will reuse.

## 2026-06-16 — Assessment catalog: full suite + compound/toggle (Tier 2)

- Catalog now 30 assessments. Added the rest of the graded norm tests plus the
  ones that needed new machinery: **blood pressure** (compound), **Berg Balance**,
  **cervical ROM** (4 movements), **lat dorsi / serratus** (pass/fail).
- **New measure input kinds** (catalog `input`): `compound` (two values → BP
  systolic/diastolic) and `toggle` (pass/fail `options[]`). `presets`/`keypad` as before.
- **Per-measure laterality override** — a measure may set its own `laterality`
  (cervical: flexion/extension single, rotation/lateral-flexion bilateral).
- **Schema (additive):** `scribe_session_measurements.value2 NUMERIC` (NULL except
  compound) via `ADD COLUMN IF NOT EXISTS`.
- **Norms:** added `berg_balance` (0–56 fall-risk categories) + 4 cervical movement
  keys (capture-only qualitative — no age-mislabeling) to `normative-data.json`;
  Berg also documented in `docs/normative-data.md`.
- Render + series handle all three kinds (compound graded as "sys/dia"; toggle
  rendered as its label, no fake norm + no asymmetry flag). Panel: compound keypad
  with a "/" key, toggle option buttons, per-measure L/R fields.
- Tests extended (`measurement-render.test.mjs`: compound, toggle, no-asymmetry).
  **Still pending:** none of Tier 2's hard cases remain — BP/Berg/pass-fail all in.

## 2026-06-16 — Structured in-session assessments (scribe Phase 3)

- New tap-capture panel in the scribe recorder (`AssessmentPanel.tsx`, collapsible
  drawer in `ProgressNotePage.tsx`): pick assessment → side toggle (L/R) →
  slider + ± steppers per measure. Optimistic per-value save. Seeded set: hip/knee/
  shoulder/ankle ROM, grip, single-leg stance, single-leg calf raise, 30s STS.
- **Catalog-driven** (`backend/data/assessment-catalog.json` + `services/assessment-catalog.js`).
  Every measure `key` equals a `normative-data.json` test key, so captured values are
  graded **deterministically** (new `normative-data.interpretByKey`) — same grounding
  the handout uses, but from a tapped number instead of speech-extracted text.
- **Schema (additive):** new `scribe_session_measurements` table — **plain numerics**
  (same stance as `exercise_completions`/`daily_check_ins`, kept queryable for future
  reassessment comparisons), `UNIQUE(session_id, assessment_key, side, measure_key)`
  for upsert; `side='bilateral'` for non-lateralised tests.
- **API** (`routes/scribe-measurements.js`, clinician-only, mounted at `/api/scribe`):
  `GET /assessment-catalog`, and per-session `GET`/`POST`(upsert)/`DELETE /sessions/:id/measurements/...`.
  Audit logs which test was captured, never the value.
- **Generation wiring:** `scribe-soap-notes.js` generate fetches the rows + demographics,
  renders grounded lines (`services/measurement-render.js`, incl. >=10% side-to-side
  asymmetry flag), and passes them to a new `OBJECTIVE MEASUREMENTS — EXACT` block in
  `buildSoapUserMessage`. `soap_note_generated` audit gains `measurements` count.
- Tests: `backend/tests/measurement-render.test.mjs` (render + catalog alignment +
  prompt block). Phases 1–2 shipped 2026-06-12; this is Phase 3.
- **Capture UX:** the scribe recorder's bottom half is now a segmented **Record /
  Assessments** control (was a cramped drawer under the note editor); the note editor
  stays visible above. In review (locked) the assessments show read-only, hidden when none.
- **Patient-profile trend view:** new **Assessments** tab in `PatientProfile`
  (`AssessmentTrends.tsx`) — longitudinal series per measure/side with latest value,
  grounded verdict, baseline→latest change, and an inline sparkline. Backed by new
  `GET /api/scribe/patients/:patientId/measurements` (`services/measurement-series.js`,
  reuses `compareValues`/`interpretByKey` so trends read consistently with the notes).

## 2026-06-14 — Clinician adherence Dashboard (new landing page)

- New **Dashboard** tab, now the **clinician landing page** (replaces Program
  Builder as the default `currentPage` at login — set in both `handleLogin` and the
  `onAuthStateChanged` session-restore path). Patients still land on the portal.
- At-a-glance triage of who is keeping up with their exercise programs: summary
  cards (On track / Slipping / At risk / Fallen off / Pain flags) over a sortable,
  worst-first table. Signals: 14-day completion %, days-since-last-activity, and
  high-pain (≥7/10) alerts. **Active-program patients only**; others surfaced as a
  count line. Row click → existing `PatientProfile` (Back returns to the Dashboard).
- New endpoint `GET /api/patients/adherence-summary?days=14` (clinician-only,
  registered **before** `/:patientId`). Compact one-row-per-patient payload computed
  server-side via new `backend/services/adherence.js` (`resolveProgramWindow` +
  `computeAdherence` — self-contained copy of the schedule-aware math; the
  `routes/programs.js` per-patient analytics path is untouched). No schema/env
  changes. Tests: `backend/tests/adherence.test.mjs`.

## 2026-06-13 — NDIS agreement variant (signature-only, no Stripe)

- Added an **NDIS** kind to the service-agreement feature. Reuses the existing
  spine (tokenised link → drawn signature → PDF → Cliniko attachment → audit →
  versioning) but **branches off before the billing-worker call**: NDIS is
  signature-only — no Stripe Checkout, no Direct Debit, no subscription. Funding
  is invoiced to the plan manager (plan-managed) or participant (self-managed);
  **NDIA-managed is hard-rejected** (unregistered provider) client- + server-side.
- New `backend/lib/ndis-agreement-content.js` — `buildNdisAgreement(details)` emits
  the **same `{ parts:[{sections}] }` shape** as `buildAgreement`, so the PDF
  renderer + sign page render it unchanged. Mirrors the vault *NDIS Service
  Agreement Template* + verified against official NDIS material (Code of Conduct,
  service-agreement fact sheet, PAPL 2025-26): itemised Schedule of Supports (line
  items `15_200_0126_1_3` IDL / `12_027_0128_3_3` IHW, $166.99/hr cap), GST-free,
  the **7-clear-day / up-to-100% NDIS short-notice cancellation rule**, explicit
  **Travel** (50% labour + $0.99/km non-labour, agreed-in-advance; clinic-based
  default = not charged) and **itemised non-face-to-face supports** (program/resource
  dev, progress/report writing, SC/plan-manager/GP liaison, phone/video/email
  check-ins, case conferencing — "only chargeable because stated here"), a review
  clause, and the full **8-element NDIS Code of Conduct** (incl. sexual misconduct +
  fair pricing). Travel/NFF are operator toggles. Dynamic clause numbering.
  Separate `NDIS_AGREEMENT_VERSION` (`ndis-v1.1-2026-06-13`).
- Schema (additive, nullable): `service_agreements.kind` (default `'private'`),
  `details` JSONB (NDIS payload), `signed_capacity`; path CHECK widened to allow
  `'ndis'`. NDIS rows store `tier='ndis'`, `path='ndis'`.
- Routes: `/generate` accepts `kind:'ndis'` (+ NDIS fields, rate-cap + NDIA guard);
  `/validate/:token` returns the NDIS doc + `kind`; `/:token/sign` branches to a
  signature-only path (captures `signed_capacity`, stores the PDF, terminal
  `'signed'`, returns `{ signed:true }` — **no** `checkoutUrl`). Frontend:
  `AgreementPage` shows a capacity field + signed-confirmation state (no Stripe
  redirect); `GenerateAgreementModal` gains an NDIS mode.
- Gated by the existing `AGREEMENT_AUTOMATION_ENABLED` flag (no new env var).
  ⚠ **Clause copy still needs Ryan's final legal review before the dev→main merge**
  — the flag is ON in prod, so the NDIS option goes live to operators on merge.
  Source: vault `App Agreements - NDIS Variant - Pending Code Edit` + `NDIS Service
  Agreement Template` + `NDIS EP Billing Reference`.

## 2026-06-13 — NDIS agreement: funding periods, est. funding, printable PDF

- Follow-ups to the NDIS variant above (now `NDIS_AGREEMENT_VERSION` `ndis-v1.4-2026-06-13`):
- **Funding periods clause (conditional)** — NDIS Act s33 (in effect 19 May 2025)
  releases a NEW/reassessed plan's budget in instalments (usually quarterly), and the
  NDIA's provider guidance says agreements should address it. **But not all plans have
  periods** — rolled-over / pre-reform plans have the whole budget for the term — so the
  operator picks the period (`FUNDING_PERIODS`, **default `none`**) and the clause renders
  to match: `none`/unset states that no periods apply (doesn't invent them); a real period
  states we claim only within the current period's funds, split claims across a boundary,
  rely on the participant/plan-manager for dates+amounts (providers can't see them in the
  portal), and that unspent funds roll forward within the plan. Optional per-period $ amount.
- **Indicative funding estimate** (added v1.2) — optional session/reporting/travel
  hours + km render an "up to / estimated" Schedule-of-Supports cost with a total and
  an explicit "not a fixed charge · unused estimates are not charged" disclaimer.
- **Printable PDF** — new public, token-gated `GET /api/agreements/:token/pdf`. Pending
  link → **unsigned preview** (PREVIEW banner + blank hand-sign lines); signed → the
  captured signature + audit trail. `renderAgreementPdf` gained a `draft` flag. Sign
  page (`AgreementPage`) has a "Download / print a copy" link + a "Download your signed
  copy" button on the confirmation screen. Applies to private agreements too.
- No schema/env changes (reuses `details` JSONB + the existing flag). ⚠ Still inside
  the un-merged NDIS copy pending Ryan's legal review.

## 2026-06-12 — Scribe Phase 2: program-edit snapshots + save-bug fix

- New `program_revisions` table: every program create/update records before/after
  JSONB snapshots inside the same transaction (`services/program-revisions.js`),
  stamped with the active scribe session (patient+clinician, 12h bound) when one
  exists. SOAP generation sweeps revisions in the session window (start −30 min →
  end +60 min) and injects a human-readable diff (`services/program-diff.js`) as
  an authoritative PRESCRIPTION CHANGES prompt block. `GET /api/programs/:id/revisions`
  (clinician) returns rendered history.
- **Program-exercise save bug fixed** (silent overwrite when adding exercises during
  edit): frontend now stamps `programExerciseId` at edit-load and sends it as `id`
  (library ids no longer masquerade as row ids); backend PUT additionally guards
  that each existing row can be claimed once (id or name match).

## 2026-06-11 — Scribe Phase 1: prior-note context in SOAP generation

- SOAP generation now feeds the LLM patient history by default: the rolling
  `patient_summaries` summary (existing `scribe-summary.js`) + the most recent
  completed prior note, in a delimited "context only" block. Client can opt out
  per-generation via `useHistory: false` (checkbox "Patient history" next to
  Generate Note in `ProgressNotePage.tsx`). Audit detail gains `historyUsed`.
- `generateSoapNote` now takes `({ transcript, priorContext }, systemPrompt)`
  (string still accepted) via a new prompt-assembly layer
  (`buildSoapUserMessage` in `scribe-llm.js`) — Phases 2–4 of the scribe
  upgrades (program diffs, measurements, PROM scores) slot in as new blocks.
  Plan: vault `20-Projects\Moveify-App\Build Plan - Scribe Context, Assessments
  & Outcome Measures.md`. No schema or env changes.

## 2026-06-11 — GCP cost sweep #2 (budget breach investigation)

- 90%-of-$30-budget alert traced via BigQuery billing export: steady-state pace was
  ~$73/mo gross. Drivers: backend `min-instances=1` (~$20/mo), worker cron load incl.
  `billing-sync-cliniko` at every-15-min (~$20/mo), Secret Manager version leak
  (~$11/mo and growing), plus one-off Xero-reconciliation CPU spikes (~$7).
- **Secret version leak fixed:** `XERO_REFRESH_TOKEN` had accumulated 143 live versions
  (Xero rotates the refresh token on every refresh; `setSecret` never destroyed the old
  version). `billing-worker/lib/secrets.js` `setSecret` now destroys superseded versions
  after adding (best-effort); worker SA granted `secretVersionManager` on
  `XERO_REFRESH_TOKEN`. One-off cleanup destroyed 161 stale versions across 12 secrets.
- **Cron cadence (middle path):** pure-accounting crons (`billing-sync-cliniko`,
  `billing-poll-cliniko-appointments`, `billing-sync-block-progress`) moved to **daily**,
  batched 5:00/5:10/5:20 AEST ahead of the 6:00 Tyro ingest. `process-referrals` stays
  hourly (output can be acted on same-day); `reconcile-agreements` stays 6-hourly
  (protects new sign-ups). `setup-cron.sh` updated to match live.
- **`moveify-backend` now `min-instances=0`** — was the largest recurring line (~$20/mo
  for an always-warm instance). `startup-cpu-boost` stays ON to soften cold starts.
  Consequence: first request after an idle period takes a few seconds.
- Zombie `moveify-api` service (accidentally re-created 2026-06-07 by a stray source
  deploy) deleted again. Obsolete `moveify-jwt-secret` deleted (Phase 4 removed JWT).
- Projected steady-state after sweep: ~$26–28/mo gross (~$21–23 net) vs $30 budget.

## 2026-06-10 — App rebrand: Manrope everywhere (matches handout branding)

- `font-display`/`font-sans` both now resolve to **Manrope** (Sora + DM Sans retired),
  aligning the app with the printed-handout brand in `backend/scripts/handout-kit.js`.
  Google Fonts import swapped in `frontend/src/index.css`; hardcoded 'DM Sans' in
  `ReportPreview.tsx` updated too.
- Added handout palette tokens to the `@theme` block: `moveify-ink` `#1a2230`,
  `moveify-sub` `#56606e`, `moveify-soft` `#94a3b8`, `moveify-rule` `#e2e8f0`.
- Also fixed CLAUDE.md drift: the app is on **Tailwind 4** (`@theme` in `index.css`,
  no `tailwind.config.js`) — docs said Tailwind 3.
- `ProgramPDF.tsx` still renders with react-pdf's built-in Helvetica (unchanged).

## 2026-06-10 — Security hardening sweep + Phase 4 legacy-JWT removal

- **Phase 4 done:** removed `POST /api/auth/login`, `generateToken`, the legacy HS256
  fallback in `middleware/auth.js` (`verifyTokenAnyMode` → `verifyToken`, IP-only), and the
  `bcrypt`/`jsonwebtoken` deps. `JWT_SECRET` is no longer read — drop the env/secret binding
  from Cloud Run at next deploy. Login is exclusively client-side Firebase SDK now.
- **Transcript retention fixed:** the 48h expiry was lazy (delete-on-read only) — untouched
  transcripts persisted forever. New `jobs/purge-transcripts.js` + OIDC cron
  `POST /api/internal/cron/purge-transcripts`; hourly Cloud Scheduler job
  `moveify-purge-transcripts` created (**paused** until the prod backend deploys this route —
  resume at release).
- **SPA security headers:** `frontend/vercel.json` now sets CSP/HSTS/XFO/Permissions-Policy
  (`microphone=(self)` needed by scribe). Verify the scribe recorder + YouTube embeds +
  Google Fonts on the Vercel preview before promoting.
- **Misc:** prod error handler no longer leaks `err.message`; `POST /api/agreements/:token/sign`
  now behind the 10/15min limiter; Android `allowBackup=false`; `npm audit fix` cleared all
  high CVEs (incl. express-rate-limit IPv6 bypass); ownership tests fixed (the 2 DB-backed
  `requireAdmin` cases were silently broken — Vitest can't mock CJS `require`, noted in test).
- **Scribe WS protocol change:** the transcription WebSocket no longer takes `?token=` in the
  URL (tokens were landing in Cloud Run request logs). The client now sends
  `{type:'auth', token, sessionId}` as the **first message** and must wait for `{type:'ready'}`
  before streaming audio. The server also verifies `scribe_sessions.clinician_id` ownership
  **before** enabling the transcript auto-save (previously any clinician token could overwrite
  any session's transcript). Old cached SPA bundles can't connect until refreshed.
- **GCP hardening (done same day, at release):** released to prod ~21:30 AEST. Backend (prod +
  staging) now runs as dedicated **`moveify-backend@`** SA (`cloudsql.client` + `logging.logWriter`
  + per-secret accessor on its 9 secrets); the default compute SA lost `run.admin`,
  `iam.serviceAccountUser`, and the backend-only secret grants (source deploys verified still
  working — they never needed run.admin). `JWT_SECRET`/`JWT_EXPIRY` bindings removed from both
  backends. **Cloud SQL PITR enabled** on `moveify-db` (no restart occurred). Purge scheduler
  resumed; first run deleted 11 expired transcripts. Compute SA keeps the shared
  Cliniko/admin-token/AWS/Google-SA secret grants because ad-hoc Cloud Run Jobs may run as it.

## 2026-06-05 — Scribe: upload a previous report as reassessment baseline context

- **What:** the reassessment (patient + GP) can now take a **previous report** (PDF / DOCX / TXT
  upload, or pasted text) as extra baseline context — and it can **stand in as the baseline** when
  there's no prior scribe session (so patients whose baseline predates the scribe can be reassessed).
- **How:** new `services/document-extract.js` (DOCX via pizzip, PDF via `pdf-parse`, TXT) +
  `routes/scribe-documents.js` `POST /api/scribe/documents/extract` (multer **memory** storage —
  the file is never written to disk; extracted text is never logged; it's PHI, sent only to the
  in-region extraction LLM like transcripts). The reassessment `generate` route now accepts
  `previousReportText` and makes `baselineSessionId` **optional** when a report is supplied (baseline
  source = session note and/or report). Frontend: a "Previous report (optional)" panel (upload +
  paste) in `ScribeReportsPage`.
- **New deps:** `multer`, `pdf-parse` (backend). Nothing persisted; no schema changes.

## 2026-06-05 — Scribe: GP Reassessment Report (clinician-to-GP variant)

- **What:** a fourth report type — a GP-facing version of the reassessment. Same deterministic
  before/after comparison engine, but written clinician-to-GP and laid out as a formal referral
  letter (recipient block, Re: line, Executive Summary / Objective Findings table / Clinical
  Interpretation / Recommendations, sign-off). Blends the reassessment handout's brand styling
  (`handout-kit.js`) with the GP report's letter structure.
- **How:** an `audience` param ('patient' | 'gp') threads through the reassessment service +
  routes. `normative-data.buildComparisonInterpretation(res, { audience })` swaps patient wording
  ("the expected range for your age and sex", "Held steady") for clinician wording ("the age/sex
  reference range", "No significant change"). New `scribe-llm.generateGPReassessmentNarrative`
  (Executive Summary / Clinical Interpretation / Recommendations; uses the `[PATIENT_NAME]`
  placeholder kept off the AWS wire, substituted server-side; may flag screening findings for GP
  review). New `GP_Reassessment_Template.docx` (built by `scripts/build-gp-reassessment-template.js`)
  + `services/scribe-gp-reassessment-docx.js` renderer.
- **Routes:** the existing `/reassessment/{generate,regrade,narrative}` now accept `audience`;
  `/reassessment/docx` accepts `variant: 'gp'` → GP renderer. Frontend: `GPReassessmentPreview.tsx`
  (GP sections + editable GP/referral header fields + re-grade + rewrite + GP docx) and a new
  template card in `ScribeReportsPage`.
- **Unchanged:** the patient reassessment + handout paths (audience defaults to 'patient').
  No schema changes, no env vars, nothing persisted.

## 2026-06-04 — Scribe: Reassessment Summary report (baseline vs latest)

- **What:** new third report type in Scribe → Reports, alongside the CDMP GP report and the patient
  handout. It compares a patient's **baseline** assessment with their **latest** reassessment of the
  same tests: a before/after results table with a grounded change column, plus a progress narrative.
- **How:** reuses the handout's findings extraction + normative grounding. The findings block was
  refactored out of `generateHandout` into `scribe-llm.extractFindings` (no behaviour change). New
  deterministic compare layer `normative-data.compareValues` / `buildComparisonInterpretation` (the
  engine computes direction improved/declined/maintained + verdict transition; the LLM only phrases
  it). New `services/scribe-reassessment.js` pairs findings by canonical test key (+ side) via
  `matchTest`. New `services/scribe-demographics.js` holds the shared age/sex+Cliniko-backfill helper
  (extracted from `scribe-handout.js`).
- **Routes (new):** `POST /api/scribe/sessions/:id/reassessment/generate` and `…/reassessment/docx`
  (`routes/scribe-reassessment.js`, clinician-only, ephemeral, audit-log only — mirrors the handout).
  Mounted in `server.js`.
- **Template:** `backend/assets/Reassessment_Template.docx` built by `scripts/build-reassessment-template.js`
  (shares `handout-kit.js`); rendered by `services/scribe-reassessment-docx.js`.
- **What to know:** the baseline session must have a **saved SOAP note** (its transcript is purged 48h
  after recording) — the UI baseline picker enforces `hasNote`. Tests outside the normative dataset
  can't be auto-paired; they surface as editable rows / "new this visit" rather than being dropped.
  No schema changes, no new env vars, nothing persisted.

## 2026-06-04 — Billing daily-summary email: actionable-only + flag-noise cleanup

- **What:** the `billing-daily-summary` cron (`jobs/daily-summary.js`, daily 1:30am AEST → emails
  `ryan@moveifyhealth.com`) previously sent **every day unconditionally** and listed **all** open
  reconciliation flags — including informational ones that never get `resolved_at`, so they piled up
  and reappeared daily. Now: it emails **only when there's something actionable** (silent on clean
  days) and lists **only actionable flag types** (`ACTIONABLE_FLAG_TYPES` set in the file).
  Informational flags (`block_completed`, `agreement_schedule_recovered`, `unknown_service_type`,
  `stripe_metadata_missing`, …) are still written for audit but never emailed.
- **Bug fixed:** the "FAILED STRIPE DDs" section filtered `f.type === 'failed_stripe_dd'`, but the
  real type is `stripe_payment_failed` — so failed DDs had **never** shown in the email. Corrected.
- **Poller flags:** stopped raising the benign `appointment_unresolved_subscription` flag (fired every
  poll for genuinely non-Stripe patients = pure noise; the appt is still left unmarked for retry).
  Added an **actionable** `appointment_ledger_write_failed` flag for when a Xero invoice is created but
  the `appointment_invoices` ledger row fails to write (closes the one narrow dup-guard gap — see the
  poller dup-guard review).
- **Why:** operator asked to quiet the email; many flags were redundant. Files:
  `billing-worker/jobs/daily-summary.js`, `billing-worker/jobs/poll-cliniko-appointments.js`.

## 2026-06-02 — Service-agreement automation: LIVE in production

- **What:** flipped `AGREEMENT_AUTOMATION_ENABLED=true` on prod backend + worker — the sign-up flow
  is now live. The Generate-agreement button shows for clinicians; sign/checkout/provision run
  against live Stripe.
- **Go-live ops performed:**
  - Created the 13 live Stripe Products/Prices via a one-off Cloud Run Job (built from the worker
    image, live key bound by Secret Manager — never handled locally). Amounts per `create-agreement-prices.js`.
  - Prod worker (`moveify-billing-worker`) deployed with all `STRIPE_PRICE_*` + `AGREEMENT_AUTOMATION_ENABLED=true`
    + `OIDC_EXPECTED_AUDIENCE`. Prod backend deployed with `BILLING_WORKER_URL` + `BILLING_ADMIN_TOKEN`
    (secret ref); `service_agreements` table auto-migrated.
  - Prod reconcile scheduler **`moveify-reconcile-agreements`** (every 6h, OIDC SA
    `billing-worker@`, audience = worker URL). Verified 200.
- **Runtime Stripe key:** the prod runtime key (`STRIPE_API_KEY` secret) was a restricted key
  missing the agreement-flow scopes. Replaced with a new restricted key (new secret version) whose
  scopes were verified by a throwaway probe job (all reads + Customers/Subscriptions/Checkout
  writes PASS). Needs: Customers/Subscriptions/Checkout **write**; Charges, PaymentIntents,
  Invoices, Balance, SetupIntents, Products, Prices **read**. Worker cold-started to load it.
- **Dockerfile:** `billing-worker/Dockerfile` now also `COPY scripts/` (so admin scripts can run
  as Cloud Run Jobs with secrets bound the platform way).
- **Live Stripe webhook (fixed 2026-06-04):** the prod live webhook endpoint must subscribe to
  `checkout.session.completed`, `subscription_schedule.completed`, `customer.subscription.deleted`
  on top of the pre-existing `invoice.payment_succeeded`/`invoice.payment_failed`/`charge.dispute.created`.
  These were missing at go-live, so completed checkouts only got a schedule via the 6-hourly reconcile
  sweep (up to 6h delay) instead of provisioning in seconds. Same endpoint = same signing secret, so
  adding events needs no secret/redeploy.
- **⚠ Worker cron OIDC-audience gotcha:** the worker's `OIDC_EXPECTED_AUDIENCE` must equal the
  audience the existing Cloud Scheduler jobs send — the **`…-1097567971198.australia-southeast1.run.app`**
  URL form, NOT the `…-{hash}-ts.a.run.app` form returned by `gcloud run services describe … status.url`.
  Setting it to the latter on 06-02 made the worker reject **every** existing cron (OIDC "Wrong
  recipient, payload audience != requiredAudience") for ~2 days. Any new scheduler hitting the worker
  must use the 1097 audience to match.
- **Note:** Cliniko provider postcode still shows 5352 vs the correct 5351 (fix in Cliniko).

## 2026-06-02 — Agreement signing: drawn signature + Direct Debit authorisation

- **What:** the service-agreement sign page now captures a **drawn signature** (finger/mouse
  canvas, dependency-free `SignaturePad` in `AgreementPage.tsx`) alongside the typed full name,
  an auto-stamped date, and a **separate "I authorise the Direct Debit" checkbox** (distinct from
  the existing read-&-understood/privacy consent). The drawn mark is rendered into the signed PDF
  (`services/agreement-pdf.js`) for stronger dispute/chargeback evidence.
- **Why:** the agreement authorises a recurring direct debit — a drawn mark + explicit DD
  authorisation is more defensible than a typed name alone. The bank-level mandate is still
  captured by Stripe; the in-app capture records intent.
- **Schema (additive):** `service_agreements.signed_signature TEXT` (base64 PNG data URL) +
  `dd_authorised BOOLEAN` — added to the CREATE and as `ADD COLUMN IF NOT EXISTS` for the existing
  staging table. No destructive change.
- **API:** `POST /api/agreements/:token/sign` now requires `signature` (validated `data:image/png`
  base64, ≤90 KB to stay under express.json's 100 KB limit) and `ddAuthorised: true`.
- **Go-live status:** clinical/legal copy signed off; postcode 5351 confirmed correct (fix the
  Cliniko record, which shows 5352); Independent-Discounted intentionally excluded; prices
  confirmed; full flow validated in Stripe sandbox. Remaining = ops only (LIVE Prices + prod env
  vars + worker deploy + prod reconcile scheduler) before flipping `AGREEMENT_AUTOMATION_ENABLED`.

## 2026-06-02 — Patient handout: non-diagnostic comparative phrasing + no auto-referral + missing-demographics flag

- **What:** the scribe handout's clinical interpretations no longer use diagnostic labels or
  recommend referral. Blood pressure now reads "Elevated. Typical resting reading is below
  120/80 mmHg." (not "grade 1 hypertension"); glucose reads "Above the normal range" (not
  "diabetes range"); waist reads "Above the recommended waist range". The verdict is driven by
  an explicit `flag` on each category and a `supersededBy` field so waist reports a single band.
  `screen_not_diagnose` caveat dropped "recommend GP review" → "Screening measure only, not a
  diagnosis." Genuine exercise-safety flags (hypoglycaemia, very-high-BP) kept.
- **Why:** stating findings is the tool's job; diagnosis and referral are the clinician's call.
  See memory `feedback_handout_no_clinical_decisions`.
- **No ungrounded claims:** when a known norm test can't be graded (missing age/sex), the table
  now falls back to a neutral baseline line — never the LLM's recalled qualitative claim (this
  is what produced the bad "good foundation of upper body strength"). The "What Your Results
  Mean" prompt is also barred from praising/criticising a finding without a within/above/below
  verdict.
- **Missing-demographics flag:** `POST /api/scribe/.../handout/generate` now returns a
  `grounding: { missingSex, missingAge, hasFindings }` object; `HandoutPreview` shows an amber
  "Norms not applied" banner so the clinician fixes the Cliniko/Moveify record (sex + DOB) and
  regenerates. Norm grounding needs **sex** (grip, sit-to-stand, gait, ROM, waist) + **DOB** for
  age bands — capture both before the assessment.
- **Files:** `backend/services/normative-data.js`, `backend/data/normative-data.json`,
  `backend/services/scribe-llm.js`, `backend/routes/scribe-handout.js`, frontend
  `HandoutPreview.tsx` / `ScribeReportsPage.tsx` / `scribe-api.ts` / `types/index.ts`.

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
