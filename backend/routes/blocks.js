// Block-based periodization routes
const express = require('express');
const blockService = require('../services/block-service');
const templateService = require('../services/template-service');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireProgramOwnership } = require('../middleware/ownership');
const db = require('../database/db');

const router = express.Router();

// All block routes require authentication
router.use(authenticate);

// ===== TEMPLATE ROUTES =====
// Must be declared before /:programId wildcard routes to avoid being swallowed

// Get templates (own + global) — clinicianId from JWT
router.get('/templates', requireRole('clinician'), async (req, res) => {
  try {
    const clinicianId = req.user.id;
    const templates = await templateService.getTemplates(clinicianId);
    res.json({ templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

// Create a template (clinicianId from JWT)
router.post('/templates', requireRole('clinician'), async (req, res) => {
  try {
    const clinicianId = req.user.id;
    const { name, description, blockDuration, weeks, isGlobal, weightUnit } = req.body;

    if (!name || !blockDuration) {
      return res.status(400).json({ error: 'name and blockDuration are required' });
    }

    const result = await templateService.createTemplate(
      name, description, blockDuration, weeks || [], clinicianId, isGlobal || false, weightUnit || null
    );
    res.json({ message: 'Template created successfully', ...result });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Get a specific template with weeks
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await templateService.getTemplate(parseInt(id));
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// Update a template (clinicianId from JWT)
router.put('/templates/:id', requireRole('clinician'), async (req, res) => {
  try {
    const { id } = req.params;
    const clinicianId = req.user.id;
    const { name, description, blockDuration, weeks, weightUnit } = req.body;

    if (!name || !blockDuration) {
      return res.status(400).json({ error: 'name and blockDuration are required' });
    }

    const result = await templateService.updateTemplate(
      parseInt(id), name, description, blockDuration, weeks || [], clinicianId, weightUnit || null
    );
    res.json({ message: 'Template updated successfully', ...result });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

// Delete a template (clinicianId from JWT)
router.delete('/templates/:id', requireRole('clinician'), async (req, res) => {
  try {
    const { id } = req.params;
    const clinicianId = req.user.id;

    await templateService.deleteTemplate(parseInt(id), clinicianId);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// Apply a template
router.post('/templates/:id/apply', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await templateService.applyTemplate(parseInt(id));
    res.json(result);
  } catch (error) {
    console.error('Apply template error:', error);
    res.status(500).json({ error: error.message || 'Failed to apply template' });
  }
});

// ===== FLAG ROUTES =====

// Get unresolved flags for the authenticated clinician
router.get('/flags', requireRole('clinician'), async (req, res) => {
  try {
    const clinicianId = req.user.id;
    const flags = await blockService.getUnresolvedFlags(clinicianId);
    res.json({ flags });
  } catch (error) {
    console.error('Get flags error:', error);
    res.status(500).json({ error: 'Failed to get flags' });
  }
});

// Resolve a flag (clinician only, resolvedBy from JWT)
router.patch('/flags/:flagId/resolve', requireRole('clinician'), async (req, res) => {
  try {
    const { flagId } = req.params;
    const resolvedBy = req.user.id;

    await blockService.resolveFlag(parseInt(flagId), resolvedBy);
    res.json({ message: 'Flag resolved successfully' });
  } catch (error) {
    console.error('Resolve flag error:', error);
    res.status(500).json({ error: 'Failed to resolve flag' });
  }
});

// ===== BLOCK ROUTES =====

// Helper: verify program access (clinician ownership or patient self-access)
async function verifyProgramAccess(req, res, next) {
  const programId = parseInt(req.params.programId || req.params.blockScheduleId);
  const userId = req.user.id;
  const role = req.user.role;

  try {
    if (role === 'clinician') {
      const program = await db.getOne(
        'SELECT 1 FROM programs WHERE id = $1 AND clinician_id = $2',
        [programId, userId]
      );
      if (!program) {
        // For block schedule IDs, check via block_schedules -> programs
        const blockProgram = await db.getOne(
          `SELECT 1 FROM block_schedules bs
           JOIN programs p ON bs.program_id = p.id
           WHERE bs.id = $1 AND p.clinician_id = $2`,
          [programId, userId]
        );
        if (!blockProgram) {
          return res.status(403).json({ error: 'You do not have access to this program' });
        }
      }
    } else if (role === 'patient') {
      const program = await db.getOne(
        'SELECT 1 FROM programs WHERE id = $1 AND patient_id = $2',
        [programId, userId]
      );
      if (!program) {
        const blockProgram = await db.getOne(
          `SELECT 1 FROM block_schedules bs
           JOIN programs p ON bs.program_id = p.id
           WHERE bs.id = $1 AND p.patient_id = $2`,
          [programId, userId]
        );
        if (!blockProgram) {
          return res.status(403).json({ error: 'You do not have access to this program' });
        }
      }
    }
    next();
  } catch (error) {
    console.error('Program access check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Create a block for a program (clinician only, with ownership)
router.post('/:programId', requireRole('clinician'), requireProgramOwnership, async (req, res) => {
  try {
    const { programId } = req.params;
    const { blockDuration, startDate, exerciseWeeks } = req.body;

    if (!blockDuration || ![4, 6, 8].includes(Number(blockDuration))) {
      return res.status(400).json({ error: 'blockDuration must be 4, 6, or 8' });
    }
    if (!startDate) {
      return res.status(400).json({ error: 'startDate is required' });
    }

    const result = await blockService.createBlock(
      parseInt(programId),
      Number(blockDuration),
      startDate,
      exerciseWeeks || []
    );

    res.json({ message: 'Block created successfully', ...result });
  } catch (error) {
    console.error('Create block error:', error);
    res.status(500).json({ error: 'Failed to create block' });
  }
});

// Get block status for a program (clinician or patient)
router.get('/:programId', verifyProgramAccess, async (req, res) => {
  try {
    const { programId } = req.params;
    const status = await blockService.getBlockStatus(parseInt(programId));

    if (!status) {
      return res.json({ hasBlock: false });
    }

    res.json({ hasBlock: true, ...status });
  } catch (error) {
    console.error('Get block status error:', error);
    res.status(500).json({ error: 'Failed to get block status' });
  }
});

// Get current prescription for all exercises
router.get('/:programId/prescription', verifyProgramAccess, async (req, res) => {
  try {
    const { programId } = req.params;
    const prescription = await blockService.getCurrentPrescription(parseInt(programId));
    res.json(prescription);
  } catch (error) {
    console.error('Get prescription error:', error);
    res.status(500).json({ error: 'Failed to get prescription' });
  }
});

// Trigger evaluation (patient triggers on login/load)
router.patch('/:programId/evaluate', verifyProgramAccess, async (req, res) => {
  try {
    const { programId } = req.params;
    const result = await blockService.evaluateProgression(parseInt(programId));
    res.json(result);
  } catch (error) {
    console.error('Evaluate progression error:', error);
    res.status(500).json({ error: 'Failed to evaluate progression' });
  }
});

// Manual override: advance, hold, or regress (clinician only)
router.patch('/:programId/override', requireRole('clinician'), requireProgramOwnership, async (req, res) => {
  try {
    const { programId } = req.params;
    const { action } = req.body;

    if (!['advance', 'hold', 'regress'].includes(action)) {
      return res.status(400).json({ error: 'action must be advance, hold, or regress' });
    }

    const result = await blockService.manualOverride(parseInt(programId), action);
    res.json(result);
  } catch (error) {
    console.error('Manual override error:', error);
    res.status(500).json({ error: error.message || 'Failed to apply override' });
  }
});

// Override a single cell (clinician only, overriddenBy from JWT)
router.patch('/:blockScheduleId/cell', requireRole('clinician'), verifyProgramAccess, async (req, res) => {
  try {
    const { blockScheduleId } = req.params;
    const { programExerciseId, weekNumber, sets, reps, rpeTarget, weight, notes } = req.body;

    if (!programExerciseId || !weekNumber) {
      return res.status(400).json({ error: 'programExerciseId and weekNumber are required' });
    }

    await blockService.overrideCell(
      parseInt(blockScheduleId),
      parseInt(programExerciseId),
      parseInt(weekNumber),
      { sets, reps, rpeTarget, weight, notes },
      req.user.id
    );

    res.json({ message: 'Cell updated successfully' });
  } catch (error) {
    console.error('Override cell error:', error);
    res.status(500).json({ error: 'Failed to update cell' });
  }
});

module.exports = router;
