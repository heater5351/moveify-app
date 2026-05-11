# Billing Worker — Referral Pipeline Handover

State as of 2026-05-05. Pick up here.

## Current state

Cloud Run revision **`moveify-billing-worker-00055-fhx`** is the live, working version. Gmail → Bedrock → Cliniko referral pipeline tested end-to-end; both real referrals from the test set processed correctly (patient + DOB + Medicare + doctor contact + practice address + PDF attachment).

Cron schedule: `process-referrals` runs every 15 min (UTC).

## Model

- **Bedrock model:** `au.anthropic.claude-sonnet-4-6` (AU inference profile — keeps PHI in Australia)
- Override via env var `BEDROCK_MODEL_ID` on the Cloud Run service if needed
- Extraction config: `temperature: 0` (no `topP` — Claude rejects both together)
- Schema field `classification_reason` is extracted but **never logged** (model has been observed to include GP/practice names in it)

## What this session changed

1. Bedrock determinism — `temperature: 0`
2. Idempotency mark on failures (junk emails don't reprocess every cron)
3. Removed all Cliniko session-invoice creation (API is read-only there)
4. Patient search by DOB + client-side normalised last-name match (handles apostrophes/hyphens)
5. `updatePatientMissingFields` — fills blanks on existing patients, never overwrites
6. Doctor contact dedup — falls back to name search when no provider number, patches missing fields
7. PHI scrub: `/admin/pending-referrals` returns IDs only; Sheets `Referrals` tab no longer stores subject or filename; `classification_reason` removed from logs
8. Post-extraction validator — keyword reject for insurance/business docs (Guild, AAMI, Allianz, BUPA, HCF, NIB, Medibank, etc.)
9. Switched model from Amazon Nova Pro → Claude Sonnet 4.6
10. Doctor contact now gets practice address (street/suburb/state/postcode) set on create + patched on update

## Known unresolved / TBD

- **"No PDF attachment found" cluster** — typically thread replies / forwards without re-attached PDFs. User confirmed real referrals always have a PDF, so this is acceptable for now. The over-broad Gmail filter `{gpccmp gpmp tca "management plan" "care plan" referral} has:attachment` still catches threads where only the original carries the PDF.
- **No-DOB guard** — Sonnet 4.6 reliably extracts DOB on real referrals, so the "create patient blind when DOB missing" scenario hasn't been seen since the model swap. If it returns, consider adding a flag-for-review guard before `createPatient`.
- **Existing PHI in Sheets** — older `Referrals` rows still have subjects + filenames written by prior code. Manually clear those columns in the Google Sheet.
- **Cliniko vs Halaxy decision** — Tuesday Tyro meeting determines path forward (per project memory).
- **Git commits** — none of this session's changes have been committed yet. All edits are local + deployed to Cloud Run only.

## Useful commands

```bash
# Deploy
gcloud run deploy moveify-billing-worker --source . --region australia-southeast1

# Trigger process-referrals manually
gcloud scheduler jobs run process-referrals --location australia-southeast1

# Clear all referral idempotency keys (so emails can be re-processed)
TOKEN=$(gcloud auth print-identity-token)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"prefix":"referral:"}' \
  https://moveify-billing-worker-1097567971198.australia-southeast1.run.app/admin/clear-idempotency

# Count pending referrals (IDs only — no subjects)
curl -sS -H "Authorization: Bearer $TOKEN" \
  https://moveify-billing-worker-1097567971198.australia-southeast1.run.app/admin/pending-referrals

# List available Bedrock Anthropic models + AU/APAC inference profiles
curl -sS -H "Authorization: Bearer $TOKEN" \
  https://moveify-billing-worker-1097567971198.australia-southeast1.run.app/admin/bedrock-models

# Read structured run logs (PHI-safe)
gcloud logging read 'resource.type="cloud_run_revision"
  AND resource.labels.service_name="moveify-billing-worker"
  AND timestamp>="2026-05-05T00:00:00Z"' \
  --limit 200 \
  --format='value(timestamp,severity,jsonPayload.msg,jsonPayload.messageId,jsonPayload.isReferral,jsonPayload.hasName,jsonPayload.hasDob,jsonPayload.hasMedicare,jsonPayload.clinikoId,jsonPayload.clinikoContactId,jsonPayload.rejectReason,jsonPayload.err)' \
  --order=asc
```

## Re-run checklist

To reprocess a referral that already went through:

1. In Gmail, move the email back into `referral-pending` (remove `referral-done` / `referral-failed`).
2. Clear its idempotency key (or all of them with `prefix: "referral:"` — see above).
3. Trigger the cron job manually.
4. Watch logs (no subjects logged, IDs only).

## Files touched this session

- `services/bedrock.js` — model swap, schema additions, inference config
- `services/cliniko.js` — patient search normalisation, `updatePatientMissingFields`, doctor address fields, name-fallback contact search
- `jobs/process-referrals.js` — validator, classification_reason scrub, fill-missing-fields call
- `jobs/sync-cliniko.js` — removed session-invoice creation entirely
- `routes/admin.js` — `pending-referrals` returns IDs only, `clear-idempotency` accepts `prefix`, new `bedrock-models` endpoint
- `package.json` — added `@aws-sdk/client-bedrock` for the models endpoint
