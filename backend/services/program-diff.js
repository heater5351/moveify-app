/**
 * Human-readable diff between two program snapshots (see program-revisions.js).
 * Output is injected verbatim into the SOAP prompt's PRESCRIPTION CHANGES block,
 * so lines state exactly what changed — no interpretation.
 */

function describePrescription(ex) {
  const parts = [];
  if (ex.sets != null && ex.reps != null) parts.push(`${ex.sets}×${ex.reps}`);
  if (ex.weight) parts.push(`@ ${ex.weight} kg`);
  if (ex.duration) parts.push(`${ex.duration} sec`);
  if (ex.holdTime) parts.push(`hold ${ex.holdTime}`);
  return parts.join(' ');
}

// Field-level changes for one exercise matched between before/after.
function diffExercise(b, a) {
  const changes = [];
  if (b.sets !== a.sets || b.reps !== a.reps) {
    changes.push(`${b.sets}×${b.reps} → ${a.sets}×${a.reps}`);
  }
  if ((b.weight || 0) !== (a.weight || 0)) {
    changes.push(`weight ${b.weight || 0} → ${a.weight || 0} kg`);
  }
  if ((b.duration || null) !== (a.duration || null)) {
    changes.push(`duration ${b.duration || 0} → ${a.duration || 0} sec`);
  }
  if ((b.rest || null) !== (a.rest || null)) {
    changes.push(`rest ${b.rest || 0} → ${a.rest || 0} sec`);
  }
  if ((b.holdTime || '') !== (a.holdTime || '')) {
    changes.push(`hold ${b.holdTime || 'none'} → ${a.holdTime || 'none'}`);
  }
  if (b.name !== a.name) {
    changes.unshift(`renamed from "${b.name}"`);
  }
  return changes;
}

function parseFrequency(f) {
  if (Array.isArray(f)) return f;
  try { return JSON.parse(f) || []; } catch { return []; }
}

/**
 * Render snapshot diff as plain lines. `before === null` means program creation.
 * Returns [] when nothing meaningful changed.
 */
function renderProgramDiff(before, after) {
  const lines = [];
  if (!after) return lines;

  if (!before) {
    lines.push(`New program assigned: "${after.name}" (${after.exercises.length} exercise${after.exercises.length === 1 ? '' : 's'})`);
    for (const ex of after.exercises) {
      const rx = describePrescription(ex);
      lines.push(`Added: ${ex.name}${rx ? ` (${rx})` : ''}${ex.isWarmup ? ' [warm-up]' : ''}`);
    }
    return lines;
  }

  // Program-level metadata
  if (before.name !== after.name) lines.push(`Program renamed: "${before.name}" → "${after.name}"`);
  const bFreq = parseFrequency(before.frequency).join('/');
  const aFreq = parseFrequency(after.frequency).join('/');
  if (bFreq !== aFreq) lines.push(`Frequency: ${bFreq || 'none'} → ${aFreq || 'none'}`);
  if (before.duration !== after.duration) lines.push(`Duration: ${before.duration} → ${after.duration}`);

  // Exercises matched by program_exercises id
  const beforeById = new Map(before.exercises.map(ex => [ex.id, ex]));
  const afterIds = new Set(after.exercises.map(ex => ex.id));

  for (const a of after.exercises) {
    const b = beforeById.get(a.id);
    if (!b) {
      const rx = describePrescription(a);
      lines.push(`Added: ${a.name}${rx ? ` (${rx})` : ''}${a.isWarmup ? ' [warm-up]' : ''}`);
      continue;
    }
    const changes = diffExercise(b, a);
    if (changes.length > 0) lines.push(`${a.name}: ${changes.join('; ')}`);
  }

  for (const b of before.exercises) {
    if (!afterIds.has(b.id)) lines.push(`Removed: ${b.name}`);
  }

  return lines;
}

module.exports = { renderProgramDiff, describePrescription };
