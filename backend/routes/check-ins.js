// Daily check-in routes
const express = require('express');
const router = express.Router();
const checkInService = require('../services/check-in-service');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireSelf, requirePatientAccess } = require('../middleware/ownership');
const audit = require('../services/audit');

// All check-in routes require authentication
router.use(authenticate);

// Submit daily check-in (patient only — uses JWT identity)
router.post('/', requireRole('patient'), async (req, res) => {
  try {
    const patientId = req.user.id;
    const { checkInDate, overallFeeling, generalPainLevel, energyLevel, sleepQuality, notes } = req.body;

    // Validation
    if (!checkInDate || !overallFeeling) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (overallFeeling < 1 || overallFeeling > 5) {
      return res.status(400).json({ error: 'Overall feeling must be between 1 and 5' });
    }

    if (generalPainLevel !== undefined && (generalPainLevel < 0 || generalPainLevel > 10)) {
      return res.status(400).json({ error: 'Pain level must be between 0 and 10' });
    }

    if (energyLevel !== undefined && (energyLevel < 1 || energyLevel > 5)) {
      return res.status(400).json({ error: 'Energy level must be between 1 and 5' });
    }

    if (sleepQuality !== undefined && (sleepQuality < 1 || sleepQuality > 5)) {
      return res.status(400).json({ error: 'Sleep quality must be between 1 and 5' });
    }

    const result = await checkInService.submitCheckIn({
      patientId,
      checkInDate,
      overallFeeling,
      generalPainLevel: generalPainLevel || 0,
      energyLevel: energyLevel || 3,
      sleepQuality: sleepQuality || 3,
      notes
    });

    audit.log(req, 'checkin_submit', 'check_in', null, { date: checkInDate });

    res.json(result);
  } catch (error) {
    console.error('Error submitting check-in:', error);
    res.status(500).json({ error: 'Failed to submit check-in' });
  }
});

// Get today's check-in (patient accessing own data)
router.get('/today/:patientId', requireSelf('patientId'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const checkIn = await checkInService.getTodayCheckIn(parseInt(patientId));

    if (!checkIn) {
      return res.status(404).json({ error: 'No check-in for today' });
    }

    res.json(checkIn);
  } catch (error) {
    console.error('Error fetching today\'s check-in:', error);
    res.status(500).json({ error: 'Failed to fetch check-in' });
  }
});

// Get check-in history (patient accessing own data)
router.get('/history/:patientId', requireSelf('patientId'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days } = req.query;

    const history = await checkInService.getCheckInHistory(
      parseInt(patientId),
      days ? parseInt(days) : 30
    );

    res.json(history);
  } catch (error) {
    console.error('Error fetching check-in history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get check-ins for patient (clinician or patient self)
router.get('/patient/:patientId', requirePatientAccess, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days } = req.query;

    const checkIns = await checkInService.getCheckInHistory(
      parseInt(patientId),
      days ? parseInt(days) : 30
    );

    res.json({ checkIns });
  } catch (error) {
    console.error('Error fetching check-ins:', error);
    res.status(500).json({ error: 'Failed to fetch check-ins' });
  }
});

// Get average metrics for a date range (clinician or patient self)
router.get('/averages/:patientId', requirePatientAccess, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required' });
    }

    const averages = await checkInService.getAverageCheckInMetrics(
      parseInt(patientId),
      startDate,
      endDate
    );

    res.json(averages);
  } catch (error) {
    console.error('Error fetching check-in averages:', error);
    res.status(500).json({ error: 'Failed to fetch averages' });
  }
});

module.exports = router;
