# Environment Variables

## Backend (`backend/.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `DATABASE_URL` | Yes (local) | — | PostgreSQL connection string (local dev) |
| `INSTANCE_CONNECTION_NAME` | Yes (GCP) | — | Cloud SQL socket path (production) |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Yes (GCP) | — | Cloud SQL credentials (production) |
| `FIREBASE_PROJECT_ID` | **Yes** | — | GCP Identity Platform project. **Prod = `moveify-app`; staging = `moveify-staging`** (separate project — see Branches in `docs/deployment-workflow.md`). Used by `firebase-admin` to verify ID tokens. If this is set but `FIREBASE_SERVICE_ACCOUNT_JSON`/split creds are absent, `lib/identity-platform.js` initializes **keyless via Application Default Credentials** (the Cloud Run runtime SA) against this project — used by staging, whose org policy forbids SA key files. |
| `FIREBASE_CLIENT_EMAIL` | **Yes** | — | Identity Platform service-account email |
| `FIREBASE_PRIVATE_KEY` | **Yes** | — | Identity Platform service-account private key (`\n`-escaped; deploy via `--env-vars-file` YAML) |
| `JWT_SECRET` | No (removed) | — | **No longer read** — the legacy JWT path was removed in Phase 4 (2026-06-10). Safe to drop from Cloud Run env / Secret Manager binding. |
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
| `PATIENT_FILES_BUCKET` | No (patient Files feature) | — | GCS bucket name for patient file attachments (PMS Files tab). Must be in **`australia-southeast1`** (data residency). Accessed via ADC = the Cloud Run runtime SA, which needs `roles/storage.objectAdmin` on the bucket. Downloads stream through the authenticated backend (no signed/public URLs). **If unset the Files feature degrades to a "storage not configured" state** — uploads disabled, no crash. Each environment (prod/staging) needs its own bucket. |

## Frontend (`frontend/.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_API_URL` | No | `http://{hostname}:3000/api` | Backend API URL (dynamic hostname fallback in `config.ts`) |
| `VITE_FIREBASE_API_KEY` | **Yes** | — | Identity Platform web API key (login fails without it) |
| `VITE_FIREBASE_AUTH_DOMAIN` | **Yes** | — | `moveify-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | **Yes** | — | `moveify-app` |
