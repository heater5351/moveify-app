// Scheduled purge of expired scribe transcripts (PHI retention control).
//
// Transcripts are only meant to live 48 hours after the recording started
// (the retention promise in the scribe consent copy). The HTTP read path
// enforces this lazily — it deletes on access after 48h — but transcripts
// nobody requests would otherwise sit in the DB indefinitely. This job is
// the authoritative cleanup: it runs on a Cloud Scheduler cron (see
// routes/internal-cron.js) and deletes every transcript whose session
// started more than 48 hours ago.
const db = require('../database/db');

const RETENTION_HOURS = 48;

async function purgeExpiredTranscripts() {
  const result = await db.query(
    `DELETE FROM transcripts t
     USING scribe_sessions s
     WHERE t.session_id = s.id
       AND s.started_at < NOW() - INTERVAL '${RETENTION_HOURS} hours'`
  );
  return { deleted: result.rowCount };
}

module.exports = { purgeExpiredTranscripts, RETENTION_HOURS };
