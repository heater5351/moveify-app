# Deployment & Workflow

## Deployment

- Frontend: **Vercel** (vite build → `dist/`) — live at **https://www.moveifyapp.com**
- Backend: **GCP Cloud Run** (Docker container) + **Cloud SQL PostgreSQL** (`australia-southeast1`)
- Environment variable `VITE_API_URL` points frontend to backend (falls back to `localhost:3000`)
- Cloud Run connects to Cloud SQL via Unix socket (`/cloudsql/{INSTANCE_CONNECTION_NAME}`)
- `backend/Dockerfile` builds the container; `backend/database/db.js` switches between Cloud SQL socket and `DATABASE_URL` based on env vars
- Domain: **moveifyapp.com** registered on Cloudflare, DNS pointing to Vercel (DNS only, no proxy)

## Mobile App (Android)

- **Capacitor 8** wraps the existing React SPA into a native Android app for Google Play
- Android project lives at `frontend/android/`, app ID: `com.moveifyhealth.app`
- Build: `cd frontend && npm run build:android` (builds SPA + syncs to Android project)
- APK is built via Gradle: `cd frontend/android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug`
- The Android WebView loads local files; API calls go to the Cloud Run backend via `VITE_API_URL` baked in at build time (from `frontend/.env.production`)
- CORS allows `https://localhost` and `capacitor://localhost` for WebView origins
- `FRONTEND_URL` env var on Cloud Run controls where email links (invitations, password resets) point — currently `https://www.moveifyapp.com`
- **When the app is on Google Play:** email links will open in the browser, not the app. Deep linking (Android App Links) is a future enhancement if needed
- **When modifying email templates or links:** consider that patients may be using the website OR the Android app. Links should always use `FRONTEND_URL` and point to the web domain (works in both contexts)

## Keeping context fresh (avoid doc drift)

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

## Branches

- **`dev`** — active development branch. Push here for staging. Vercel auto-deploys a preview URL; backend targets `moveify-backend-staging` + `moveify_staging` DB.
  - **Staging auth is a separate Firebase project (`moveify-staging`), isolated from prod (2026-06-21).** Before this, staging + prod shared the `moveify-app` Identity Platform project, so staging logins/set-passwords/**deletes** mutated real patient accounts (and colliding integer `firebase_uid`s clobbered each other). The staging backend now auths **keyless via ADC** (its runtime SA holds `roles/firebaseauth.admin` on `moveify-staging`); the dev-branch Vercel **Preview** `VITE_FIREBASE_*` point at `moveify-staging`. Prod (`moveify-app`) and its Production-scope Vercel vars are untouched. Staging DB rows carry old-project `firebase_uid`s — they relink on first login via the email fallback, or just create fresh test patients.
- **`main`** — production. Only merge `dev → main` when ready to release.

**⚠ Default push target is `dev`. Never push directly to `main` unless explicitly asked.**

## Daily workflow (dev branch)

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
gcloud run services update moveify-billing-worker --region=australia-southeast1 --update-env-vars BUMP=$(date +%s)
```

## Merging dev → main (production release)

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
vault at `C:\Users\dilig\Documents\executive-assistant` (read-mostly from here; it is
PHI-free and secret-free by rule, so safe to read). Start at the index and read on
demand — don't bulk-load (some docs are long):

  `C:\Users\dilig\Documents\executive-assistant\20-Projects\Moveify-App\Context Index for Code Sessions.md`

The index maps "working on X → read Y". Consult it when touching:
- **billing/claims** — billing-worker, Stripe/Tyro/Xero, P&P fees, pricing tiers
- **patient-facing legal copy** — `TermsPage.tsx`, privacy, consent, cancellation/refund wording
- **clinic-website** marketing copy

The vault is authoritative for *intent/rationale*; the repo is authoritative for *code*.
Don't copy vault content into the repo — link by path. Flag any code↔vault mismatch.
(The vault dir is granted access via `permissions.additionalDirectories` in
`.claude/settings.local.json`.)

**Keep the vault in sync when you ship (since 2026-06-13).** When a code session
fulfils or supersedes a vault build/plan note (e.g. a `… - Pending Code Edit.md`),
update that note in the same session: set its `status`, add a short "what shipped"
summary pointing back to the repo as authoritative for code, and tick its follow-ups.
Keep edits **PHI-free and secret-free**, and **don't rewrite the decisions/rationale**
— only the status/implementation layer. Add a one-line pointer to the vault's
`Context Index for Code Sessions.md` if the work introduces a new capability. The
Content-Engine `Performance Ledger` remains append-only. This mirrors the repo's own
worklog/CLAUDE.md self-maintenance rule — do both so neither source drifts.
