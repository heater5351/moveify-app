const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const cliniko = require('../services/cliniko');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate);
router.use(requireRole('clinician'));

// GET /api/cliniko/patients?q=john
router.get('/patients', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  try {
    const patients = await cliniko.searchPatients(q.trim());
    audit.log(req, 'cliniko_read', 'cliniko_patient_search', null, { query: q.trim(), resultCount: patients.length });
    res.json({ patients });
  } catch (err) {
    console.error('Cliniko patient search error:', err);
    const status = err.status === 401 ? 503 : 502;
    res.status(status).json({ error: 'Could not reach Cliniko. Please try again.' });
  }
});

module.exports = router;
