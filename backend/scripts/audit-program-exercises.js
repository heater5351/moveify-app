// READ-ONLY audit for the program-exercise silent-overwrite bug (fixed 2026-06-12,
// commit 3d70ff5). Before the fix, adding a library exercise during a program
// edit could claim an existing program_exercises row (library-id or duplicate-
// name collision): the row kept its exercise_name while category / image /
// prescription fields were clobbered with the NEW exercise's values.
//
// Detection heuristic (no library file needed — self-referential):
//   For every exercise_name, compute the modal (most common) image_url and
//   category across ALL program_exercises rows. A row whose image_url/category
//   deviates from its own name's modal value AND matches the modal value of a
//   DIFFERENT exercise name is very likely a clobbered row.
//
// Usage (same env as the backend — DATABASE_URL locally, Cloud SQL on GCP):
//   node scripts/audit-program-exercises.js
//
// Makes no writes. Outputs row ids + program/patient ids only (no PHI).

require('dotenv').config();
const db = require('../database/db');

function modalMap(rows, field) {
  // name -> { value -> count }
  const counts = new Map();
  for (const r of rows) {
    const v = (r[field] || '').trim();
    if (!v) continue;
    if (!counts.has(r.exercise_name)) counts.set(r.exercise_name, new Map());
    const m = counts.get(r.exercise_name);
    m.set(v, (m.get(v) || 0) + 1);
  }
  // name -> { value, count, total }
  const modal = new Map();
  for (const [name, m] of counts) {
    let best = null;
    let total = 0;
    for (const [v, c] of m) {
      total += c;
      if (!best || c > best.count) best = { value: v, count: c };
    }
    modal.set(name, { ...best, total });
  }
  return modal;
}

// value -> Set(names for which this is the modal value)
function invert(modal) {
  const inv = new Map();
  for (const [name, { value }] of modal) {
    if (!inv.has(value)) inv.set(value, new Set());
    inv.get(value).add(name);
  }
  return inv;
}

async function main() {
  const { rows } = await db.query(`
    SELECT pe.id, pe.program_id, pe.exercise_name, pe.exercise_category, pe.image_url,
           pe.sets, pe.reps, pe.prescribed_weight,
           p.patient_id, p.name AS program_name, p.updated_at,
           (SELECT COUNT(*) FROM exercise_completions ec WHERE ec.exercise_id = pe.id) AS completion_count
    FROM program_exercises pe
    JOIN programs p ON pe.program_id = p.id
    ORDER BY pe.program_id, pe.exercise_order
  `);
  console.log(`Scanning ${rows.length} program_exercises rows across all programs…\n`);

  const modalImage = modalMap(rows, 'image_url');
  const modalCategory = modalMap(rows, 'exercise_category');
  const imageOwners = invert(modalImage);

  const suspects = [];
  for (const r of rows) {
    const img = (r.image_url || '').trim();
    const cat = (r.exercise_category || '').trim();
    const reasons = [];

    // Image deviates from this name's modal AND belongs (modally) to another name
    const mImg = modalImage.get(r.exercise_name);
    if (img && mImg && mImg.total >= 3 && img !== mImg.value) {
      const owners = imageOwners.get(img);
      const foreign = owners && [...owners].some(n => n !== r.exercise_name);
      if (foreign) {
        reasons.push(`image belongs to "${[...owners].filter(n => n !== r.exercise_name).join('", "')}" (this name's usual image differs, ${mImg.count}/${mImg.total} agree)`);
      }
    }

    // Category deviates from this name's modal (weaker signal — corroboration only)
    const mCat = modalCategory.get(r.exercise_name);
    if (cat && mCat && mCat.total >= 3 && cat !== mCat.value) {
      reasons.push(`category "${cat}" vs usual "${mCat.value}" (${mCat.count}/${mCat.total} agree)`);
    }

    if (reasons.length > 0) {
      suspects.push({ ...r, reasons });
    }
  }

  if (suspects.length === 0) {
    console.log('✓ No suspect rows found — no surviving corruption signature detected.');
  } else {
    console.log(`⚠ ${suspects.length} suspect row(s):\n`);
    for (const s of suspects) {
      console.log(`row ${s.id} — program ${s.program_id} ("${s.program_name}", patient ${s.patient_id}, updated ${new Date(s.updated_at).toISOString().slice(0, 10)})`);
      console.log(`  name: ${s.exercise_name} | ${s.sets}×${s.reps}${s.prescribed_weight ? ` @ ${s.prescribed_weight}kg` : ''} | completions logged: ${s.completion_count}`);
      for (const reason of s.reasons) console.log(`  - ${reason}`);
      console.log('');
    }
    console.log('Review each in the program builder; fix manually (revisions now record every change).');
  }

  await db.pool.end().catch(() => {});
  process.exit(0);
}

main().catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
