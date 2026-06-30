-- Billing-worker schema. Idempotent — safe to run on every cold start.
-- Mirrors the 15 Sheets tabs previously kept in services/sheets.js (TAB_HEADERS).
-- All upserts in services/billing-db.js rely on the PRIMARY KEY constraints below.

CREATE TABLE IF NOT EXISTS contacts (
  cliniko_id              TEXT PRIMARY KEY,
  name                    TEXT,
  email                   TEXT,
  phone                   TEXT,
  dob                     TEXT,
  condition               TEXT,
  medicare                TEXT,
  medicare_reference      TEXT,
  dva_card_number         TEXT,
  phi_fund                TEXT,
  phi_membership_number   TEXT,
  updated_at              TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS contacts_email_lower_idx ON contacts (LOWER(email));
CREATE INDEX IF NOT EXISTS contacts_medicare_idx ON contacts (medicare);
CREATE INDEX IF NOT EXISTS contacts_medicare_ref_idx ON contacts (medicare_reference);
CREATE INDEX IF NOT EXISTS contacts_dva_idx ON contacts (dva_card_number);
CREATE INDEX IF NOT EXISTS contacts_phi_membership_lower_idx ON contacts (LOWER(phi_membership_number));

CREATE TABLE IF NOT EXISTS invoices (
  cliniko_id   TEXT PRIMARY KEY,
  patient_id   TEXT,
  status       TEXT,
  total        NUMERIC,
  type         TEXT,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS invoices_aged_idx ON invoices (type, status, created_at);

CREATE TABLE IF NOT EXISTS appointments (
  cliniko_id        TEXT PRIMARY KEY,
  patient_id        TEXT,
  practitioner_id   TEXT,
  status            TEXT,
  starts_at         TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS appointments_starts_at_idx ON appointments (starts_at);

CREATE TABLE IF NOT EXISTS payments (
  cliniko_id     TEXT PRIMARY KEY,
  invoice_id     TEXT,
  patient_id     TEXT,
  amount         NUMERIC,
  payment_type   TEXT,
  paid_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS payments_patient_id_idx ON payments (patient_id);

-- date/amount kept as TEXT to mirror the loose Sheets-era values (DMY strings,
-- "$61.81" prefixes, etc.). Reconciliation logic operates on string equality.
CREATE TABLE IF NOT EXISTS bank_transactions (
  hash          TEXT PRIMARY KEY,
  date          TEXT,
  amount        TEXT,
  description   TEXT,
  reconciled    BOOLEAN,
  gl_code       TEXT,
  ingested_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS bank_transactions_date_idx ON bank_transactions (date);

CREATE TABLE IF NOT EXISTS bank_rules (
  id        SERIAL PRIMARY KEY,
  pattern   TEXT NOT NULL,
  type      TEXT,
  gl_code   TEXT,
  notes     TEXT
);

CREATE TABLE IF NOT EXISTS reconciliation_flags (
  id              TEXT PRIMARY KEY,
  type            TEXT,
  entity_id       TEXT,
  cliniko_state   TEXT,
  ledger_state    TEXT,
  diff            TEXT,
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reconciliation_flags_open_idx
  ON reconciliation_flags (created_at DESC)
  WHERE resolved_at IS NULL;

-- amount kept as TEXT — Sheets stored "$61.81" style values.
CREATE TABLE IF NOT EXISTS actions_required (
  id              TEXT PRIMARY KEY,
  type            TEXT,
  cliniko_id      TEXT,
  patient_name    TEXT,
  amount          TEXT,
  description     TEXT,
  status          TEXT,
  created_at      TIMESTAMPTZ,
  done_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS actions_required_open_idx
  ON actions_required (created_at DESC)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT PRIMARY KEY,
  timestamp   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idempotency_keys_timestamp_idx ON idempotency_keys (timestamp);

CREATE TABLE IF NOT EXISTS worker_state (
  key     TEXT PRIMARY KEY,
  value   TEXT
);

CREATE TABLE IF NOT EXISTS referrals (
  gmail_message_id      TEXT PRIMARY KEY,
  cliniko_patient_id    TEXT,
  status                TEXT,
  processed_at          TIMESTAMPTZ,
  email_subject         TEXT,
  attachment_filename   TEXT
);
CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals (status);

CREATE TABLE IF NOT EXISTS tyro_ingest (
  transaction_id        TEXT PRIMARY KEY,
  date                  TEXT,
  patient               TEXT,
  amount_charged        TEXT,
  funder                TEXT,
  status                TEXT,
  xero_invoice_id       TEXT,
  xero_invoice_number   TEXT,
  ingested_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stripe_payments (
  stripe_event_id          TEXT PRIMARY KEY,
  stripe_invoice_id        TEXT,
  stripe_subscription_id   TEXT,
  cliniko_id               TEXT,
  xero_contact_id          TEXT,
  xero_overpayment_id      TEXT,
  amount                   NUMERIC,
  currency                 TEXT,
  tier                     TEXT,
  paid_at                  TIMESTAMPTZ,
  pp_invoice_id            TEXT,
  pp_amount                NUMERIC,
  created_at               TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS stripe_payments_cliniko_idx ON stripe_payments (cliniko_id);
CREATE INDEX IF NOT EXISTS stripe_payments_paid_at_idx ON stripe_payments (paid_at);

CREATE TABLE IF NOT EXISTS appointment_invoices (
  cliniko_appointment_id   TEXT PRIMARY KEY,
  cliniko_patient_id       TEXT,
  service_name             TEXT,
  appointment_date         TEXT,
  appointment_status       TEXT,
  casual_price             NUMERIC,
  xero_invoice_id          TEXT,
  xero_invoice_number      TEXT,
  overpayment_allocated    NUMERIC,
  gap_amount               NUMERIC,
  created_at               TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS appointment_invoices_patient_idx
  ON appointment_invoices (cliniko_patient_id);

CREATE TABLE IF NOT EXISTS stripe_cliniko_links (
  stripe_customer_id   TEXT PRIMARY KEY,
  cliniko_id           TEXT,
  match_method         TEXT,
  linked_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS stripe_cliniko_links_cliniko_idx ON stripe_cliniko_links (cliniko_id);

-- Expected-payment ledger for upfront (out-of-band) block agreements. Written
-- when the backend's upfront agreement is signed; the Tyro CSV ingest reconciles
-- a `PIF T1` / `PCL T2` reference + patient name against the pending row, so an
-- upfront payment becomes a deterministic match instead of an orphan. See
-- jobs/ingest-tyro.js + lib/upfront-prices.js.
CREATE TABLE IF NOT EXISTS expected_payments (
  id                     TEXT PRIMARY KEY,   -- exp:<agreement_id>
  agreement_id           TEXT,
  cliniko_id             TEXT,
  patient_name           TEXT,
  method                 TEXT,               -- 'tyro_upfront'
  path                   TEXT,
  tier                   TEXT,
  ref_code               TEXT,               -- 'PIF T1' / 'PCL T2'
  expected_amount_cents  INTEGER,
  status                 TEXT DEFAULT 'pending',  -- pending | matched | flagged
  matched_txn_id         TEXT,
  flag_reason            TEXT,
  created_at             TIMESTAMPTZ,
  matched_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS expected_payments_refcode_status_idx
  ON expected_payments (ref_code, status);
