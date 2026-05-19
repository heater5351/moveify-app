// One-time script — imports existing PostgreSQL users into Identity Platform
// with their bcrypt password hashes intact (so users keep their existing
// passwords). Backfills users.firebase_uid afterwards.
//
// Usage:
//   node scripts/import-identity-platform-users.js --dry-run    # preview only
//   node scripts/import-identity-platform-users.js              # commit
//
// Requires the same env vars the backend uses (DATABASE_URL or Cloud SQL
// settings + FIREBASE_SERVICE_ACCOUNT_JSON).
//
// UID strategy: use the existing numeric user id (as a string) as the IP UID.
// This makes the firebase_uid backfill trivial and means subsequent reruns
// are idempotent — importUsers upserts by uid.

require('dotenv').config();
const db = require('../database/db');
const identityPlatform = require('../lib/identity-platform');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 1000; // importUsers max

async function main() {
  if (!identityPlatform.init()) {
    console.error('FATAL: Identity Platform Admin SDK failed to initialize. Set FIREBASE_SERVICE_ACCOUNT_JSON.');
    process.exit(1);
  }
  const auth = identityPlatform.auth();

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'COMMIT'}`);

  const { rows } = await db.query(
    `SELECT id, email, name, password_hash, firebase_uid
       FROM users
      WHERE password_hash IS NOT NULL
      ORDER BY id`
  );

  console.log(`Found ${rows.length} users with password hashes`);

  const importable = rows.filter(r => {
    // bcrypt hashes start with $2a$, $2b$, or $2y$
    return typeof r.password_hash === 'string' && /^\$2[aby]\$/.test(r.password_hash);
  });
  const skipped = rows.length - importable.length;
  if (skipped > 0) {
    console.warn(`Skipping ${skipped} users with non-bcrypt password hashes`);
  }

  if (DRY_RUN) {
    console.log('Sample of first 3 records to be imported:');
    importable.slice(0, 3).forEach(r => {
      console.log(`  uid=${r.id} email=${r.email} alreadyLinked=${!!r.firebase_uid}`);
    });
    console.log(`Would import ${importable.length} users in ${Math.ceil(importable.length / BATCH_SIZE)} batch(es)`);
    process.exit(0);
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < importable.length; i += BATCH_SIZE) {
    const batch = importable.slice(i, i + BATCH_SIZE);
    const records = batch.map(r => ({
      uid: String(r.id),
      email: r.email,
      emailVerified: true,
      displayName: r.name || undefined,
      disabled: false,
      passwordHash: Buffer.from(r.password_hash, 'utf8'),
    }));

    const result = await auth.importUsers(records, { hash: { algorithm: 'BCRYPT' } });
    successCount += result.successCount;
    errorCount += result.failureCount;

    if (result.errors && result.errors.length > 0) {
      console.error(`Batch ${i / BATCH_SIZE + 1}: ${result.errors.length} failures`);
      result.errors.slice(0, 10).forEach(e => {
        const failedRow = batch[e.index];
        console.error(`  uid=${failedRow.id} email=${failedRow.email}: ${e.error.message}`);
      });
    } else {
      console.log(`Batch ${i / BATCH_SIZE + 1}: ${result.successCount} imported`);
    }
  }

  console.log(`Import complete: ${successCount} succeeded, ${errorCount} failed`);

  // Backfill firebase_uid for newly-imported users (any that didn't already have it).
  console.log('Backfilling users.firebase_uid…');
  const backfill = await db.query(
    `UPDATE users
        SET firebase_uid = id::text
      WHERE password_hash IS NOT NULL
        AND firebase_uid IS NULL`
  );
  console.log(`Backfilled firebase_uid for ${backfill.rowCount} users`);

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
