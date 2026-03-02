// Audit logging service — fire-and-forget, never fails the request
const db = require('../database/db');

/**
 * Log an audit event
 * @param {object} req - Express request (for user info and IP)
 * @param {string} action - What happened (e.g., 'login_success', 'patient_delete')
 * @param {string} resourceType - Entity type (e.g., 'patient', 'program', 'exercise')
 * @param {number|null} resourceId - ID of the affected resource
 * @param {object|null} details - Additional context (JSONB)
 */
function log(req, action, resourceType, resourceId = null, details = null) {
  const userId = req.user ? req.user.id : null;
  const ipAddress = req.ip || req.connection?.remoteAddress || null;

  db.query(
    `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress]
  ).catch(error => {
    // Never fail the request — log and move on
    console.error('Audit log write failed:', error.message);
  });
}

module.exports = { log };
