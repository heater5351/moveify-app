'use strict';

const pino = require('pino');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level(label) {
      // Cloud Logging severity field
      return { severity: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'moveify-billing-worker' },
});

/**
 * Returns a child logger bound to the current request's correlation ID.
 * Uses X-Cloud-Trace-Context header set by Cloud Run, falls back to a UUID.
 */
function withCorrelation(req) {
  const traceHeader = req.headers['x-cloud-trace-context'] || '';
  const correlation_id = traceHeader.split('/')[0] || crypto.randomUUID();
  return logger.child({ correlation_id });
}

module.exports = { logger, withCorrelation };
