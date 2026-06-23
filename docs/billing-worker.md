# Billing Worker

Cloud Run service `moveify-billing-worker` (separate from `moveify-backend`). Public surface: `/webhooks/stripe` (HMAC-verified) and `/webhooks/tho` (placeholder). All `/admin/*` routes require an `X-Admin-Token` header matching the `billing_admin_token` Secret Manager secret. The worker holds no patient-facing endpoints. See `billing-worker/HANDOVER.md` for full internals (jobs, Xero adapter).

**State store: PostgreSQL (`billing` database in shared `moveify-db` Cloud SQL instance).** Schema in `billing-worker/db/init.sql`, applied at startup via `db/init.js`. Service layer in `services/billing-db.js`. The worker uses its own DB user `billing_worker_user` which is walled off from the `moveify` (patient) DB at the Postgres role level — `cloudsqlsuperuser` membership is explicitly revoked (see `scripts/apply-grants.js`). Sheets is no longer in the runtime path.

**Xero target: "Moveify Health Solutions" production tenant.**
- `XERO_TENANT_ID` secret = `feb50776-7262-4464-adc3-947c93fb0a13`
- `XERO_TYRO_CLEARING_ACCOUNT_ID` env = `0298aadd-45b3-4052-9f52-fa4e0bb0c2cf`
- `XERO_STRIPE_CLEARING_ACCOUNT_ID` env = `ef70673e-507a-42d2-8d81-33500439a8ac`

Re-consenting OAuth (after scope changes / token revocation): run `node billing-worker/scripts/get-xero-token.js` with `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` in env, pick the tenant in the browser flow, then force a worker cold start (`gcloud run services update moveify-billing-worker --region=australia-southeast1 --update-env-vars=BUMP=$(date +%s)`).

**Clean-slate replay tooling:** `/admin/wipe-billing-state` truncates all 15 tables (gated by `confirm: "I-mean-it"`, dry-run by default). `/admin/replay-from-scratch` orchestrates re-seed bank rules → Cliniko sync → Stripe backfill (oldest first, so credit accrues before allocation) → Cliniko appointment backfill → Tyro Drive ingest. Both are admin-only.

**P&P (Program & Platform) invoices:** Created in the Stripe webhook handler (`jobs/stripe-handler.js` `maybeCreatePpInvoice`) when a DD payment lands. The fee covers gym + app access separately from per-session billing — schedule defined in `lib/rates.js` `PP_FEES`. Cadence:
- **Block products** (T1/T2/T3 Foundation/Progress/Performance): one P&P per `subscription.start_date`. Only the first weekly DD creates it; later DDs find the idempotency key and skip.
- **4-weekly products** (Independent / Maintain / Evolve / Independent-Discounted): one P&P per Stripe invoice `period_start` — every 4-week DD cycle gets its own.
- **Elite, Remote Weekly/Fortnightly, App-Only**: no P&P invoice (`amount: 0`).

The P&P invoice is auto-allocated against the just-created Xero overpayment (DD payment → contact credit → P&P consumes it). Idempotency key format: `pp:<cliniko_id>:<anchor_date>`.
