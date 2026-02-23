// Block-based periodization routes
const express = require('express');
const blockService = require('../services/block-service');
const templateService = require('../services/template-service');

const router = express.Router();

// ===== BLOCK ROUTES =====

// Create a block for a program
// POST /api/blocks/:programId
router.post('/:programId', async (req, res) => {
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

// Get block status for a program
// GET /api/blocks/:programId
router.get('/:programId', async (req, res) => {
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
// GET /api/blocks/:programId/prescription
router.get('/:programId/prescription', async (req, res) => {
  try {
    const { programId } = req.params;
    const prescription = await blockService.getCurrentPrescription(parseInt(programId));
    res.json(prescription);
  } catch (error) {
    console.error('Get prescription error:', error);
    res.status(500).json({ error: 'Failed to get prescription' });
  }
});

// Trigger evaluation (lazy trigger from frontend on login/load)
// PATCH /api/blocks/:programId/evaluate
router.patch('/:programId/evaluate', async (req, res) => {
  try {
    const { programId } = req.params;
    const result = await blockService.evaluateProgression(parseInt(programId));
    res.json(result);
  } catch (error) {
    console.error('Evaluate progression error:', error);
    res.status(500).json({ error: 'Failed to evaluate progression' });
  }
});

// Manual override: advance, hold, or regress
// PATCH /api/blocks/:programId/override
router.patch('/:programId/override', async (req, res) => {
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

// Override a single cell
// PATCH /api/blocks/:blockScheduleId/cell
router.patch('/:blockScheduleId/cell', async (req, res) => {
  try {
    const { blockScheduleId } = req.params;
    const { programExerciseId, weekNumber, sets, reps, rpeTarget, weight, notes, overriddenBy } = req.body;

    if (!programExerciseId || !weekNumber) {
      return res.status(400).json({ error: 'programExerciseId and weekNumber are required' });
    }

    await blockService.overrideCell(
      parseInt(blockScheduleId),
      parseInt(programExerciseId),
      parseInt(weekNumber),
      { sets, reps, rpeTarget, weight, notes },
      overriddenBy
    );

    res.json({ message: 'Cell updated successfully' });
  } catch (error) {
    console.error('Override cell error:', error);
    res.status(500).json({ error: 'Failed to update cell' });
  }
});

// ===== TEMPLATE ROUTES =====

// Get templates (own + global)
// GET /api/blocks/templates?clinicianId=X
router.get('/templates', async (req, res) => {
  try {
    const { clinicianId } = req.query;
    if (!clinicianId) {
      return res.status(400).json({ error: 'clinicianId is required' });
    }
    const templates = await templateService.getTemplates(parseInt(clinicianId));
    res.json({ templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

// Create a template
// POST /api/blocks/templates
router.post('/templates', async (req, res) => {
  try {
    const { name, description, blockDuration, weeks, clinicianId, isGlobal } = req.body;

    if (!name || !blockDuration || !clinicianId) {
      return res.status(400).json({ error: 'name, blockDuration, and clinicianId are required' });
    }

    const result = await templateService.createTemplate(
      name, description, blockDuration, weeks || [], clinicianId, isGlobal || false
    );
    res.json({ message: 'Template created successfully', ...result });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Get a specific template with weeks
// GET /api/blocks/templates/:id
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

// Delete a template
// DELETE /api/blocks/templates/:id
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { clinicianId } = req.body;

    if (!clinicianId) {
      return res.status(400).json({ error: 'clinicianId is required' });
    }

    await templateService.deleteTemplate(parseInt(id), parseInt(clinicianId));
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// Apply a template to a program's exercises
// POST /api/blocks/templates/:id/apply
router.post('/templates/:id/apply', async (req, res) => {
  try {
    const { id } = req.params;
    const { programExerciseIds } = req.body;

    if (!programExerciseIds || !Array.isArray(programExerciseIds)) {
      return res.status(400).json({ error: 'programExerciseIds array is required' });
    }

    const result = await templateService.applyTemplate(parseInt(id), programExerciseIds);
    res.json(result);
  } catch (error) {
    console.error('Apply template error:', error);
    res.status(500).json({ error: error.message || 'Failed to apply template' });
  }
});

// ===== FLAG ROUTES =====

// Get unresolved flags for a clinician
// GET /api/blocks/flags/:clinicianId
router.get('/flags/:clinicianId', async (req, res) => {
  try {
    const { clinicianId } = req.params;
    const flags = await blockService.getUnresolvedFlags(parseInt(clinicianId));
    res.json({ flags });
  } catch (error) {
    console.error('Get flags error:', error);
    res.status(500).json({ error: 'Failed to get flags' });
  }
});

// Resolve a flag
// PATCH /api/blocks/flags/:flagId/resolve
router.patch('/flags/:flagId/resolve', async (req, res) => {
  try {
    const { flagId } = req.params;
    const { resolvedBy } = req.body;

    await blockService.resolveFlag(parseInt(flagId), resolvedBy);
    res.json({ message: 'Flag resolved successfully' });
  } catch (error) {
    console.error('Resolve flag error:', error);
    res.status(500).json({ error: 'Failed to resolve flag' });
  }
});

module.exports = router;
