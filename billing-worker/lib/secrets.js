'use strict';

require('dotenv').config();

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { logger } = require('./logger');

const client = new SecretManagerServiceClient();
const cache = new Map();

// Maps logical secret names → GCP Secret Manager names (which may differ from logical names)
const SECRET_GCP_NAME_MAP = {
  // Admin = referrals pipeline (writes patients/contacts/attachments) AND the
  // default for all calls. Finance = appointment poller, sync, reconcile (read-only).
  // The two map to distinct Cliniko user-scoped API keys; the FINANCE key is
  // tied to a Cliniko user with read-only permissions, so writes will 403.
  // (Consolidated 2026-06-01: the standalone CLINIKO_API_KEY secret was retired;
  // the full-access key now lives only in CLINIKO_API_KEY_ADMIN.)
  'cliniko-api-key': 'CLINIKO_API_KEY_ADMIN',
  'cliniko-api-key-admin': 'CLINIKO_API_KEY_ADMIN',
  'cliniko-api-key-finance': 'CLINIKO_API_KEY_FINANCE',
  'cliniko-api-key-staging': 'CLINIKO_API_KEY_ADMIN',
  // Stripe is in LIVE mode and writes to the production Xero tenant
  // "Moveify Health Solutions" (XERO_TENANT_ID secret). The live webhook
  // (Stripe `we_*` endpoint pointing at /webhooks/stripe) must use the
  // live signing secret `billing-stripe-webhook-secret` for HMAC
  // verification to succeed.
  'stripe-secret-key': 'STRIPE_API_KEY',
  'stripe-webhook-secret': 'billing-stripe-webhook-secret',
  // Stripe TEST-mode secrets — used only by a worker with STRIPE_MODE=test (the
  // staging worker). The live worker leaves STRIPE_MODE unset and never reads these.
  'stripe-secret-key-test': 'STRIPE_API_KEY_TEST',
  'stripe-webhook-secret-test': 'billing-stripe-webhook-secret-test',
  'gmail-client-id': 'billing-gmail-client-id',
  'gmail-client-secret': 'billing-gmail-client-secret',
  'gmail-refresh-token': 'billing-gmail-refresh-token',
  'aws-access-key-id': 'moveify-aws-access-key-id',
  'aws-secret-access-key': 'moveify-aws-secret-access-key',
  'xero-client-id': 'XERO_CLIENT_ID',
  'xero-client-secret': 'XERO_CLIENT_SECRET',
  'xero-refresh-token': 'XERO_REFRESH_TOKEN',
  'xero-tenant-id': 'XERO_TENANT_ID',
  'billing-admin-token': 'billing_admin_token',
};

// Maps logical secret names → local .env var names
const SECRET_NAME_MAP = {
  'cliniko-api-key': 'CLINIKO_API_KEY',
  'cliniko-api-key-admin': 'CLINIKO_API_KEY',
  'cliniko-api-key-finance': 'CLINIKO_API_KEY',
  'cliniko-api-key-staging': 'CLINIKO_API_KEY_STAGING',
  'stripe-secret-key': 'STRIPE_SECRET_KEY',
  'stripe-webhook-secret': 'STRIPE_WEBHOOK_SECRET',
  'stripe-secret-key-test': 'STRIPE_SECRET_KEY_TEST',
  'stripe-webhook-secret-test': 'STRIPE_WEBHOOK_SECRET_TEST',
  'gmail-client-id': 'GMAIL_CLIENT_ID',
  'gmail-client-secret': 'GMAIL_CLIENT_SECRET',
  'gmail-refresh-token': 'GMAIL_REFRESH_TOKEN',
  'aws-access-key-id': 'AWS_ACCESS_KEY_ID',
  'aws-secret-access-key': 'AWS_SECRET_ACCESS_KEY',
  'xero-client-id': 'XERO_CLIENT_ID',
  'xero-client-secret': 'XERO_CLIENT_SECRET',
  'xero-refresh-token': 'XERO_REFRESH_TOKEN',
  'xero-tenant-id': 'XERO_TENANT_ID',
  'billing-admin-token': 'BILLING_ADMIN_TOKEN',
};

/**
 * Fetches a secret by name. Cached after first load.
 * In local dev (NODE_ENV !== 'production'), falls back to process.env.
 */
async function getSecret(name) {
  if (cache.has(name)) return cache.get(name);

  if (process.env.NODE_ENV !== 'production') {
    const envKey = SECRET_NAME_MAP[name];
    const value = envKey ? process.env[envKey] : undefined;
    if (value) {
      cache.set(name, value);
      return value;
    }
  }

  const project = process.env.GCP_PROJECT_ID || 'moveify-app';
  const gcpName = SECRET_GCP_NAME_MAP[name] || name;
  const secretPath = `projects/${project}/secrets/${gcpName}/versions/latest`;

  try {
    const [version] = await client.accessSecretVersion({ name: secretPath });
    const value = version.payload.data.toString('utf8');
    cache.set(name, value);
    return value;
  } catch (err) {
    logger.error({ secret: name, err: err.message }, 'Failed to load secret');
    throw err;
  }
}

/**
 * Adds a new version to an existing Secret Manager secret. Invalidates the cache entry.
 * Requires roles/secretmanager.secretVersionAdder on the secret for the runtime SA.
 */
async function setSecret(name, value) {
  const project = process.env.GCP_PROJECT_ID || 'moveify-app';
  const gcpName = SECRET_GCP_NAME_MAP[name] || name;
  const parent = `projects/${project}/secrets/${gcpName}`;

  await client.addSecretVersion({
    parent,
    payload: { data: Buffer.from(value, 'utf8') },
  });
  cache.delete(name);
}

module.exports = { getSecret, setSecret };
