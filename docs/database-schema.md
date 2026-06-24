# Database Schema

Defined in `backend/database/init.js`. Key tables:

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users` | id, email, password_hash, role (`'clinician'`/`'patient'`), name, dob, phone, condition, is_admin, login_username | Single table for both roles. `is_admin` controls admin privileges for clinicians. **`email` is NOT unique** (households share one) — identity is `firebase_uid`. `login_username` (nullable, partial-unique) is the alternate login for a second patient on a shared email; see "Shared-email login" in `docs/auth-security.md` |
| `programs` | patient_id, clinician_id, name, frequency, start_date, duration | `frequency` is a **JSON string** (e.g., `'["Mon","Wed","Fri"]'`) — must `JSON.parse()` on read |
| `program_exercises` | program_id, exercise_name, sets, reps, prescribed_weight, exercise_order | `prescribed_weight` is **nullable** — not all programs track weight |
| `exercise_completions` | exercise_id, patient_id, completion_date, sets/reps/weight_performed, rpe_rating, pain_level | `completion_date` is **DATE not DATETIME** — only tracks day, not time |
| `daily_check_ins` | patient_id, check_in_date, overall_feeling (1-5), general_pain_level (0-10), energy_level (1-5), sleep_quality (1-5) | One per patient per day |
| `exercises` | clinician_id, name, category, joint_area, muscle_group, equipment, video_url | Custom exercises. Metadata fields are **comma-separated strings** (e.g., `"Knee, Hip"`) |
| `block_schedules` | program_id, block_duration (4/6/8 weeks), current_week, status | Periodization blocks |
| `education_modules` | title, content, category, estimated_duration_minutes, created_by | Text/video education |
| `clinician_patients` | clinician_id, patient_id | **Legacy** — still exists in schema but no longer queried. Kept for migration safety |
| `program_revisions` | program_id, patient_id, changed_by, scribe_session_id, snapshot_before/after (JSONB), changed_at | Before/after snapshot per program create/update (`snapshot_before` NULL on create). Written in-transaction by `services/program-revisions.js`; diff rendered by `services/program-diff.js` into the SOAP prompt |
| `scribe_session_measurements` | session_id, assessment_key, side (`left`/`right`/`bilateral`), measure_key, value (NUMERIC), value2 (NUMERIC, compound only e.g. BP diastolic), detail (JSONB, multi-item instrument breakdown), unit | Tap-captured in-session assessments (scribe Phase 3). **Plain numerics** (not encrypted — kept queryable, same stance as completions/check-ins). `UNIQUE(session_id, assessment_key, side, measure_key)` for upsert. `measure_key` matches a `normative-data.json` key → graded into the SOAP `OBJECTIVE MEASUREMENTS` block via `services/measurement-render.js`. Catalog: `data/assessment-catalog.json` (30 assessments; measure `input` ∈ presets/keypad/compound/toggle/instrument, optional per-measure `laterality`). Instruments (Berg/Mini-BEST) scored server-side by `services/instrument-scoring.js` — total in `value`, items in `detail` |
| `scribe_session_outcomes` | session_id, patient_id, prom_key, responses_enc (AES-256-GCM), score, score_band, detail (JSONB subscale breakdown e.g. DASS-21), cliniko_attachment_id, completed_at | Patient-completed outcome measures (PROMs — Phase 4). Raw responses **encrypted** (sensitive self-report); score+band+detail plain for the note/trend. `UNIQUE(session_id, prom_key)`. Scored server-side by `services/prom-scoring.js` (shapes single/average/sum/percentage/subscales); catalog `data/prom-catalog.json` (NPRS/PSFS/LEFS/K10/DASS-21, expanding). `cliniko_attachment_id` reserved for Phase 4b (PDF→Cliniko, not yet wired) |
| `audit_logs` | user_id, action, resource_type, resource_id, details (JSONB), ip_address | Audit trail for key operations |
| `invitation_tokens` | ..., clinician_id, user_id | Links invitations to the clinician who created them; `user_id` ties the token to its exact user row so `set-password` resolves correctly when the contact email is shared |
| `app_state` | key (PK), value, updated_at | Generic key/value store. Holds the Cliniko auto-sync cursor `cliniko_patient_last_sync` |
| `service_agreements` | cliniko_patient_id, clinician_id, kind, tier, path, details (JSONB), status, token, signed_name/at/ip/capacity, agreement_version, stripe_customer_id, stripe_schedule_id, cliniko_attachment_id | Sign-up automation. One row per minted agreement link. `kind` = `'private'` (block/post-casual/continuity → Stripe) or `'ndis'` (signature-only, no Stripe; NDIS payload in `details`, `tier`/`path`=`'ndis'`, built by `lib/ndis-agreement-content.js`). See `docs/agreement-automation.md` |
| `contacts` | id, contact_type (`gp`/`specialist`/`support_coordinator`/`guardian`/`other`), title, name, organisation, specialty, phone, email, address, notes, created_by | **Shared clinic-wide contacts directory** (referrers/relationships). Reusable across patients; holds third-party PII (clinician-only, audit-logged). Linked to patients via `patient_contacts` |
| `patient_contacts` | patient_id, contact_id, relationship, is_report_recipient, is_emergency | Many-to-many join (`UNIQUE(patient_id, contact_id)`). **Partial-unique index `(patient_id) WHERE is_report_recipient`** = at most one report-recipient GP per patient (auto-fills the GP reassessment letter via `services/contact-letter-meta.js`). Supersedes the deprecated flat `users.emergency_contact_*` / `referring_gp` columns (kept nullable, not dropped) |

## Database patterns

- **Transactions:** use `const client = await db.getClient()` then `client.query('BEGIN')` / `COMMIT` / `ROLLBACK` / `client.release()`. Used in program creation.
- **No joins in patient loading** — `patients.js` fetches patient → programs → exercises → completions in sequential queries (N+1 pattern)
- **Date handling:** use `toLocalDateString()` helper to avoid UTC timezone shifts
