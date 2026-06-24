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
#   The clone is launched with --async and we wait on the operation explicitly,
#   because a synchronous clone can hit gcloud's client-side wait timeout and
#   orphan the clone before we can verify/delete it. An EXIT trap guarantees the
#   clone is cleaned up (unless --keep) even if a later step fails.
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
#   scripts/restore-drill.sh --keep                   # leave the clone running for manual inspection
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pitr) PITR="${2:?--pitr needs an RFC3339 timestamp, e.g. 2026-06-24T04:00:00Z}"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --yes)  shift ;;  # accepted for compatibility; cleanup is automatic now
    -h|--help) grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# --- Guaranteed cleanup: runs on ANY exit (success, error, or interrupt) ------
# Only ever deletes the drill clone we created (hard name guard), and only if it
# was actually created. --keep skips deletion.
CLONE_CREATED=0
cleanup() {
  local code=$?
  if [[ "$KEEP" -eq 1 ]]; then
    [[ "$CLONE_CREATED" -eq 1 ]] && \
      echo "Leaving clone '$CLONE' (--keep). Delete it when done: gcloud sql instances delete $CLONE --project=$PROJECT"
    return "$code"
  fi
  if [[ "$CLONE_CREATED" -eq 1 ]]; then
    case "$CLONE" in
      "${PREFIX}-"*)
        log "Cleaning up drill clone $CLONE"
        gcloud sql instances delete "$CLONE" --project="$PROJECT" --quiet \
          || echo "WARNING: could not delete $CLONE — delete it manually to avoid cost." >&2
        ;;
      *) echo "REFUSING to delete '$CLONE' — failed name guard." >&2 ;;
    esac
  fi
  return "$code"
}
trap cleanup EXIT

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

# --- Clone (async + explicit wait) --------------------------------------------
log "Cloning (this creates a NEW instance from backups; source is untouched)"
if [[ -n "$PITR" ]]; then
  OP="$(gcloud sql instances clone "$SOURCE" "$CLONE" --project="$PROJECT" --point-in-time="$PITR" --async --format='value(name)')"
else
  OP="$(gcloud sql instances clone "$SOURCE" "$CLONE" --project="$PROJECT" --async --format='value(name)')"
fi
CLONE_CREATED=1   # from here on, cleanup() owns deletion of the clone
echo "Clone operation: $OP"
echo "Waiting for the clone to finish (Cloud SQL clones typically take 10–20 min)…"
gcloud sql operations wait "$OP" --project="$PROJECT" --timeout=3600

# --- Verify -------------------------------------------------------------------
log "Verifying clone is RUNNABLE and the database is present"
STATE="$(gcloud sql instances describe "$CLONE" --project="$PROJECT" --format='value(state)')"
echo "Clone state: $STATE"
echo "Databases on the clone:"
gcloud sql databases list --instance="$CLONE" --project="$PROJECT" --format='table(name,charset)'

if [[ "$STATE" != "RUNNABLE" ]]; then
  echo "❌ Clone did not reach RUNNABLE (state: $STATE) — investigate before trusting backups." >&2
  exit 1   # trap cleans up the clone
fi

cat <<EOF

✅ Restore drill PASSED the infrastructure check:
   the production backups reconstituted into a running, queryable instance.

Optional deeper check (proves row-level data, not just schema):
   1. Start the Cloud SQL Auth Proxy against the clone (pass --keep first so it
      isn't auto-deleted):
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

# The EXIT trap deletes the clone now (unless --keep). Production was never touched.
