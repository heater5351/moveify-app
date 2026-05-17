'use strict';

// One-shot grant script. Connects as postgres superuser via Cloud SQL Auth
// Proxy and locks billing_worker_user out of the moveify (patient) DB while
// giving it full rights on its own billing DB.
//
// Requires:
//   PG_SUPERUSER_PASSWORD env var
//   cloud-sql-proxy running on 127.0.0.1:5433
//
// Safe to re-run — REVOKE/GRANT/ALTER are idempotent.

const { Client } = require('pg');

async function run() {
  const pw = process.env.PG_SUPERUSER_PASSWORD;
  if (!pw) throw new Error('PG_SUPERUSER_PASSWORD env var required');

  const c = new Client({
    host: '127.0.0.1',
    port: 5433,
    user: 'postgres',
    password: pw,
    database: 'postgres',
  });
  await c.connect();

  const stmts = [
    `REVOKE ALL ON DATABASE moveify FROM PUBLIC`,
    `REVOKE ALL ON DATABASE moveify_staging FROM PUBLIC`,
    `REVOKE ALL ON DATABASE billing FROM PUBLIC`,
    `REVOKE CONNECT ON DATABASE moveify FROM billing_worker_user`,
    `REVOKE CONNECT ON DATABASE moveify_staging FROM billing_worker_user`,
    `GRANT ALL ON DATABASE billing TO billing_worker_user`,
    // Cloud SQL: postgres isn't a true superuser — must be granted membership
    // of the target role before ALTER OWNER. Granted then revoked.
    `GRANT billing_worker_user TO postgres`,
    `ALTER DATABASE billing OWNER TO billing_worker_user`,
    `REVOKE billing_worker_user FROM postgres`,
    // Cloud SQL auto-grants new users membership in cloudsqlsuperuser, which
    // has CONNECT on every DB in the instance. Strip it so billing_worker_user
    // is walled off from the patient DB.
    `REVOKE cloudsqlsuperuser FROM billing_worker_user`,
  ];
  for (const s of stmts) {
    process.stdout.write(`  ${s} … `);
    await c.query(s);
    process.stdout.write('ok\n');
  }
  await c.end();
  console.log('grants applied');
}

run().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
