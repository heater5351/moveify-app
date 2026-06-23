// Patient file attachments (PMS "Files" section).
//
// Object bytes live in GCS (australia-southeast1); the patient_files table holds
// metadata only. Clinician-only. Downloads stream through this authenticated
// endpoint (no public/signed URLs) so every PHI access is access-controlled and
// audit-logged. Filenames/contents are never written to application logs.
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../services/audit');
const fileStore = require('../lib/patient-file-store');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// In-memory only — bytes go straight to GCS, never to disk. 25 MB cap.
const MAX_BYTES = 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

// Multer throws its size/error in middleware (before the handler), so wrap it to
// translate those into clean JSON responses.
function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (max 25 MB).' });
      return res.status(400).json({ error: 'Upload failed' });
    }
    next();
  });
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/heic', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/csv',
]);

// Strip any path component and control chars from a client-supplied filename.
function safeName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\x00-\x1f]/g, '').trim();
  return base.slice(0, 200) || 'file';
}

async function patientExists(patientId) {
  const r = await db.getOne(`SELECT id FROM users WHERE id = $1 AND role = 'patient'`, [patientId]);
  return !!r;
}

function mapRow(r) {
  return {
    id: r.id,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    category: r.category,
    description: r.description,
    uploadedByName: r.uploaded_by_name || null,
    createdAt: r.created_at,
  };
}

// GET /api/patient-files/:patientId — list a patient's files (metadata only).
// `configured` lets the UI show a clear "storage not set up" state.
router.get('/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const rows = await db.getAll(
      `SELECT pf.id, pf.filename, pf.content_type, pf.size_bytes, pf.category,
              pf.description, pf.created_at, u.name AS uploaded_by_name
         FROM patient_files pf
         LEFT JOIN users u ON pf.uploaded_by = u.id
        WHERE pf.patient_id = $1
        ORDER BY pf.created_at DESC`,
      [patientId]
    );
    res.json({ configured: fileStore.isConfigured(), files: rows.map(mapRow) });
  } catch (err) {
    console.error('List patient files error:', err.message);
    res.status(500).json({ error: 'Failed to load files' });
  }
});

// POST /api/patient-files/:patientId — upload a file
router.post('/:patientId', uploadSingle, async (req, res) => {
  try {
    if (!fileStore.isConfigured()) {
      return res.status(503).json({ error: 'File storage is not configured yet.' });
    }
    const { patientId } = req.params;
    if (!(await patientExists(patientId))) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.file.mimetype && !ALLOWED_TYPES.has(req.file.mimetype)) {
      return res.status(415).json({ error: 'Unsupported file type' });
    }

    const filename = safeName(req.file.originalname);
    const category = (req.body.category || '').slice(0, 60) || null;
    const description = (req.body.description || '').slice(0, 500) || null;
    const storageKey = `patients/${patientId}/${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;

    await fileStore.saveObject(storageKey, req.file.buffer, req.file.mimetype);

    const row = await db.getOne(
      `INSERT INTO patient_files
         (patient_id, uploaded_by, filename, storage_key, content_type, size_bytes, category, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [patientId, req.user.id, filename, storageKey, req.file.mimetype || null, req.file.size, category, description]
    );

    const uploader = await db.getOne(`SELECT name FROM users WHERE id = $1`, [req.user.id]);

    // Audit the access — never the filename/contents (may contain PHI).
    audit.log(req, 'patient_file_upload', 'patient', parseInt(patientId), {
      fileId: row.id, contentType: req.file.mimetype || null, sizeBytes: req.file.size, category,
    });

    res.status(201).json(mapRow({
      id: row.id, filename, content_type: req.file.mimetype || null, size_bytes: req.file.size,
      category, description, uploaded_by_name: uploader ? uploader.name : null, created_at: row.created_at,
    }));
  } catch (err) {
    console.error('Upload patient file error:', err.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/patient-files/:patientId/:fileId/download — stream the object
router.get('/:patientId/:fileId/download', async (req, res) => {
  try {
    if (!fileStore.isConfigured()) {
      return res.status(503).json({ error: 'File storage is not configured yet.' });
    }
    const { patientId, fileId } = req.params;
    const row = await db.getOne(
      `SELECT filename, storage_key, content_type FROM patient_files WHERE id = $1 AND patient_id = $2`,
      [fileId, patientId]
    );
    if (!row) return res.status(404).json({ error: 'File not found' });

    audit.log(req, 'patient_file_download', 'patient', parseInt(patientId), { fileId: parseInt(fileId) });

    res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');

    const stream = fileStore.createReadStream(row.storage_key);
    stream.on('error', (e) => {
      console.error('Patient file stream error:', e.message);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to read file' });
      else res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    console.error('Download patient file error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to download file' });
  }
});

// DELETE /api/patient-files/:patientId/:fileId — remove object + metadata row
router.delete('/:patientId/:fileId', async (req, res) => {
  try {
    const { patientId, fileId } = req.params;
    const row = await db.getOne(
      `SELECT storage_key FROM patient_files WHERE id = $1 AND patient_id = $2`,
      [fileId, patientId]
    );
    if (!row) return res.status(404).json({ error: 'File not found' });

    // Best-effort object delete; always remove the metadata row so the record
    // doesn't dangle even if the object is already gone.
    try { await fileStore.deleteObject(row.storage_key); }
    catch (e) { console.error('GCS object delete failed (continuing):', e.message); }

    await db.query(`DELETE FROM patient_files WHERE id = $1 AND patient_id = $2`, [fileId, patientId]);

    audit.log(req, 'patient_file_delete', 'patient', parseInt(patientId), { fileId: parseInt(fileId) });
    res.json({ message: 'File deleted' });
  } catch (err) {
    console.error('Delete patient file error:', err.message);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
