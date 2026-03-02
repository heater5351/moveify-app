// Ownership verification middleware for clinician-patient relationships
const db = require('../database/db');

/**
 * Middleware: verify clinician owns the patient (via clinician_patients junction table)
 * Reads patientId from req.params.patientId
 */
function requirePatientOwnership(req, res, next) {
  const clinicianId = req.user.id;
  const patientId = parseInt(req.params.patientId);

  if (!patientId || isNaN(patientId)) {
    return res.status(400).json({ error: 'Valid patient ID is required' });
  }

  db.getOne(
    'SELECT 1 FROM clinician_patients WHERE clinician_id = $1 AND patient_id = $2',
    [clinicianId, patientId]
  ).then(row => {
    if (!row) {
      return res.status(403).json({ error: 'You do not have access to this patient' });
    }
    next();
  }).catch(error => {
    console.error('Ownership check error:', error);
    res.status(500).json({ error: 'Server error' });
  });
}

/**
 * Middleware: verify clinician owns the program (via programs.clinician_id)
 * Reads programId from req.params.programId
 */
function requireProgramOwnership(req, res, next) {
  const clinicianId = req.user.id;
  const programId = parseInt(req.params.programId);

  if (!programId || isNaN(programId)) {
    return res.status(400).json({ error: 'Valid program ID is required' });
  }

  db.getOne(
    'SELECT 1 FROM programs WHERE id = $1 AND clinician_id = $2',
    [programId, clinicianId]
  ).then(row => {
    if (!row) {
      return res.status(403).json({ error: 'You do not have access to this program' });
    }
    next();
  }).catch(error => {
    console.error('Program ownership check error:', error);
    res.status(500).json({ error: 'Server error' });
  });
}

/**
 * Middleware: verify the authenticated user IS the resource owner (patient accessing own data)
 * @param {string} paramName - the req.params key holding the user ID to check
 */
function requireSelf(paramName) {
  return (req, res, next) => {
    const resourceUserId = parseInt(req.params[paramName]);
    if (req.user.id !== resourceUserId) {
      return res.status(403).json({ error: 'You can only access your own data' });
    }
    next();
  };
}

/**
 * Middleware: allow clinician with patient ownership OR the patient themselves
 * Reads patientId from req.params.patientId
 */
function requirePatientAccess(req, res, next) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const patientId = parseInt(req.params.patientId);

  if (!patientId || isNaN(patientId)) {
    return res.status(400).json({ error: 'Valid patient ID is required' });
  }

  // Patient accessing own data
  if (userRole === 'patient') {
    if (userId !== patientId) {
      return res.status(403).json({ error: 'You can only access your own data' });
    }
    return next();
  }

  // Clinician accessing their patient's data
  if (userRole === 'clinician') {
    db.getOne(
      'SELECT 1 FROM clinician_patients WHERE clinician_id = $1 AND patient_id = $2',
      [userId, patientId]
    ).then(row => {
      if (!row) {
        return res.status(403).json({ error: 'You do not have access to this patient' });
      }
      next();
    }).catch(error => {
      console.error('Patient access check error:', error);
      res.status(500).json({ error: 'Server error' });
    });
    return;
  }

  return res.status(403).json({ error: 'Insufficient permissions' });
}

module.exports = {
  requirePatientOwnership,
  requireProgramOwnership,
  requireSelf,
  requirePatientAccess
};
