// Scheduled auto-sync: refresh Cliniko-linked patients' demographics in Moveify.
//
// Direction is Cliniko → Moveify only (Cliniko is the source of truth). Read-only
// against Cliniko. Runs on Cloud Scheduler via routes/internal-cron.js, and can be
// triggered on demand by an admin via POST /api/cliniko/sync-all.
//
// Strategy:
//   - First run (no cursor): iterate only the linked patients via getPatient(id).
//     Bounded by the linked-patient count, so we never pull the whole clinic.
//   - Steady state: incrementally list patients changed since the stored cursor
//     (updated_at[gt]) and apply only those that map to a linked Moveify user.
// Per-patient failures are caught and counted (no PHI logged) so one bad record
// doesn't abort the run. The cursor only advances on a fully completed run.
const db = require('../database/db');
const cliniko = require('../services/cliniko');
const clinikoSync = require('../services/cliniko-sync');
const audit = require('../services/audit');

const CURSOR_KEY = 'cliniko_patient_last_sync';

async function syncClinikoPatients() {
  const since = await clinikoSync.getState(CURSOR_KEY);
  const runAt = new Date().toISOString();

  const linked = await db.getAll(
    `SELECT id, cliniko_patient_id FROM users
       WHERE cliniko_patient_id IS NOT NULL AND role = 'patient'`
  );
  const byClinikoId = new Map(linked.map((u) => [String(u.cliniko_patient_id), u.id]));

  let candidates = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const applyOne = async (userId, cp) => {
    try {
      await clinikoSync.applySync(userId, cp);
      updated++;
    } catch (err) {
      failed++;
      // No PHI — log the Moveify user id + error message only.
      console.error(`cliniko auto-sync: failed to update user ${userId}:`, err.message);
    }
  };

  if (!since) {
    // First run — fetch each linked patient individually (bounded set).
    candidates = linked.length;
    for (const u of linked) {
      try {
        const cp = await cliniko.getPatient(u.cliniko_patient_id);
        await applyOne(u.id, cp);
      } catch (err) {
        failed++;
        console.error(`cliniko auto-sync: failed to fetch cliniko patient for user ${u.id}:`, err.message);
      }
    }
  } else {
    // Steady state — incremental list, filtered to linked patients only.
    const cps = await cliniko.getPatientsUpdatedSince(since);
    candidates = cps.length;
    for (const cp of cps) {
      const userId = byClinikoId.get(String(cp.id));
      if (!userId) {
        skipped++;
        continue;
      }
      await applyOne(userId, cp);
    }
  }

  // Advance the cursor only after the run completes.
  await clinikoSync.setState(CURSOR_KEY, runAt);

  const stats = { candidates, updated, skipped, failed, fullBackfill: !since };
  // Synthetic req — audit.js reads req.user (null = system) and req.ip.
  audit.log({ user: null, ip: 'system:cron' }, 'cliniko_auto_sync', 'patient', null, stats);
  return stats;
}

module.exports = { syncClinikoPatients };
