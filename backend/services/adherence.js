// Adherence service — powers the clinician Dashboard (cross-patient at-a-glance view).
//
// Self-contained on purpose: the per-patient analytics endpoint in routes/programs.js
// has its own battle-tested copy of the schedule-aware math. We deliberately do NOT
// import from it (keeps that production path untouched). isScheduledDay is duplicated
// here; if these two ever diverge, reconcile against programs.js.

// Timezone-safe date string (avoids UTC shift from toISOString)
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Is `date` a scheduled training day for the given frequency (e.g. ["Mon","Wed","Fri"])?
function isScheduledDay(date, frequency) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return frequency.includes(dayNames[date.getDay()]);
}

// Number of weeks implied by a program's `duration` enum, or null for open-ended.
const DURATION_WEEKS = { '1week': 1, '2weeks': 2, '4weeks': 4, '6weeks': 6 };

// Resolve a program's effective active window for `today`.
// start: program.start_date may be a real date OR a keyword like 'today' — fall back
//        to created_at when it doesn't parse (mirrors routes/programs.js analytics).
// end:   from the duration enum / custom_end_date; 'ongoing' = no end; 'completed' = inactive.
function resolveProgramWindow(program, today) {
  let startDate = null;
  if (program.start_date) {
    const parsed = new Date(program.start_date);
    if (!isNaN(parsed.getTime())) startDate = parsed;
  }
  if (!startDate && program.created_at) {
    const parsed = new Date(program.created_at);
    if (!isNaN(parsed.getTime())) startDate = parsed;
  }
  if (startDate) startDate.setHours(0, 0, 0, 0);

  const duration = program.duration;
  let endDate = null;
  let inactive = false;

  if (duration === 'completed') {
    inactive = true;
  } else if (duration === 'ongoing') {
    endDate = null; // open-ended
  } else if (duration === 'custom') {
    if (program.custom_end_date) {
      const parsed = new Date(program.custom_end_date);
      if (!isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        endDate = parsed;
      }
    }
  } else if (DURATION_WEEKS[duration] != null && startDate) {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + DURATION_WEEKS[duration] * 7);
  }

  let isActive = false;
  if (!inactive && startDate) {
    const startedYet = today >= startDate;
    const notEnded = !endDate || today <= endDate;
    isActive = startedYet && notEnded;
  }

  return { startDate, endDate, isActive };
}

// Compute a patient's adherence over the last `days`, aggregated across active programs.
//
// programs:            [{ id, frequency: string[], start_date, created_at, duration, custom_end_date }]
// exercisesByProgram:  { [programId]: numberOfNonWarmupExercises }
// completionsInWindow: number of exercise completions within the window across active programs
// lastActivityDate:    'YYYY-MM-DD' of the patient's most recent completion (all-time), or null
function computeAdherence({ programs, exercisesByProgram, completionsInWindow, lastActivityDate, days, today }) {
  const day0 = new Date(today);
  day0.setHours(0, 0, 0, 0);

  let prescribed = 0;
  for (const program of programs) {
    const { startDate, isActive } = resolveProgramWindow(program, day0);
    if (!isActive) continue;

    const frequency = Array.isArray(program.frequency) ? program.frequency : [];
    const exerciseCount = exercisesByProgram[program.id] || 0;
    if (frequency.length === 0 || exerciseCount === 0) continue;

    const effectiveStart = startDate || day0;
    let scheduledDays = 0;
    for (let d = 0; d < days; d++) {
      const checkDate = new Date(day0);
      checkDate.setDate(checkDate.getDate() - d);
      if (checkDate >= effectiveStart && isScheduledDay(checkDate, frequency)) {
        scheduledDays++;
      }
    }
    prescribed += scheduledDays * exerciseCount;
  }

  const completed = completionsInWindow || 0;
  let completionRate = 0;
  if (prescribed > 0) {
    completionRate = Math.min(Math.round((completed / prescribed) * 100), 100);
  } else {
    completionRate = completed > 0 ? 100 : 0;
  }

  let daysSinceLastActivity = null;
  if (lastActivityDate) {
    const last = new Date(lastActivityDate);
    last.setHours(0, 0, 0, 0);
    daysSinceLastActivity = Math.round((day0 - last) / (1000 * 60 * 60 * 24));
    if (daysSinceLastActivity < 0) daysSinceLastActivity = 0;
  }

  // Status: "fallen-off" dominates (active program but gone quiet ≥7 days), else bucket by rate.
  let status;
  if (daysSinceLastActivity == null || daysSinceLastActivity >= 7) {
    status = 'fallen-off';
  } else if (completionRate >= 80) {
    status = 'on-track';
  } else if (completionRate >= 50) {
    status = 'slipping';
  } else {
    status = 'at-risk';
  }

  return { completionRate, prescribed, completed, daysSinceLastActivity, status };
}

module.exports = { isScheduledDay, resolveProgramWindow, computeAdherence, toLocalDateString };
