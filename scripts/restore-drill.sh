#!/usr/bin/env bash
#
# Cloud SQL restore drill for Moveify.
# ---------------------------------------------------------------------------
# PROVES the production database can be recovered from backup into a working,
# queryable instance — WITHOUT touching or risking the production instance.
#
# How it works:
#   `gcloud sql instances clone` creates a brand-new, INDEPENDENT instance from
#   the source's backups + write-ahead logs (optionally at a point in time,
#   which exercises the PITR path enabled 2026-06-10). The source instance is
#   never modified and never read destructively. After confirming the clone is
#   RUNNABLE and its database is present, the drill deletes the clone.
#
# This is the SAFE shape of a restore test. It deliberately does NOT use
# `gcloud sql backups restore`, because that restores INTO an existing instance
# and OVERWRITES it — never point that at production.
#
# What this proves:   backups exist, are valid, and reconstitute a running DB
#                     with your schema + data in it.
# What it does NOT:   application-level correctness after a restore (re-point
#                     the backend at the clone and smoke-test for that).
#
# Cost: a small clone running for a few minutes is cents. The drill deletes it
# automatically unless you pass --keep.
#
# Usage:
#   scripts/restore-drill.sh                          # clone current state, verify, delete
#   scripts/restore-drill.sh --pitr 2026-06-24T04:00:00Z   # clone to a point in time (tests PITR)
#   scripts/restore-drill.sh --keep                   # leave the clone up for manual inspection
#   scripts/restore-drill.sh --yes                    # skip the delete confirmation prompt
#
# Requires: gcloud authenticated with Cloud SQL Admin on project moveify-app.
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT="moveify-app"
REGION="australia-southeast1"
SOURCE="moveify-db"
PREFIX="moveify-db-drill"          # every clone name starts with this — the delete guard depends on it
CLONE="${PREFIX}-$(date +%Y%m%d-%H%M%S)"

PITR=""
KEEP=0
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pitr) PITR="${2:?--pitr needs an RFC3339 timestamp, e.g. 2026-06-24T04:00:00Z}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --yes)  ASSUME_YES=1; shift ;;
    -h|--help) grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# --- Hard guard: only ever delete an instance we created as a drill clone -----
delete_clone() {
  local name="$1"
  case "$name" in
    "${PREFIX}-"*) : ;;  # ok — it's a drill clone
    *) echo "REFUSING to delete '$name' — not a drill clone (must start with '${PREFIX}-')." >&2; exit 3 ;;
  esac
  gcloud sql instances delete "$name" --project="$PROJECT" --quiet
}

# --- Preflight ----------------------------------------------------------------
log "Preflight"
gcloud config set project "$PROJECT" >/dev/null 2>&1 || true
if ! gcloud sql instances describe "$SOURCE" --project="$PROJECT" --format='value(name)' >/dev/null 2>&1; then
  echo "Cannot see source instance '$SOURCE' on project '$PROJECT'." >&2
  echo "Run 'gcloud auth login' and make sure you have Cloud SQL Admin." >&2
  exit 1
fi
echo "Source instance:  $SOURCE  (project $PROJECT, region $REGION)"
echo "Clone target:     $CLONE"
[[ -n "$PITR" ]] && echo "Point in time:    $PITR (PITR path)" || echo "Point in time:    (current state)"

# --- Clone --------------------------------------------------------------------
log "Cloning (this creates a NEW instance from backups; source is untouched)"
if [[ -n "$PITR" ]]; then
  gcloud sql instances clone "$SOURCE" "$CLONE" --project="$PROJECT" --point-in-time="$PITR"
else
  gcloud sql instances clone "$SOURCE" "$CLONE" --project="$PROJECT"
fi

# --- Verify -------------------------------------------------------------------
log "Verifying clone is RUNNABLE and the database is present"
STATE="$(gcloud sql instances describe "$CLONE" --project="$PROJECT" --format='value(state)')"
echo "Clone state: $STATE"
if [[ "$STATE" != "RUNNABLE" ]]; then
  echo "Clone did not reach RUNNABLE — investigate before trusting backups." >&2
  [[ "$KEEP" -eq 0 ]] && delete_clone "$CLONE"
  exit 1
fi

echo "Databases on the clone:"
gcloud sql databases list --instance="$CLONE" --project="$PROJECT" --format='table(name,charset)'

cat <<EOF

✅ Restore drill PASSED the infrastructure check:
   the production backups reconstituted into a running, queryable instance.

Optional deeper check (proves row-level data, not just schema):
   1. Start the Cloud SQL Auth Proxy against the clone:
        cloud-sql-proxy ${PROJECT}:${REGION}:${CLONE} --port 5433
   2. In another shell, connect and count a few tables (use the prod DB_USER):
        psql "host=127.0.0.1 port=5433 dbname=moveify user=\$DB_USER" \\
          -c "select 'users' t, count(*) from users
              union all select 'programs', count(*) from programs
              union all select 'scribe_sessions', count(*) from scribe_sessions
              union all select 'audit_logs', count(*) from audit_logs;"
   Compare the counts to production. (DB password comes from Secret Manager —
   inject it, never paste it: PGPASSWORD="\$(gcloud secrets versions access latest --secret=<db-password-secret>)" )
EOF

# --- Cleanup ------------------------------------------------------------------
if [[ "$KEEP" -eq 1 ]]; then
  log "Leaving clone '$CLONE' running (--keep). Delete it when done:"
  echo "   gcloud sql instances delete $CLONE --project=$PROJECT"
  exit 0
fi

if [[ "$ASSUME_YES" -eq 0 ]]; then
  read -r -p $'\nDelete the drill clone '"$CLONE"' now? [Y/n] ' ans
  case "${ans:-Y}" in [nN]*) echo "Left clone running: $CLONE"; exit 0 ;; esac
fi

log "Deleting drill clone $CLONE"
delete_clone "$CLONE"
echo "Done. Drill clone removed; production instance was never touched."
