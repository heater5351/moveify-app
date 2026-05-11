'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const { logger } = require('./lib/logger');
const { ensureSheets } = require('./services/sheets');

const webhooksRouter = require('./routes/webhooks');
const cronRouter = require('./routes/cron');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 8080;
const VERSION = require('./package.json').version;

app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS: only Cloud Scheduler and Stripe hit this service — no browser origin needed
app.use((req, res, next) => {
  // No CORS headers by design — internal service only
  next();
});

// Stripe webhook needs raw body for HMAC validation — must come BEFORE express.json()
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// Global JSON body parser for all other routes
app.use(express.json());

// Routes
app.use('/webhooks', webhooksRouter);
app.use('/cron', cronRouter);
app.use('/admin', adminRouter);

// Health check — no secret dependencies so it works before keys are wired
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: VERSION });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error({ err: err.message, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    // Ensure all 9 Sheet tabs exist before accepting traffic
    const spreadsheetId = process.env.SHEETS_LEDGER_ID;
    if (spreadsheetId) {
      logger.info('Ensuring Sheets tabs exist...');
      await ensureSheets(spreadsheetId);
      logger.info('Sheets ready');
    } else {
      logger.warn('SHEETS_LEDGER_ID not set — skipping sheet initialisation');
    }

    app.listen(PORT, () => {
      logger.info({ port: PORT, version: VERSION }, 'Billing worker started');
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Fatal startup error');
    process.exit(1);
  }
}

start();
