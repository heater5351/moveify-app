'use strict';

const express = require('express');
const router = express.Router();
const { constructWebhookEvent } = require('../services/stripe');
const { handleStripeEvent } = require('../jobs/stripe-handler');
const { withCorrelation } = require('../lib/logger');

// Raw body is applied in worker.js before express.json() for this route
router.post('/stripe', async (req, res) => {
    const log = withCorrelation(req);
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      log.warn('Stripe webhook missing signature header');
      return res.status(401).json({ error: 'Missing stripe-signature' });
    }

    let event;
    try {
      event = await constructWebhookEvent(req.body, sig);
    } catch (err) {
      log.error({ err: err.message }, 'Stripe webhook signature validation failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Acknowledge immediately — process async so Stripe doesn't time out
    res.status(200).json({ received: true });

    handleStripeEvent(event, log).catch((err) =>
      log.error({ event_id: event.id, err: err.message }, 'Stripe event handler failed')
    );
  }
);

// THO webhook placeholder for future use
router.post('/tho', express.json(), (req, res) => {
  res.status(200).json({ received: true });
});

module.exports = router;
