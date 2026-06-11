/**
 * Program revision snapshots (Phase 2 of the scribe context upgrades).
 *
 * Every program create/update records a before/after JSONB snapshot inside the
 * same transaction, optionally linked to the scribe session it happened around.
 * Note generation later sweeps revisions in the session's time window and
 * injects a human-readable diff (see program-diff.js) into the SOAP prompt.
 */

// Normalized snapshot of a program + its exercises, using an existing
// transaction client so the snapshot is consistent with the surrounding writes.
async function captureProgramSnapshot(client, programId) {
  const programRes = await client.query(
    'SELECT name, start_date, frequency, duration, custom_end_date FROM programs WHERE id = $1',
    [programId]
  );
  if (programRes.rows.length === 0) return null;
  const p = programRes.rows[0];

  const exercisesRes = await client.query(
    `SELECT id, exercise_name, sets, reps, prescribed_weight, prescribed_duration,
            rest_duration, hold_time, is_warmup, exercise_order
     FROM program_exercises WHERE program_id = $1 ORDER BY exercise_order ASC`,
    [programId]
  );

  return {
    name: p.name,
    startDate: p.start_date,
    frequency: p.frequency,
    duration: p.duration,
    customEndDate: p.custom_end_date,
    exercises: exercisesRes.rows.map(ex => ({
      id: ex.id,
      name: ex.exercise_name,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.prescribed_weight,
      duration: ex.prescribed_duration,
      rest: ex.rest_duration,
      holdTime: ex.hold_time,
      isWarmup: ex.is_warmup === true,
      order: ex.exercise_order,
    })),
  };
}

// Find an open or just-finished scribe session for this patient + clinician so
// the revision can be stamped at write time. Bounded to the last 12h so a
// long-abandoned open session doesn't claim unrelated edits.
async function findActiveScribeSession(client, patientId, clinicianId) {
  const res = await client.query(
    `SELECT id FROM scribe_sessions
     WHERE patient_id = $1 AND clinician_id = $2
       AND status <> 'discarded'
       AND started_at > NOW() - INTERVAL '12 hours'
       AND (ended_at IS NULL OR ended_at > NOW() - INTERVAL '60 minutes')
     ORDER BY started_at DESC LIMIT 1`,
    [patientId, clinicianId]
  );
  return res.rows.length > 0 ? res.rows[0].id : null;
}

/**
 * Insert a revision row (inside the caller's transaction). Skips no-op edits
 * (identical before/after). `before` is null for program creation.
 * Never throws on the session lookup — a revision without a session link is
 * still useful.
 */
async function recordRevision(client, { programId, patientId, changedBy, before, after }) {
  if (!after) return null;
  if (before && JSON.stringify(before) === JSON.stringify(after)) return null;

  let sessionId = null;
  try {
    sessionId = await findActiveScribeSession(client, patientId, changedBy);
  } catch {
    // best-effort link only
  }

  const res = await client.query(
    `INSERT INTO program_revisions (program_id, patient_id, changed_by, scribe_session_id, snapshot_before, snapshot_after)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [programId, patientId, changedBy, sessionId, before ? JSON.stringify(before) : null, JSON.stringify(after)]
  );
  return res.rows[0].id;
}

module.exports = { captureProgramSnapshot, recordRevision, findActiveScribeSession };
