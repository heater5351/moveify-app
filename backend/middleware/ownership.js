// Access control middleware

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
 * Middleware: allow any clinician OR the patient themselves
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

  // Any clinician can access any patient
  if (userRole === 'clinician') {
    return next();
  }

  return res.status(403).json({ error: 'Insufficient permissions' });
}

/**
 * Middleware: require admin flag on the authenticated clinician
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'clinician' || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  requireSelf,
  requirePatientAccess,
  requireAdmin
};
