// Education module routes
const express = require('express');
const router = express.Router();
const educationService = require('../services/education-service');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePatientOwnership, requirePatientAccess, requireSelf } = require('../middleware/ownership');

// All education routes require authentication
router.use(authenticate);

// Get all education modules (clinician only — library view)
router.get('/modules', requireRole('clinician'), async (req, res) => {
  try {
    const { category } = req.query;
    const modules = await educationService.getAllModules({
      category,
      createdBy: req.user.id
    });
    res.json({ modules });
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({ error: 'Failed to get modules' });
  }
});

// Get a single module
router.get('/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const module = await educationService.getModuleById(parseInt(moduleId));

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    res.json(module);
  } catch (error) {
    console.error('Get module error:', error);
    res.status(500).json({ error: 'Failed to get module' });
  }
});

// Create a new module (clinician only, createdBy from JWT)
router.post('/modules', requireRole('clinician'), async (req, res) => {
  try {
    const {
      title,
      description,
      content,
      category,
      estimatedDurationMinutes,
      imageUrl,
      videoUrl
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const module = await educationService.createModule({
      title,
      description,
      content,
      category,
      estimatedDurationMinutes,
      imageUrl,
      videoUrl,
      createdBy: req.user.id
    });

    res.status(201).json(module);
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({ error: 'Failed to create module' });
  }
});

// Update a module (clinician only)
router.put('/modules/:moduleId', requireRole('clinician'), async (req, res) => {
  try {
    const { moduleId } = req.params;
    const updates = req.body;

    const module = await educationService.updateModule(parseInt(moduleId), updates);
    res.json(module);
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({ error: 'Failed to update module' });
  }
});

// Delete a module (clinician only)
router.delete('/modules/:moduleId', requireRole('clinician'), async (req, res) => {
  try {
    const { moduleId } = req.params;
    await educationService.deleteModule(parseInt(moduleId));
    res.json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

// Get module categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await educationService.getCategories();
    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// Get modules assigned to a patient (clinician with ownership, or patient self)
router.get('/patient/:patientId/modules', requirePatientAccess, async (req, res) => {
  try {
    const { patientId } = req.params;
    const modules = await educationService.getPatientModules(parseInt(patientId));
    res.json({ modules });
  } catch (error) {
    console.error('Get patient modules error:', error);
    res.status(500).json({ error: 'Failed to get patient modules' });
  }
});

// Assign a module to a patient (clinician only, with ownership)
router.post('/patient/:patientId/modules/:moduleId', requireRole('clinician'), requirePatientOwnership, async (req, res) => {
  try {
    const { patientId, moduleId } = req.params;
    await educationService.assignModuleToPatient(
      parseInt(patientId),
      parseInt(moduleId)
    );
    res.json({ message: 'Module assigned successfully' });
  } catch (error) {
    console.error('Assign module error:', error);
    res.status(500).json({ error: 'Failed to assign module' });
  }
});

// Mark a module as viewed (patient accessing own data)
router.post('/patient/:patientId/modules/:moduleId/viewed', requireSelf('patientId'), async (req, res) => {
  try {
    const { patientId, moduleId } = req.params;
    await educationService.markModuleAsViewed(
      parseInt(patientId),
      parseInt(moduleId)
    );
    res.json({ message: 'Module marked as viewed' });
  } catch (error) {
    console.error('Mark viewed error:', error);
    res.status(500).json({ error: 'Failed to mark module as viewed' });
  }
});

// Unassign a module from a patient (clinician only, with ownership)
router.delete('/patient/:patientId/modules/:moduleId', requireRole('clinician'), requirePatientOwnership, async (req, res) => {
  try {
    const { patientId, moduleId } = req.params;
    await educationService.unassignModuleFromPatient(
      parseInt(patientId),
      parseInt(moduleId)
    );
    res.json({ message: 'Module unassigned successfully' });
  } catch (error) {
    console.error('Unassign module error:', error);
    res.status(500).json({ error: 'Failed to unassign module' });
  }
});

module.exports = router;
