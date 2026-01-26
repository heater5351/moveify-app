// Daily check-in service - handles wellbeing tracking and warnings
const db = require('../database/db');

/**
 * Analyze check-in data and generate warnings/suggestions
 */
function analyzeCheckIn(checkIn) {
  const warnings = [];

  // Check for low energy or poor overall feeling
  if (checkIn.overallFeeling <= 2 || checkIn.energyLevel <= 2) {
    warnings.push({
      type: 'low_energy',
      message: "You're reporting low energy today.",
      suggestion: "Consider reducing your workout volume by 1 set or taking it easier today."
    });
  }

  // Check for high general pain
  if (checkIn.generalPainLevel >= 7) {
    warnings.push({
      type: 'high_pain',
      message: "You're experiencing significant pain today.",
      suggestion: "Consider resting today or consulting with your clinician before exercising."
    });
  }

  // Check for poor recovery (bad sleep + low energy)
  if (checkIn.sleepQuality <= 2 && checkIn.energyLevel <= 2) {
    warnings.push({
      type: 'poor_recovery',
      message: "Your recovery seems low (poor sleep + low energy).",
      suggestion: "Be cautious today. Consider reducing volume or intensity."
    });
  }

  return warnings;
}

/**
 * Submit a daily check-in
 */
async function submitCheckIn(checkInData) {
  // PostgreSQL upsert using ON CONFLICT
  await db.query(`
    INSERT INTO daily_check_ins (
      patient_id,
      check_in_date,
      overall_feeling,
      general_pain_level,
      energy_level,
      sleep_quality,
      notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(patient_id, check_in_date)
    DO UPDATE SET
      overall_feeling = EXCLUDED.overall_feeling,
      general_pain_level = EXCLUDED.general_pain_level,
      energy_level = EXCLUDED.energy_level,
      sleep_quality = EXCLUDED.sleep_quality,
      notes = EXCLUDED.notes
  `, [
    checkInData.patientId,
    checkInData.checkInDate,
    checkInData.overallFeeling,
    checkInData.generalPainLevel,
    checkInData.energyLevel,
    checkInData.sleepQuality,
    checkInData.notes || null
  ]);

  // Get the inserted/updated check-in
  const checkIn = await db.getOne(`
    SELECT * FROM daily_check_ins
    WHERE patient_id = $1 AND check_in_date = $2
  `, [checkInData.patientId, checkInData.checkInDate]);

  // Analyze and return with warnings
  const warnings = analyzeCheckIn({
    overallFeeling: checkIn.overall_feeling,
    generalPainLevel: checkIn.general_pain_level,
    energyLevel: checkIn.energy_level,
    sleepQuality: checkIn.sleep_quality
  });

  return {
    checkIn: {
      id: checkIn.id,
      patientId: checkIn.patient_id,
      checkInDate: checkIn.check_in_date,
      overallFeeling: checkIn.overall_feeling,
      generalPainLevel: checkIn.general_pain_level,
      energyLevel: checkIn.energy_level,
      sleepQuality: checkIn.sleep_quality,
      notes: checkIn.notes,
      createdAt: checkIn.created_at
    },
    warnings
  };
}

/**
 * Get today's check-in for a patient
 */
async function getTodayCheckIn(patientId) {
  const today = new Date().toISOString().split('T')[0];

  const checkIn = await db.getOne(`
    SELECT * FROM daily_check_ins
    WHERE patient_id = $1 AND check_in_date = $2
  `, [patientId, today]);

  if (!checkIn) {
    return null;
  }

  return {
    id: checkIn.id,
    patientId: checkIn.patient_id,
    checkInDate: checkIn.check_in_date,
    overallFeeling: checkIn.overall_feeling,
    generalPainLevel: checkIn.general_pain_level,
    energyLevel: checkIn.energy_level,
    sleepQuality: checkIn.sleep_quality,
    notes: checkIn.notes,
    createdAt: checkIn.created_at
  };
}

/**
 * Get check-in history for a patient
 */
async function getCheckInHistory(patientId, days = 30) {
  const checkIns = await db.getAll(`
    SELECT * FROM daily_check_ins
    WHERE patient_id = $1
    ORDER BY check_in_date DESC
    LIMIT $2
  `, [patientId, days]);

  return checkIns.map(checkIn => ({
    id: checkIn.id,
    patientId: checkIn.patient_id,
    checkInDate: checkIn.check_in_date,
    overallFeeling: checkIn.overall_feeling,
    generalPainLevel: checkIn.general_pain_level,
    energyLevel: checkIn.energy_level,
    sleepQuality: checkIn.sleep_quality,
    notes: checkIn.notes,
    createdAt: checkIn.created_at
  }));
}

/**
 * Get average check-in metrics over a date range
 */
async function getAverageCheckInMetrics(patientId, startDate, endDate) {
  const result = await db.getOne(`
    SELECT
      AVG(overall_feeling) as "avgOverallFeeling",
      AVG(general_pain_level) as "avgGeneralPain",
      AVG(energy_level) as "avgEnergy",
      AVG(sleep_quality) as "avgSleep",
      COUNT(*) as "checkInCount"
    FROM daily_check_ins
    WHERE patient_id = $1
      AND check_in_date >= $2
      AND check_in_date <= $3
  `, [patientId, startDate, endDate]);

  return {
    avgOverallFeeling: parseFloat(result?.avgOverallFeeling) || 0,
    avgGeneralPain: parseFloat(result?.avgGeneralPain) || 0,
    avgEnergy: parseFloat(result?.avgEnergy) || 0,
    avgSleep: parseFloat(result?.avgSleep) || 0,
    checkInCount: parseInt(result?.checkInCount) || 0
  };
}

module.exports = {
  submitCheckIn,
  getTodayCheckIn,
  getCheckInHistory,
  getAverageCheckInMetrics,
  analyzeCheckIn
};
