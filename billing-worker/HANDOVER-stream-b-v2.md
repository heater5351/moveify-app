# Stream B Handover v2 — entitlements, group attendance, robust matching, backfill

State as of 2026-05-11. Picks up from `HANDOVER-stream-a.md` (Stream A) and the original `HANDOVER-stream-b.md` (Stream B initial). This document supersedes the original Stream B handover.

## Status

**End-to-end validated against live production Stripe + production Cliniko reads, writing to a Xero Demo Company tenant.** Cloud Run revision deployed and stable. Every expected invoice landed in Demo Co during the dry-run.

Three real subscribers were used as the test cohort:

| Tier | Cliniko ID | Stripe customer | Real person |
|---|---|---|---|
| T1 Post-Casual ($58/wk) | `1936954367752023952` | `cus_UQH3R1GOhtxGQE` | — |
| Independent-Discounted ($120/4w) | `1936912609345285685` | `cus_UKKvfMngFRcfed` | Doug |
| Independent-Discounted ($120/4w) | `1936949984083586955` | `cus_UMsHcTicX7M9Tx` | Doug's spouse |

Expected vs invoiced: all 5 expected invoices created (Doug ×2, spouse ×1, T1 ×2 group sessions).

## Where the worker is pointed right now

- **Xero tenant:** Demo Company (AU) — `6a02af04-e8f6-456e-9346-96d6658fe985`
- **Xero Stripe Clearing bank account ID:** `13918178-849a-4823-9a31-57b7eac713d7` (Demo Co's "Business Bank Account" used as stand-in)
- **Stripe API key:** **LIVE mode** (`stripe-secret-key` mapped to `STRIPE_API_KEY` in Secret Manager) — but the live webhook endpoint is **DISABLED** in Stripe Dashboard, so no real-time DDs flow in. Backfill is API-driven, not webhook-driven.
- **Stripe webhook secret:** still mapped to staging — irrelevant while webhook is disabled
- **Cliniko keys:**
  - `cliniko-api-key-admin` → `CLINIKO_API_KEY` (referrals pipeline writes patients/contacts/attachments)
  - `cliniko-api-key-finance` → `CLINIKO_API_KEY_FINANCE` (poller/sync/reconcile — read-only Cliniko user)
- **Safety belt:** `XERO_SANDBOX_TENANT_IDS=6a02af04-e8f6-456e-9346-96d6658fe985` — guard allows writes to Demo Co. Once Stripe goes live AND Xero tenant becomes a real prod org, the guard becomes a no-op (not test mode), but the allowlist still works as a defense.

## What this work added

### Subscription-aware billing
- `findSubscriptionsCoveringDate(clinikoId, email, name, dateIso)` — walks all subs (any status) for the matched Stripe customer; `[start_date, ended_at || now]` window plus **7-day pre-signup grace** to capture "attended then signed up same day"
- Per-product **entitlements whitelist** in `lib/rates.js` PP_FEES — only appointment types in the subscription's entitlements consume credit; everything else is treated as casual (skipped). V1: types only. Per-cycle quotas (e.g., "4 group sessions per T1 block") **NOT YET ENFORCED** — V2 work
- **Block-anchored P&P:** for `billing: 'block'` products, the idempotency anchor is `subscription.start_date`. Weekly DDs across a 6-week T1 produce ONE $85 P&P, not 6. Continuity products still anchor to `invoice.period_start`
- **Product name from invoice line items** (not the current subscription state) — backfill replays book the historical tier

### Group session support
- `cliniko.finance.getAttendeesAll(since)` paginating `/attendees?updated_at[gt]=...`
- `cliniko.finance.getGroupAppointment(id)` with per-secret cache
- Each attended attendee is wrapped as a synthetic appointment record `{ id: 'group-attendee-<aid>', patient_arrived: true, patient, appointment_type, starts_at }` and fed through the existing `processAppointment` pipeline
- Idempotency key shape `appointment:group-attendee-<attendee_id>` avoids collision with individual appointments

### Robust Stripe ↔ Cliniko matching
- **Sheets `StripeClinikoLinks` cache** populated by Stream A's `resolveClinikoPatient` on every successful link. Carries the load because the live Stripe API key is restricted (no `customer.update.metadata` write permission)
- Stream B's `findSubscriptionsCoveringDate` consults this cache FIRST, before falling back to email/name search
- **Token-based name matching** with ≥3-char first-name prefix (Doug↔Douglas, Alex↔Alexander, Rob↔Robert) and exact last-name match. Defeats substring false-positives like "smith jane" being picked up against "john smith"
- Fall-through: when email matches a Cliniko patient but the name doesn't fit, search the full sheet for a name-unique match instead of refusing outright. Catches the "shared household email, different Cliniko records" pattern
- Refuses to auto-link when ambiguous — writes a `stripe_patient_not_found` ReconciliationFlag

### Backfill tooling
- `POST /admin/backfill-stripe { since, until?, dryRun, limit }` — paginates paid Stripe invoices, replays each via `backfillInvoice(invoice)`. Idempotency prefix `stripe-backfill:` distinct from webhook's `stripe:`. Skips `$0` invoices cleanly (trial conversions etc.)
- `POST /admin/backfill-cliniko-appointments { since, clearIdempotency, dryRun }` — rewinds the cursor, optionally clears `appointment:*` keys, drives the existing poller (which now handles both individual and group attendees)
- Stripe handler refactored into `processInvoicePaid(invoice, ctx, log)` shared by `handleInvoicePaid` (webhook) and `backfillInvoice`

### PHI hygiene
- `Appointment invoiced` log surfaces `service_code` (catalog reference) not `service_name` (treatment-specific)
- Backfill responses return only invoice IDs, amounts, dates, and counts — no customer email/name/tier paired with a patient ID
- Diagnostic admin endpoints return Stripe customer IDs only; sub date fields as ISO strings (no PHI)

## Verified end-to-end flow

```
Stripe live invoices (since 2026-04-01)
   └─→ /admin/backfill-stripe (dryRun: false)
         ├─→ for each paid invoice, processInvoicePaid:
         │      ├─→ resolveClinikoPatient (email + name-prefix + cache write)
         │      ├─→ getProductNameFromInvoice → PP_FEES lookup
         │      ├─→ Xero overpayment created (Demo Co)
         │      ├─→ maybeCreatePpInvoice (block-anchored or 4-weekly)
         │      └─→ backAllocateOutstanding (sweep remaining credit to outstanding invoices)
         └─→ 3 overpayments + 3 P&P invoices in Demo Co (1× T1 block, 2× Independent-Discounted)

Cliniko attended appointments + group attendees (since 2026-04-01)
   └─→ /admin/backfill-cliniko-appointments (clearIdempotency: true)
         ├─→ /appointments → 44 individual, 10 attended
         ├─→ /attendees → 47 attendees, 12 arrived → 2 distinct group_appointments
         └─→ for each (real + synthetic): subscription cover → entitlement check → invoice + allocate
              5 session invoices created (Doug ×2, spouse ×1, T1 group ×2)
```

## Critical gotchas

1. **Stripe live API key is restricted.** The current `STRIPE_API_KEY` secret holds a `rk_live_*` key with read-only scope on customer metadata. `updateCustomerMetadata` calls silently fail. The Sheets `StripeClinikoLinks` cache replaces this lookup path — works fine, just an extra round-trip per appointment versus the metadata-only path. **Upgrade to an unrestricted key when convenient.**
2. **Live Stripe webhook is DISABLED.** Re-enable in Stripe Dashboard at cutover. While disabled, no real-time DDs flow into the worker — backfill is the only path. If a real DD clears during the disable window, you'll miss it unless you re-run backfill with a later `since`.
3. **Idempotency contamination from Demo Co testing.** Several `stripe:`, `stripe-backfill:`, `pp:`, `appointment:` keys exist in the IdempotencyKeys sheet from all the dry-run iterations. **Before cutover to fresh prod Xero, clear ALL of these** so backfill against the new tenant doesn't think it's already been processed.
4. **Entitlements V1 is whitelist-only, no quotas.** A patient who attends more than their block allowance (e.g., 5 group sessions on a T1 Post-Casual that only entitles 4) would still get all 5 invoiced; back-allocation handles credit shortfalls but the bookkeeping doesn't enforce the limit. V2 work item.
5. **Xero `POST /Overpayments` is read-only.** Inherited gotcha from Stream A — we POST `/BankTransactions` with `Type: RECEIVE-OVERPAYMENT` instead. Already wired correctly.
6. **Cliniko `getPatients` pagination limit.** Pre-existing — fetches only first 100. Not blocking until subscriber count >100. Not yet fixed.
7. **SOP v6 says "worker creates Cliniko invoices and payments"** — aspirational, wrong. Cliniko's invoice/payment API is read-only; worker writes Xero records instead. Worth a SOP rev.
8. **The Independent-Discounted product is a one-off.** Its hardcoded $35 P&P entry in `PP_FEES` is for this single patient (per Doug's clarification). Future discount variants will need entries or a refactor to Stripe-product-metadata-based pricing.

## Live test cohort details (Demo Co Xero state)

State accumulated across many backfill iterations. The most recent run produced:

| Xero Invoice | Patient | Service | $ | Allocated | Gap |
|---|---|---|---|---|---|
| ORC1077 | Doug | Subsequent 30min Private | $85 | $0 | $85 |
| ORC1078 | Doug | Subsequent 30min GPCCMP | $85 | $0 | $85 |
| ORC1079 | Spouse | Subsequent 30min Private | $85 | $85 | $0 |
| ORC1080 | T1 patient | Group Consultation | $30 | $30 | $0 |
| ORC1081 | T1 patient | Group Consultation | $30 | $28 | $2 |

Doug's $85 gaps are Demo Co accumulation noise — in fresh prod Xero with one $120 DD ($35 P&P, $85 credit), the first session covers fully and the second invoice gaps $85 until next DD. Back-allocation handles it automatically.

## Pending — V2 work

In rough priority order:

1. **Cloud Scheduler cron job** hitting `/cron/poll-cliniko-appointments` every 15 min (currently manual triggers only). Trivial to set up via gcloud.
2. **Entitlement quotas (Layer 2)** — per-product session counts (e.g., T1 block = 4 group + 1 reassessment). Tracked in a `SubscriptionUsage` Sheets tab keyed by `(cliniko_id, sub_id, anchor)`. Anchor = `sub.start_date` for blocks, derived 4-week window for continuity.
3. **Cliniko `getPatients` pagination** before subscriber count crosses 100.
4. **Production cutover sequence:**
   - Wipe / freshly provision the production Xero org
   - Re-run `scripts/get-xero-token.js` against the new prod tenant; update `XERO_TENANT_ID` secret
   - Create a Stripe Clearing bank account in the new prod org; update `XERO_STRIPE_CLEARING_ACCOUNT_ID` env var
   - Optionally remove Demo Co from `XERO_SANDBOX_TENANT_IDS` (no longer needed for live testing)
   - **Clear all `appointment:*`, `stripe-backfill:*`, `pp:*`, `stripe:*` idempotency keys**
   - Re-run `/admin/backfill-stripe { since: '2026-04-01' }`
   - Re-run `/admin/backfill-cliniko-appointments { since: '2026-04-01T00:00:00Z', clearIdempotency: true }`
   - Spot-check Xero state against Stripe + Cliniko reality
   - Re-enable the Stripe **live** webhook endpoint
5. **Unrestricted Stripe API key** so `customer.metadata.cliniko_id` writes succeed (perf optimisation — current Sheets cache works fine)
6. **SOP v6 revision** to match operational reality (worker writes Xero, not Cliniko, for financial records)
7. **Remove COVERAGE_DIAG and the per-skip stats counters** once production is stable — they're useful during cutover but noisy long-term

## Useful commands

```bash
BASE="https://moveify-billing-worker-1097567971198.australia-southeast1.run.app"
TOKEN_ID=$(gcloud auth print-identity-token)
ADMIN=$(gcloud secrets versions access latest --secret=billing_admin_token)

# Stripe backfill — dry-run first to see candidates
curl -sS -X POST -H "Authorization: Bearer $TOKEN_ID" -H "X-Admin-Token: $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"since":"2026-04-01","dryRun":true,"limit":1000}' \
  $BASE/admin/backfill-stripe | python -m json.tool

# Cliniko appointment backfill — clearIdempotency true gives a clean slate
curl -sS -X POST -H "Authorization: Bearer $TOKEN_ID" -H "X-Admin-Token: $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"since":"2026-04-01T00:00:00Z","clearIdempotency":true,"dryRun":false}' \
  $BASE/admin/backfill-cliniko-appointments | python -m json.tool

# Audit: which Stripe customer ↔ Cliniko patient links are cached?
curl -sS -H "Authorization: Bearer $TOKEN_ID" -H "X-Admin-Token: $ADMIN" \
  $BASE/admin/stripe-cliniko-links | python -m json.tool

# Inspect a contact's full Xero state
curl -sS -G --data-urlencode "name=Ryan Heath" \
  -H "Authorization: Bearer $TOKEN_ID" -H "X-Admin-Token: $ADMIN" \
  $BASE/admin/xero-contact-inventory | python -m json.tool

# Clear idempotency by prefix (multi-prefix)
for p in stripe-backfill: pp: appointment:; do
  curl -sS -X POST -H "Authorization: Bearer $TOKEN_ID" -H "X-Admin-Token: $ADMIN" \
    -H "Content-Type: application/json" -d "{\"prefix\":\"$p\"}" \
    $BASE/admin/clear-idempotency
done

# Rewind the appointment poller cursor manually
curl -sS -X POST -H "Authorization: Bearer $TOKEN_ID" -H "X-Admin-Token: $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"key":"cliniko_appointments_last_polled","value":"2026-04-01T00:00:00Z"}' \
  $BASE/admin/worker-state

# Read recent worker logs (PHI-safe — service codes only)
gcloud logging read 'resource.type="cloud_run_revision"
  AND resource.labels.service_name="moveify-billing-worker"
  AND jsonPayload.msg="Appointment invoiced"' \
  --limit 30 --freshness 1h --format=json
```

## Files touched in this session

- `services/cliniko.js` — `admin`/`finance` namespace split; finance gets `getAttendeesAll`, `getGroupAppointment` + per-secret caches
- `services/stripe.js` — `findSubscriptionsCoveringDate` (date-aware coverage with grace period and Sheets-cache lookup), `getProductNameFromInvoice`, name-token disambig
- `services/sheets.js` — `StripeClinikoLinks`, `AppointmentInvoices`, `StripePayments` tabs; `appendAppointmentInvoice`, `upsertStripeClinikoLink`
- `jobs/poll-cliniko-appointments.js` — full processing pipeline with subscription gate + entitlements + group attendee synthesis + per-skip-reason stats
- `jobs/stripe-handler.js` — refactored to `processInvoicePaid` shared by webhook and backfill; product name from invoice line; block-anchored P&P; back-allocation pass
- `lib/rates.js` — entitlements per PP_FEES product, T1/T2/T3 standard + post-casual + Independent + Independent-Discounted + Maintain/Evolve/Elite + Remote/App-Only
- `lib/secrets.js` — `cliniko-api-key-admin`, `cliniko-api-key-finance`, `cliniko-api-key-staging`; `stripe-secret-key` → `STRIPE_API_KEY` (live)
- `lib/xero.js` — safety belt, `applyCreditNote`, `findContactByName`, `getContactBankTransactions`, `getContactInvoices`, `deleteBankTransaction`, `deleteOverpayment` (committed in prior session)
- `routes/admin.js` — many new diagnostic + cleanup endpoints (see "Useful commands")

## Where to look first when resuming

1. **This file.**
2. **Git log** — three billing-worker commits stacked on `main`, not yet pushed:
   - `d756f9b` (this session) — entitlements, group attendance, robust matching, backfill
   - `017574c` — subscription gate + admin/finance Cliniko split + cleanup tools
   - `318e2016` — initial commit of the entire billing-worker
3. **Memory:**
   - `~/.claude/projects/C--Users-dilig-Documents-moveify-app/memory/MEMORY.md`
   - `reference_xero_oauth_reauth.md`, `reference_billing_worker_admin_auth.md`, `reference_stripe_secret_swap.md`
4. **Source docs (Google Drive):**
   - `moveify_stripe_payment_links_reference_v1.docx` — payment link configs + product names
   - `moveify_billing_sop_v6.docx` — billing operations SOP (has the "Cliniko = source of truth" inaccuracy; otherwise correct)
   - `moveify_parttime_pricing_v3_updated.docx` — pricing scheme + session entitlements per tier
5. **Code centre of gravity:** `jobs/poll-cliniko-appointments.js` (Stream B) and `jobs/stripe-handler.js` (Stream A) — most of the dry-run iteration touched these.
