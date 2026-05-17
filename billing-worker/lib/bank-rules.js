'use strict';

// Default bank-statement → GL code mapping. Shared by /admin/seed-bank-rules
// (manual reseed) and /admin/replay-from-scratch (post-wipe replay).
// Edit here; both consumers pick it up automatically.

const DEFAULT_BANK_RULES = [
  ['STRIPE', 'stripe_payout', '4000', 'Stripe settlements'],
  ['TYRO SETTLEMENT', 'tyro_revenue', '4001', 'Tyro terminal income'],
  ['HEALTHPOINT', 'health_fund', '4002', 'Health fund claims'],
  ['MCARE', 'medicare', '4003', 'Medicare / DVA payments'],
  ['SQUARE', 'eftpos_revenue', '4004', 'Square terminal income'],
  ['SPLOSE', 'software', '6100', 'Splose practice management'],
  ['GOOGLE WORKSPACE', 'software', '6100', 'Google Workspace'],
  ['MICROSOFT', 'software', '6100', 'Microsoft subscription'],
  ['CLAUDE.AI', 'software', '6100', 'Anthropic Claude subscription'],
  ['ELEVENLABS', 'software', '6100', 'ElevenLabs subscription'],
  ['GUILD INSURANCE', 'insurance', '6200', 'Professional indemnity insurance'],
  ['CLINIKO', 'software', '6100', 'Cliniko practice management'],
  ['DIDIMOBILITY', 'equipment', '6300', 'Equipment / mobility aids'],
  ['JB HI.?FI', 'equipment', '6300', 'JB Hi-Fi equipment purchases'],
  ['TRANSFER FROM CBA', 'client_payment', '4005', 'Client direct bank transfer via CBA'],
];

module.exports = { DEFAULT_BANK_RULES };
