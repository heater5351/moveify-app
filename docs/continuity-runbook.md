# Moveify — Continuity & Operations Runbook

*Last updated: 2026-06-24*

**Why this exists:** Moveify is a production app holding real patient health data, run by a
solo founder. The single largest *operational* risk is **bus factor of one** — if the founder
is unavailable, nobody else can deploy, recover, or respond to an incident. This runbook is the
minimum viable handover: it lets a competent engineer (or future you, under stress) operate and
recover the system. It contains **no secret values** — only the names and locations of things.

Companion docs: `docs/deployment-workflow.md` (deploy detail), `docs/breach-response-plan.md`
(NDB scheme), `docs/data-retention-policy.md`, `docs/environment-variables.md`, `docs/architecture.md`.

---

## 1. Critical accounts & access (do this first: MFA)

> 🔴 **Top action — enforce MFA on every account below.** A single phished password on the
> Google or GitHub owner account = full access to all patient health data and an automatically
> **notifiable breach**. Everything else in this runbook is secondary to this.

| System | What it controls | MFA? (verify & tick) |
|---|---|---|
| Google / GCP (`moveify-app`) | Backend, Cloud SQL, Secret Manager, Identity Platform, all PHI | ☐ |
| GitHub (`heater5351`) | Source of truth; push = deploy path | ☐ |
| Vercel | Frontend hosting + deploys | ☐ |
| Cloudflare | Domain `moveifyapp.com` + DNS | ☐ |
| Stripe | Live payments | ☐ |
| Xero | Accounting / billing target | ☐ |
| Cliniko | Practice management (demographics source of truth) | ☐ |
| AWS (`796197769620`) | Bedrock + Transcribe | ☐ |
| Google Workspace | Email, owner identity | ☐ |

**Break-glass:** store recovery codes for each in a password manager (e.g. Bitwarden/1Password)
and give a trusted second person sealed emergency access (or hold codes with a
solicitor/accountant). Without this, losing one device can lock you out of patient data
permanently.

---

## 2. Infrastructure inventory (what runs where)

| Component | Provider | Identifier | Region |
|---|---|---|---|
| Frontend (web SPA) | Vercel | project for `moveifyapp.com` | Global CDN |
| Backend API (prod) | Cloud Run | `moveify-backend` | australia-southeast1 |
| Backend API (staging) | Cloud Run | `moveify-backend-staging` | australia-southeast1 |
| Billing worker | Cloud Run | `moveify-billing-worker` | australia-southeast1 |
| Database | Cloud SQL (PostgreSQL) | `moveify-app:australia-southeast1:moveify-db` | australia-southeast1 |
| Auth (prod) | GCP Identity Platform | project `moveify-app` | — |
| Auth (staging) | GCP Identity Platform | project `moveify-staging` | — |
| AI inference | AWS Bedrock + Transcribe | account `796197769620` | ap-southeast-2 |
| File/video storage | Google Cloud Storage | (exercise videos; patient files bucket) | australia-southeast1 |
| Email | Gmail API (OAuth) | transactional only | — |
| DNS / domain | Cloudflare | `moveifyapp.com` (DNS only, no proxy) | — |
| Scheduled jobs | Cloud Scheduler | purge-transcripts (hourly), sync-cliniko (daily ~5:00 AEST), reconcile-agreements (6-hourly), etc. | australia-southeast1 |

**All PHI stays in australia-southeast1 + Cliniko AU + Bedrock ap-southeast-2.** Never move the
database or add a non-AU processor without legal review (Privacy Act / APP 8).

---

## 3. Secrets (names only — never read or print values)

All runtime secrets live in **GCP Secret Manager** (project `moveify-app`) and are mounted into
Cloud Run as env vars. Known names include: `CLINIKO_API_KEY`, `SCRIBE_ENCRYPTION_KEY`,
`STRIPE_API_KEY*`, `billing_stripe_webhook_secret*`, `XERO_CLIENT_ID/SECRET/REFRESH_TOKEN/TENANT_ID`,
`billing_admin_token`, `moveify-aws-billing-readonly-id/-key`, plus DB credentials and the
`FIREBASE_*` / service-account material. Full list: Secret Manager console.

Rules: never log, print, or display a secret value (project hard rule). To *use* a secret in a
command without exposing it, inject via command substitution:
`PGPASSWORD="$(gcloud secrets versions access latest --secret=<name>)" psql ...`.
After rotating a billing-worker secret, force a cold start so the cached value reloads (see §4).

---

## 4. Deploy procedures

Default push target is **`dev`** (staging). Only `dev → main` when releasing. Full detail in
`docs/deployment-workflow.md`; the essentials:

**Frontend** — instant, zero-downtime. Push to git; Vercel auto-builds (`dev` → preview,
`main` → production). No command needed.

**Backend (prod)** — ~30s downtime; prefer outside AEST business hours:
```
gcloud run deploy moveify-backend --source backend/ --region australia-southeast1 \
  --platform managed --allow-unauthenticated \
  --add-cloudsql-instances moveify-app:australia-southeast1:moveify-db
```
Staging is the same with `moveify-backend-staging`.

**Billing worker** (deploy then force cold start after secret/token changes):
```
gcloud run deploy moveify-billing-worker --source ./billing-worker --region australia-southeast1 \
  --platform managed --allow-unauthenticated
gcloud run services update moveify-billing-worker --region=australia-southeast1 \
  --update-env-vars BUMP=$(date +%s)
```

**Before a prod release:** run DB migrations on prod Cloud SQL *first*, add any new env vars to
the prod service *first*, then deploy backend, then merge (frontend follows on merge).

**Verify a deploy:** `curl https://<backend-url>/health` → expect `{"status":"OK",...}`
(`503 UNAVAILABLE` means the DB isn't ready yet).

---

## 5. Database backup & restore  ← restore drill

**Backups:** Cloud SQL automated daily backups (7-day retention) + Point-In-Time Recovery
(PITR enabled 2026-06-10). Verify both are still on:
```
gcloud sql instances describe moveify-db --project=moveify-app \
  --format="yaml(settings.backupConfiguration)"
```

**Restore drill (do this quarterly).** A backup you have never restored is a backup you do not
have. Run the safe drill — it clones prod backups into a throwaway instance, verifies, and
deletes it, without ever touching production:
```
scripts/restore-drill.sh            # clone current state, verify, delete
scripts/restore-drill.sh --pitr 2026-06-24T04:00:00Z   # also test the PITR path
scripts/restore-drill.sh --keep     # leave clone up to smoke-test the app against it
```
Record the date of the last successful drill here: **2026-06-24** — clone came up
`RUNNABLE` with all databases (`moveify`, `moveify_staging`, `billing`) reconstituted from
backup, then auto-deleted; production untouched. Next due: ~2026-09.

**Real recovery in an incident** (data loss / bad migration):
1. **Do not** `backups restore` over production blindly. First clone to a new instance at a known-good
   time: `gcloud sql instances clone moveify-db moveify-db-recovered --point-in-time <RFC3339>`.
2. Verify the recovered data on the clone.
3. Re-point the backend at the recovered instance (update `INSTANCE_CONNECTION_NAME` / connection),
   or, once confident, promote it. Keep the damaged instance for forensics until resolved.

---

## 6. Incident & breach response (first 60 minutes)

Full plan: `docs/breach-response-plan.md` (Ryan = breach lead, OAIC = regulator). Quick start:

1. **Contain** — if credentials are involved, rotate the affected secret(s) in Secret Manager and
   force a redeploy/cold start; revoke the compromised account session; disable the account.
2. **Assess** — is PHI involved? `audit_logs` (in Postgres) is the access trail. Cloud Run +
   Cloud SQL logs in Cloud Logging. Scope: whose data, what fields, how exposed.
3. **Decide notifiability** — likely *serious harm* + unauthorised access/disclosure ⇒ **Notifiable
   Data Breach**: notify OAIC and affected individuals (OAIC 1300 363 992). Don't sit on it.
4. **Record** — timeline, scope, actions. The breach plan has the template.

**App down (not a breach):** check `/health`; check Cloud Run revision health + logs
(`gcloud run services logs tail moveify-backend --region australia-southeast1`); check Cloud SQL
instance state. The backend self-restarts on repeated DB errors (5 strikes). Roll back by
re-deploying the previous revision in the Cloud Run console.

---

## 7. Monitoring & cost

- **Logs:** `gcloud run services logs tail moveify-backend --region australia-southeast1`
  (swap service name for worker/staging).
- **Cost:** GCP budget alert set at **$30/mo** (steady state ~$26–28 gross; floor = Cloud SQL ~$17).
  BigQuery billing export exists (`moveify-app.billing_export`). AWS via
  `scripts/aws-cost-report.py` (read-only key in Secret Manager; group by Usage, not net —
  credits mask spend). Vercel: confirm a **commercial (Pro) plan** — Hobby is non-commercial.
- **Health:** `GET /health` on the backend; Vercel dashboard for the frontend.

---

## 8. If the founder is unavailable — minimum handover

A second person needs, at minimum: (a) break-glass access from §1, (b) this runbook, (c) the repo,
(d) Cloud Run console access to roll back a bad revision, (e) the breach plan. With those, they can
keep the service up, recover the database (§5), and respond to a breach (§6). Keep this file current
whenever infrastructure changes — treat it like the deploy docs.
