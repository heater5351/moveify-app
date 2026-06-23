# Cliniko Patient Sync

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
