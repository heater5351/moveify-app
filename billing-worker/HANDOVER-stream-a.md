# Stream A Handover — Stripe → Xero credit system

State as of 2026-05-10. Picks up from `C:\Users\dilig\.claude\plans\stripe-xero-credit-system.md` (the spec for Streams A/B/C).

## Status

**Stream A is done and verified in Stripe Test mode.** Cloud Run rev `moveify-billing-worker-00090-69w` is live.

End-to-end test confirmed: Stripe `invoice.payment_succeeded` → $140 Xero overpayment created from Stripe Clearing → P&P invoice for $55 created → $55 allocated → $85 remains as overpayment. Idempotency marked, ledger row written.

**Streams B and C not started.**

## What changed

- `jobs/stripe-handler.js` — full rewrite. Switched from `charge.succeeded` → `invoice.payment_succeeded` + `invoice.payment_failed`. Removed Cliniko writes (Cliniko API is read-only). Creates Xero overpayment + P&P invoice with allocation. Idempotency keys: `stripe:<event.id>` and `pp:<cliniko>:<period_start>`.
- `lib/xero.js` — `createOverpayment` extended to accept `bankAccountAccountId`. Uses POST `/BankTransactions` with `Type: RECEIVE-OVERPAYMENT` (POST `/Overpayments` is read-only — that was the original 404). Added `getContactOverpayments(contactId)`.
- `services/sheets.js` — new `StripePayments` tab + `appendStripePayment` helper.
- `services/stripe.js` — added `getSubscription(id)` helper.
- `routes/admin.js` — `X-Admin-Token` middleware now gates all `/admin/*` (Secret Manager: `billing_admin_token`).
- `lib/secrets.js` — mappings for Stripe staging keys + the new admin token.
- `scripts/get-xero-token.js` — new one-shot Xero OAuth re-consent script (writes refresh token straight to Secret Manager via gcloud stdin).

## Live config

- Stripe **staging** keys are loaded right now (`stripe_api_key_staging`, `billing_stripe_webhook_secret_staging`).
- Live Stripe webhook is **disabled** in the Stripe Dashboard (paused during test).
- `XERO_REFRESH_TOKEN` re-consented with the granular scope set including `accounting.banktransactions` (version 16 in Secret Manager).
- Cloud Run env var: `XERO_STRIPE_CLEARING_ACCOUNT_ID = 72e4d0cc-3334-4c94-a96d-a407f2d8f547`.

## Critical gotchas

1. **Stripe API ≥2024 moved `invoice.subscription`** to `invoice.parent.subscription_details.subscription`. Handler reads the new path with fallback. Don't revert.
2. **Xero `POST /Overpayments` is read-only.** Use `POST /BankTransactions` with `Type: RECEIVE-OVERPAYMENT`. Xero auto-creates the linked overpayment.
3. **Xero scopes were migrated to granular in March 2026.** A re-consent was required to add `accounting.banktransactions`. If a future endpoint type fails 401, re-run `scripts/get-xero-token.js` with the new scope added to the array. See memory `reference_xero_oauth_reauth.md`.
4. **`appendStripePayment` is best-effort** (try/catch, warn-only). Sheets quota errors must not retry the whole webhook (would duplicate Xero records). If a row is missing, backfill from the warn log.
5. **`/admin/*` is shared-secret gated, not IAP.** Pipe the token from gcloud into curl: `curl -H "X-Admin-Token: $(gcloud secrets versions access latest --secret=billing_admin_token)" ...`. See memory `reference_billing_worker_admin_auth.md`.

## Test pollution to clean up in Xero (test mode patient)

- 2× $140 overpayments on the test contact (one pre-fix, one post-fix)
- 1× P&P invoice for $55
- 1× $55 allocation against one of those overpayments

User intends to clean these up manually before swapping to live secrets.

## Pending / not-yet-done

1. **Stream B** — Cliniko appointment poller → Xero session invoice + overpayment allocation. Spec at `~/.claude/plans/stripe-xero-credit-system.md` § "Stream B". Service catalog goes in a new file `lib/service-catalog.js`. Cursor stored in `WorkerState!cliniko_appointments_last_polled`.
2. **Stream C** — Program & Platform invoice cadence beyond first DD. Most of this is already done inline in the Stream A handler (P&P creation per cycle). Spec § "Stream C" still calls for a `Subscriptions` Sheets tab — review if needed.
3. **Swap from staging Stripe → live Stripe.** Procedure in memory `reference_stripe_secret_swap.md`. Don't do this until Stream B is also tested in staging (user intent: test Cliniko side end-to-end first).
4. **Fix CLAUDE.md claim that `/admin/*` is IAP-protected.** Already corrected: now says `X-Admin-Token`.
5. **Migrate billing-worker behind GCP IAP via HTTPS load balancer** (proper Option 2 from security review). 1.5–3 hr work + cert provisioning latency. Required before high-volume production.
6. **Cliniko `getPatients` pagination** — pre-existing limitation, fetches only first 100. Not blocking Stream B for current test patient counts. Must fix before going live with subscriber counts > 100.

## Where to look first when resuming

- This file
- Memory index: `~/.claude/projects/C--Users-dilig-Documents-moveify-app/memory/MEMORY.md`
  - `reference_xero_oauth_reauth.md`
  - `reference_billing_worker_admin_auth.md`
  - `reference_stripe_secret_swap.md`
- Spec: `~/.claude/plans/stripe-xero-credit-system.md`
- Code: `billing-worker/jobs/stripe-handler.js` is the centre of gravity for this work.
