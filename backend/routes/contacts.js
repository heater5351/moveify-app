// Shared contacts directory (PMS-style referrers/relationships).
//
// A clinic-wide directory of reusable contacts (GPs, specialists, NDIS support
// coordinators, parents/guardians, etc.). Patients link to these many-to-many
// via patient_contacts (see routes/patients.js). Clinician-only; every mutation
// is audit-logged. Contacts may hold third-party PII — never write contact
// details to application logs.
const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// Reject non-integer path params up front with a clean 400.
router.param('id', (req, res, next, val) => {
  if (!/^\d+$/.test(val)) return res.status(400).json({ error: 'Invalid contact id' });
  next();
});

const CONTACT_TYPES = new Set(['gp', 'specialist', 'support_coordinator', 'guardian', 'other']);

function mapRow(r) {
  return {
    id: r.id,
    contactType: r.contact_type,
    title: r.title || '',
    name: r.name,
    organisation: r.organisation || '',
    specialty: r.specialty || '',
    phone: r.phone || '',
    email: r.email || '',
    address: r.address || '',
    notes: r.notes || '',
    patientCount: r.patient_count != null ? Number(r.patient_count) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Trim a string field; '' / missing → null (so empty inputs clear the column).
function clean(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

// Normalise + validate a create/update body. Returns { error } or { values }.
function parseBody(body) {
  const name = clean(body.name, 200);
  if (!name) return { error: 'Name is required' };
  let contactType = clean(body.contactType, 40) || 'other';
  if (!CONTACT_TYPES.has(contactType)) contactType = 'other';
  return {
    values: {
      contactType,
      title: clean(body.title, 40),
      name,
      organisation: clean(body.organisation, 200),
      specialty: clean(body.specialty, 120),
      phone: clean(body.phone, 60),
      email: clean(body.email, 200),
      address: clean(body.address, 300),
      notes: clean(body.notes, 2000),
    },
  };
}

// GET /api/contacts?q=&type= — directory list/search (name or organisation),
// with how many patients each contact is linked to.
router.get('/', async (req, res) => {
  try {
    const q = clean(req.query.q, 100);
    const type = clean(req.query.type, 40);
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(c.name ILIKE $${params.length} OR c.organisation ILIKE $${params.length})`);
    }
    if (type && CONTACT_TYPES.has(type)) {
      params.push(type);
      where.push(`c.contact_type = $${params.length}`);
    }
    const rows = await db.getAll(
      `SELECT c.*, COUNT(pc.id) AS patient_count
         FROM contacts c
         LEFT JOIN patient_contacts pc ON pc.contact_id = c.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY c.id
        ORDER BY c.name ASC`,
      params
    );
    res.json({ contacts: rows.map(mapRow) });
  } catch (err) {
    console.error('List contacts error:', err.message);
    res.status(500).json({ error: 'Failed to load contacts' });
  }
});

// POST /api/contacts — create a directory contact.
router.post('/', async (req, res) => {
  try {
    const { error, values } = parseBody(req.body);
    if (error) return res.status(400).json({ error });
    const row = await db.getOne(
      `INSERT INTO contacts
         (contact_type, title, name, organisation, specialty, phone, email, address, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [values.contactType, values.title, values.name, values.organisation, values.specialty,
       values.phone, values.email, values.address, values.notes, req.user.id]
    );
    audit.log(req, 'contact_create', 'contact', row.id, { contactType: values.contactType });
    res.status(201).json(mapRow(row));
  } catch (err) {
    console.error('Create contact error:', err.message);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// GET /api/contacts/:id — a contact plus the patients it's linked to.
router.get('/:id', async (req, res) => {
  try {
    const contact = await db.getOne(`SELECT * FROM contacts WHERE id = $1`, [req.params.id]);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    const patients = await db.getAll(
      `SELECT pc.id AS link_id, pc.relationship, pc.is_report_recipient, pc.is_emergency,
              u.id AS patient_id, u.name AS patient_name
         FROM patient_contacts pc
         JOIN users u ON u.id = pc.patient_id
        WHERE pc.contact_id = $1
        ORDER BY u.name ASC`,
      [req.params.id]
    );
    res.json({
      ...mapRow(contact),
      patients: patients.map(p => ({
        linkId: p.link_id,
        patientId: p.patient_id,
        patientName: p.patient_name,
        relationship: p.relationship || '',
        isReportRecipient: p.is_report_recipient,
        isEmergency: p.is_emergency,
      })),
    });
  } catch (err) {
    console.error('Get contact error:', err.message);
    res.status(500).json({ error: 'Failed to load contact' });
  }
});

// PUT /api/contacts/:id — update a directory contact.
router.put('/:id', async (req, res) => {
  try {
    const { error, values } = parseBody(req.body);
    if (error) return res.status(400).json({ error });
    const row = await db.getOne(
      `UPDATE contacts SET
         contact_type = $1, title = $2, name = $3, organisation = $4, specialty = $5,
         phone = $6, email = $7, address = $8, notes = $9, updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [values.contactType, values.title, values.name, values.organisation, values.specialty,
       values.phone, values.email, values.address, values.notes, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Contact not found' });
    audit.log(req, 'contact_update', 'contact', row.id, { contactType: values.contactType });
    res.json(mapRow(row));
  } catch (err) {
    console.error('Update contact error:', err.message);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id — delete (cascade removes patient_contacts links).
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.run(`DELETE FROM contacts WHERE id = $1`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Contact not found' });
    audit.log(req, 'contact_delete', 'contact', parseInt(req.params.id), {});
    res.json({ success: true });
  } catch (err) {
    console.error('Delete contact error:', err.message);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

module.exports = router;
