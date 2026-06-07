#!/usr/bin/env bash
# Idempotent setup of all Cloud Scheduler jobs that drive the billing worker.
# Run this whenever:
#   - Setting up a fresh GCP project
#   - Recovering from accidental deletion of jobs
#   - Reviewing what crons exist (this file is the source of truth)
#
# Each `create-or-update` block uses `gcloud scheduler jobs describe` to detect
# existence — re-runs are safe.
#
# Usage:
#   ./scripts/setup-cron.sh

set -euo pipefail

PROJECT="${PROJECT:-moveify-app}"
REGION="${REGION:-australia-southeast1}"
SERVICE_URL="${SERVICE_URL:-https://moveify-billing-worker-1097567971198.${REGION}.run.app}"
SA="${SA:-billing-worker@${PROJECT}.iam.gserviceaccount.com}"
TZ="${TZ:-Australia/Sydney}"

# (name, schedule, path) — the path is appended to SERVICE_URL.
#
# Cadence note (cost review 2026-06-07): the high-frequency polls were stretched
# from */15 to hourly to cut Cloud Run wakes ~75%. None need sub-hourly freshness
# — all are cursor/recompute based, so a less frequent run just processes a bigger
# batch with no data loss. See "GCP Cost Review 2026-06" in the exec-assistant vault.
JOBS=(
  "billing-poll-cliniko-appointments|0 * * * *|/cron/poll-cliniko-appointments"
  "process-referrals|0 * * * *|/cron/process-referrals"
  "billing-sync-block-progress|0 * * * *|/cron/sync-block-progress"
  # billing-reconcile disabled 2026-05-23: it compared against Cliniko invoices,
  # which are not a reliable source of truth. Rework to Xero<->backend if a
  # reconciler is needed. (Live job paused via `gcloud scheduler jobs pause`.)
  "billing-daily-summary|30 1 * * *|/cron/daily-summary"
  "billing-ingest-tyro-drive|0 6 * * *|/cron/ingest-tyro-drive"
  "billing-sweep-idempotency|0 3 * * 0|/cron/sweep-idempotency"
)
# Not managed here (kept off this list to match live state):
#   - billing-sync-cliniko / billing-dashboard-sync: defined historically but not
#     currently deployed as scheduler jobs.
#   - moveify-reconcile-agreements + staging variants: created at agreement-flow
#     go-live, see CLAUDE.md "Service-Agreement → Stripe Automation".

upsert_job() {
  local name="$1" schedule="$2" path="$3"
  local uri="${SERVICE_URL}${path}"

  if gcloud scheduler jobs describe "$name" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
    echo "  update  $name  ($schedule)  →  $path"
    gcloud scheduler jobs update http "$name" \
      --location="$REGION" \
      --project="$PROJECT" \
      --schedule="$schedule" \
      --time-zone="$TZ" \
      --uri="$uri" \
      --http-method=POST \
      --oidc-service-account-email="$SA" \
      --oidc-token-audience="$SERVICE_URL" \
      --attempt-deadline=180s \
      >/dev/null
  else
    echo "  create  $name  ($schedule)  →  $path"
    gcloud scheduler jobs create http "$name" \
      --location="$REGION" \
      --project="$PROJECT" \
      --schedule="$schedule" \
      --time-zone="$TZ" \
      --uri="$uri" \
      --http-method=POST \
      --oidc-service-account-email="$SA" \
      --oidc-token-audience="$SERVICE_URL" \
      --attempt-deadline=180s \
      >/dev/null
  fi
}

echo "Setting up Cloud Scheduler jobs in $PROJECT / $REGION"
echo "Target service: $SERVICE_URL"
echo "Service account: $SA"
echo ""

for entry in "${JOBS[@]}"; do
  IFS='|' read -r name schedule path <<< "$entry"
  upsert_job "$name" "$schedule" "$path"
done

echo ""
echo "Done. Configured ${#JOBS[@]} jobs."
