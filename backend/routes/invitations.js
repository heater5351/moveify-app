// Invitation routes
const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { sendInvitationEmail } = require('../services/email');
const { authenticate, requireRole } = require('../middleware/auth');
const identityPlatform = require('../lib/identity-platform');
const audit = require('../services/audit');
const cliniko = require('../services/cliniko');
const { toLoginEmail, slugifyName } = require('../lib/login-identity');

const router = express.Router();

// Generate a unique login name from a patient's name ("John Smith" →
// "john-smith", "john-smith-2", …). Uses the transaction client so the
// uniqueness check and the subsequent INSERT see a consistent view. The
// partial unique index on LOWER(login_username) is the real guard; this loop
// just picks a free-looking slug (a rare concurrent collision surfaces as a
// unique-violation that rolls back the txn, and the clinician retries).
async function generateLoginUsername(client, name) {
  const base = slugifyName(name);
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const taken = await client.query(
      `SELECT 1 FROM users WHERE LOWER(login_username) = $1 LIMIT 1`,
      [candidate]
    );
    if (taken.rows.length === 0) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

// Generate invitation for new patient (called by clinician)
router.post('/generate', authenticate, requireRole('clinician'), async (req, res) => {
  try {
    let { email, name, dob, phone, address, clinikoPatientId, allowSharedEmail } = req.body;

    // If a Cliniko patient ID was provided, pull authoritative data from Cliniko
    if (clinikoPatientId) {
      try {
        const cp = await cliniko.getPatient(clinikoPatientId);
        name = `${cp.first_name} ${cp.last_name}`.trim();
        email = cp.email || email;
        dob = cp.date_of_birth || '';
        phone = cp.patient_phone_numbers?.[0]?.number || '';
        const addressParts = [cp.address_1, cp.address_2, cp.address_3, cp.city, cp.state, cp.post_code]
          .map(p => (p || '').trim()).filter(Boolean);
        address = addressParts.length > 0 ? addressParts.join(', ') : address;
        // condition is left as-is — Cliniko doesn't have this field
      } catch (clinikoErr) {
        console.error('Cliniko fetch during invite:', clinikoErr);
        return res.status(502).json({ error: 'Could not fetch patient details from Cliniko. Please try again.' });
      }
    }

    // Validate required fields
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const clinicianId = req.user.id;

    // Look at every account already holding this contact email. Email is no
    // longer a login key, so duplicates are allowed — but we distinguish the
    // SAME person being re-invited (→ reuse their row) from a DIFFERENT person
    // sharing the email (→ shared household). Same-person = same Cliniko
    // patient when we have one, else same name. This is independent of whether
    // the existing patient has finished setup — spouses are commonly invited
    // back-to-back while both are still pending.
    const existingRows = (await db.query(
      `SELECT id, name, cliniko_patient_id, login_username
         FROM users WHERE email = $1`,
      [email]
    )).rows;
    const norm = (s) => (s || '').trim().toLowerCase();
    const isSamePerson = (u) =>
      (clinikoPatientId && u.cliniko_patient_id)
        ? String(u.cliniko_patient_id) === String(clinikoPatientId)
        : norm(u.name) === norm(name);

    // The row representing THIS person (re-invite), if any
    const samePersonRow = existingRows.find(isSamePerson);
    // A different person already holding this email → shared household
    const otherRow = existingRows.find((u) => !isSamePerson(u));

    if (otherRow && !allowSharedEmail) {
      // Caught at the clinician's invite step — let them confirm it's a shared
      // household email (e.g. a spouse) before we create a second account.
      return res.status(409).json({
        emailShared: true,
        existingName: otherRow.name,
        error: `This email already belongs to ${otherRow.name}.`,
      });
    }

    // A second person on a shared email logs in with a generated login name
    // (the first keeps their email). Brand-new emails never get one.
    const needsLoginName = !!otherRow;

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');

    // Set expiration (14 days from now)
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Use transaction to ensure token + user are created atomically
    const client = await db.getClient();
    let patientId;
    let loginUsername = samePersonRow ? samePersonRow.login_username || null : null;
    try {
      await client.query('BEGIN');

      if (samePersonRow) {
        // Resend to the same person — reuse their row
        patientId = samePersonRow.id;
        if (clinikoPatientId) {
          await client.query(
            `UPDATE users SET cliniko_patient_id = $1, cliniko_synced_at = NOW() WHERE id = $2`,
            [clinikoPatientId, patientId]
          );
        }
      } else {
        // New account. A second person on a shared email gets a login name.
        if (needsLoginName) {
          loginUsername = await generateLoginUsername(client, name);
        }
        const userResult = await client.query(`
          INSERT INTO users (email, password_hash, role, name, dob, phone, address,
                             cliniko_patient_id, cliniko_synced_at, login_username)
          VALUES ($1, NULL, 'patient', $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [email, name, dob, phone, address,
            clinikoPatientId || null,
            clinikoPatientId ? new Date().toISOString() : null,
            loginUsername]);
        patientId = userResult.rows[0].id;
      }

      // Invalidate this person's previous unused invitations (by user_id;
      // legacy tokens predate user_id, so also clear null-user tokens matching
      // this email — safe because a shared email's other party is already
      // active and therefore has no pending token).
      await client.query(
        `UPDATE invitation_tokens SET used = 1
           WHERE used = 0 AND (user_id = $1 OR (user_id IS NULL AND email = $2))`,
        [patientId, email]
      );

      // Save invitation (always patient role), linked to the resolved user
      await client.query(`
        INSERT INTO invitation_tokens (token, email, role, name, dob, phone, address, expires_at, clinician_id, user_id)
        VALUES ($1, $2, 'patient', $3, $4, $5, $6, $7, $8, $9)
      `, [token, email, name, dob, phone, address, expiresAt, clinicianId, patientId]);

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Generate invitation URL - use env var in production
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationUrl = `${baseUrl}/setup-password?token=${token}`;

    // Send invitation email (names the login name when this is a shared-email
    // second account, otherwise shows the login email as before)
    try {
      await sendInvitationEmail(email, name, invitationUrl, loginUsername);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      return res.status(500).json({ error: 'Invitation created but failed to send email. Please check email configuration.' });
    }

    audit.log(req, 'patient_invite', 'patient', patientId, { email, loginUsername });

    res.json({
      message: 'Invitation created successfully',
      token,
      invitationUrl,
      expiresAt,
      userId: patientId,
      loginUsername
    });
  } catch (error) {
    console.error('Generate invitation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Validate invitation token (public — used by setup-password page)
router.get('/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const invitation = await db.getOne(`
      SELECT it.email, it.name, it.role, u.login_username
        FROM invitation_tokens it
        LEFT JOIN users u ON u.id = it.user_id
       WHERE it.token = $1 AND it.used = 0 AND it.expires_at > NOW()
    `, [token]);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    res.json({
      valid: true,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      loginUsername: invitation.login_username || null
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Set password using invitation token (public — used by setup-password page)
router.post('/set-password', async (req, res) => {
  try {
    const { token, password, healthDataConsent } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Atomically claim the invitation token (prevents race condition with concurrent requests)
    const invitation = await db.getOne(`
      UPDATE invitation_tokens
      SET used = 1
      WHERE token = $1 AND used = 0 AND expires_at > NOW()
      RETURNING *
    `, [token]);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Only require health data consent for patients
    if (invitation.role === 'patient' && healthDataConsent !== true) {
      // Undo the claim so the patient can retry with consent
      await db.query('UPDATE invitation_tokens SET used = 0 WHERE token = $1', [token]);
      return res.status(400).json({ error: 'You must consent to health data collection to create an account' });
    }

    // Look up the user row. Prefer the token's user_id (unambiguous even when
    // the contact email is shared). Fall back to email+role for legacy tokens
    // minted before user_id existed — but only when it resolves to exactly one
    // row, so a legacy invite whose email later became shared can never set a
    // password on the wrong account (it fails closed → request a fresh invite).
    let user;
    if (invitation.user_id) {
      user = await db.getOne('SELECT id, name, login_username FROM users WHERE id = $1', [invitation.user_id]);
    } else {
      const rows = (await db.query(
        'SELECT id, name, login_username FROM users WHERE email = $1 AND role = $2',
        [invitation.email, invitation.role]
      )).rows;
      user = rows.length === 1 ? rows[0] : null;
    }
    if (!user) {
      // Token was valid but the user row is missing or ambiguous. Should not
      // happen for tokens minted with a user_id.
      return res.status(500).json({ error: 'User account not found' });
    }
    const uid = String(user.id);

    // A shared-email patient authenticates against a synthetic login email
    // ("<login-name>@login.moveifyapp.com"); everyone else uses their real one.
    const ipEmail = user.login_username ? toLoginEmail(user.login_username) : invitation.email;

    // Create or update the Identity Platform user with the chosen password.
    // Idempotent: a resend that already created the IP user falls through
    // to updateUser. (createUser is the common path; updateUser handles
    // resends/replays.)
    const auth = identityPlatform.auth();
    if (!auth) {
      return res.status(500).json({ error: 'Authentication service unavailable' });
    }
    try {
      await auth.createUser({
        uid,
        email: ipEmail,
        emailVerified: true,
        password,
        displayName: user.name || undefined,
        disabled: false,
      });
    } catch (ipError) {
      if (ipError.code === 'auth/uid-already-exists' || ipError.code === 'auth/email-already-exists') {
        // Existing IP user — update its password instead. Look up by email
        // in case uid mapping diverged historically.
        let existing;
        try {
          existing = await auth.getUser(uid);
        } catch {
          existing = await auth.getUserByEmail(ipEmail);
        }
        await auth.updateUser(existing.uid, { password });
      } else {
        console.error('IP createUser error during set-password:', ipError);
        return res.status(500).json({ error: 'Failed to set password' });
      }
    }

    // Mirror the IP uid back to the local users row + consent for patients
    if (invitation.role === 'patient') {
      await db.query(`
        UPDATE users
        SET firebase_uid = $1, health_data_consent = TRUE, health_data_consent_date = NOW(), consent_version = '1.0'
        WHERE id = $2
      `, [uid, user.id]);
    } else {
      await db.query(`UPDATE users SET firebase_uid = $1 WHERE id = $2`, [uid, user.id]);
    }

    // Audit log consent
    audit.log(req, 'health_data_consent', 'user', user.id, { consent_version: '1.0' });

    res.json({
      message: 'Password set successfully. You can now login.',
      userId: user.id
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
