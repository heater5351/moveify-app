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
JOBS=(
  "billing-sync-cliniko|*/15 * * * *|/cron/sync-cliniko"
  "billing-poll-cliniko-appointments|*/15 * * * *|/cron/poll-cliniko-appointments"
  "process-referrals|*/15 * * * *|/cron/process-referrals"
  # billing-reconcile disabled 2026-05-23: it compared against Cliniko invoices,
  # which are not a reliable source of truth. Rework to Xero<->backend if a
  # reconciler is needed. (Live job paused via `gcloud scheduler jobs pause`.)
  "billing-daily-summary|30 1 * * *|/cron/daily-summary"
  "billing-ingest-tyro-drive|0 6 * * *|/cron/ingest-tyro-drive"
  "billing-sweep-idempotency|0 3 * * 0|/cron/sweep-idempotency"
  "billing-dashboard-sync|0 7 * * *|/cron/dashboard-sync"
)

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
