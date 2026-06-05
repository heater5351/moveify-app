const express = require('express');
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/auth');
const { extractText } = require('../services/document-extract');
const audit = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireRole('clinician'));

// In-memory only — the uploaded report (PHI) is never written to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// POST /api/scribe/documents/extract — extract plain text from an uploaded report
// (PDF / DOCX / TXT) so it can be used as extra reassessment baseline context.
// Ephemeral: nothing stored, content never logged. Returns { text, chars }.
router.post('/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const text = await extractText(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!text) {
      return res.status(422).json({ error: 'Could not read any text from this file — it may be a scanned image. Paste the text instead.' });
    }
    audit.log(req, 'document_extracted', 'document', null, { chars: text.length, mimetype: req.file.mimetype });
    res.json({ text, chars: text.length });
  } catch (err) {
    console.error('Document extract error:', err.message); // message only, never content
    res.status(500).json({ error: 'Failed to read the document. Try a PDF or Word file, or paste the text.' });
  }
});

module.exports = router;
