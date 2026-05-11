'use strict';
const { parseTyroCsv } = require('../jobs/ingest-tyro');

const csv = [
  'Transaction ID,Date,Invoice reference,Patient,Provider,Amount charged,Status',
  'T1,2026-05-01,INV-001,"Smith, John",Dr Jones,150.00,Approved',
  'T2,2026-05-01,INV-002,Jane Doe,Dr Jones,0,Rejected',
  'T3,2026-05-02,INV-003,"O""Brien, Mary",Dr Lee,80.50,Settled',
].join('\n');

const log = { warn: (...a) => console.error('warn:', ...a), info: () => {}, error: () => {} };
console.log(JSON.stringify(parseTyroCsv(csv, log), null, 2));
