/**
 * Reassessment report assembly.
 *
 * Compares a patient's baseline assessment with their latest reassessment of the
 * SAME tests. The findings extraction + normative grounding is shared with the
 * handout (scribe-llm.extractFindings); this module adds the deterministic
 * pairing + delta layer (normative-data.compareValues) and asks the LLM only to
 * phrase the already-graded changes (scribe-llm.generateReassessmentNarrative).
 *
 * No patient values are logged.
 */
const { extractFindings, generateReassessmentNarrative, extractSubjectiveComparison } = require('./scribe-llm');
const { matchTest, compareValues, buildComparisonInterpretation } = require('./normative-data');

// Parse a consolidated "Test | Result | Interpretation" block into rows, tagging
// each with its canonical normative key (if any) and the body side it refers to.
function parseRows(block) {
  if (!block) return [];
  return block.split('\n')
    .filter(l => l.includes('|'))
    .map(l => {
      const c = l.split('|').map(s => s.trim());
      if (!c[0]) return null;
      const name = c[0], result = c[1] || '', interp = c[2] || '';
      const m = matchTest(name);
      const sideMatch = name.match(/\b(left|right)\b/i);
      const side = sideMatch ? sideMatch[1].toLowerCase() : '';
      // Canonical pairing key (so "Grip Strength Right" pairs across sessions even
      // if worded differently); name-fallback for tests outside the dataset.
      const key = m ? `${m.key}${side ? ':' + side : ''}` : `name:${name.toLowerCase().replace(/\s+/g, ' ')}`;
      return { name, result, interp, key, matched: !!m };
    })
    .filter(Boolean);
}

const CHANGE_LABEL = { improved: 'Improved', declined: 'Declined', maintained: 'Steady' };

// Neutral statement for a finding measured this visit with no baseline to compare
// (e.g. a PROM the initial note didn't capture). Never claims a change/improvement.
const NEW_BASELINE_NOTE = 'Recorded this visit; no baseline value yet to compare against.';

// Pass/fail tests (tandem stance) carry no graded population norm — their
// multi-condition result strings can also differ in shape between visits, so a
// numeric delta is meaningless. Compare pass/fail status instead (verdict
// within = pass, flagged = fail), and leave it neutral when unparseable.
function comparePassFail(res, prevRow, currRow) {
  const pass = v => v === 'within';
  const fail = v => v === 'flagged';
  const pv = res.prevVerdict, cv = res.currVerdict;
  if ((pv !== 'within' && pv !== 'flagged') || (cv !== 'within' && cv !== 'flagged')) {
    return { change: '—', interpretation: 'Compared at both visits; see the recorded conditions.' };
  }
  if (fail(pv) && pass(cv)) return { change: 'Improved', interpretation: 'Now holds the heel-to-toe balance threshold (did not at baseline).' };
  if (pass(pv) && fail(cv)) return { change: 'Declined', interpretation: 'No longer holds the heel-to-toe balance threshold.' };
  if (pass(pv) && pass(cv)) return { change: 'Steady', interpretation: 'Held the heel-to-toe balance threshold at both visits.' };
  return { change: 'Steady', interpretation: 'Still below the heel-to-toe balance threshold at both visits.' };
}

// Build one before/after comparison row + a graded line for the narrative input.
function compareRow(prevRow, currRow, age, sex) {
  const test = currRow.name;
  let change = '—';
  let interpretation;
  let gradedLine;

  if (currRow.matched) {
    const res = compareValues(currRow.name, prevRow.result, currRow.result, age, sex);
    if (res) {
      if (res.def && res.def.type === 'pass_fail') {
        const pf = comparePassFail(res, prevRow, currRow);
        change = pf.change;
        interpretation = pf.interpretation;
      } else {
        change = CHANGE_LABEL[res.direction] || '—';
        interpretation = buildComparisonInterpretation(res) || currRow.interp;
      }
      gradedLine = `${test}: ${prevRow.result} → ${currRow.result} — ${interpretation}`;
    }
  }
  if (!interpretation) {
    // Ungraded (test outside the dataset, or unparseable) — state the change plainly.
    interpretation = prevRow.result !== currRow.result
      ? `Changed from ${prevRow.result} to ${currRow.result}.`
      : 'Unchanged since baseline.';
    gradedLine = `${test}: ${prevRow.result} → ${currRow.result} — ${interpretation}`;
  }

  return {
    row: { test, baseline: prevRow.result, latest: currRow.result, change, interpretation },
    gradedLine,
  };
}

/**
 * Pair baseline vs latest findings by canonical test key (+ side). Returns:
 *   matched      — comparison rows (in both), with grounded change
 *   newFindings  — measured this visit only (Test | Result | Interpretation)
 *   notRepeated  — measured at baseline only (not repeated this visit)
 *   gradedLines  — human-readable graded summary fed to the narrative LLM
 */
function pairFindings(prevBlock, currBlock, age, sex) {
  const prev = parseRows(prevBlock);
  const curr = parseRows(currBlock);
  const prevByKey = new Map(prev.map(r => [r.key, r]));
  const currKeys = new Set(curr.map(r => r.key));

  const matched = [];
  const newFindings = [];
  const gradedLines = [];

  for (const c of curr) {
    const p = prevByKey.get(c.key);
    if (p) {
      const { row, gradedLine } = compareRow(p, c, age, sex);
      matched.push(row);
      gradedLines.push(gradedLine);
    } else {
      // No baseline to compare. For a recognised norm test the extraction
      // interpretation is grounded (a current-state verdict, safe to keep). For
      // anything ungrounded (PROMs like UEFI/PROMIS) the model's text can claim
      // "improved" with nothing to compare against — replace it with a neutral
      // baseline note so we never fabricate a change. (Once the clinician adds the
      // baseline value it pairs and reads "Changed from X to Y.")
      const interpretation = c.matched ? c.interp : NEW_BASELINE_NOTE;
      newFindings.push({ test: c.name, result: c.result, interpretation });
      gradedLines.push(`${c.name}: ${c.result} (measured this visit, no baseline — do NOT describe as improved or declined). ${c.matched ? c.interp : ''}`.trim());
    }
  }

  const notRepeated = prev
    .filter(p => !currKeys.has(p.key))
    .map(p => ({ test: p.name, result: p.result }));

  return { matched, newFindings, notRepeated, gradedLines };
}

// ── Subjective comparison (goals / pain / issues) ────────────────────────────
// Parse the three-section GOALS / PAIN / ISSUES block from extractSubjectiveComparison.
function parseSubjective(raw) {
  const out = { goals: [], pain: [], issues: [] };
  if (!raw) return out;
  let section = null;
  for (const line of raw.split('\n')) {
    const h = line.trim().toUpperCase();
    if (h === 'GOALS') { section = 'goals'; continue; }
    if (h === 'PAIN') { section = 'pain'; continue; }
    if (h === 'ISSUES') { section = 'issues'; continue; }
    if (!section) continue;
    const body = line.replace(/^\s*[-•·*]\s*/, '').trim();
    if (!body) continue;
    const cols = body.split('|').map(s => s.trim());
    if (section === 'goals' && cols[0]) out.goals.push({ goal: cols[0], status: cols[1] || 'unclear', basis: cols[2] || '' });
    else if (section === 'pain' && cols[0]) out.pain.push({ site: cols[0], base: cols[1] || 'ns', latest: cols[2] || 'ns', note: cols[3] || '' });
    else if (section === 'issues' && cols[0]) out.issues.push({ issue: cols[0], change: cols[1] || '' });
  }
  return out;
}

const PAIN_DEADBAND = 2; // points on a 0-10 scale before a change counts (pain is lower-better)
const numOrNull = s => { const m = String(s).match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };

// Numeric pain → before/after comparison rows (lower-better, no population norm).
// ONLY pain rated 0-10 at BOTH visits becomes a row — a "— / — " row carries no
// before/after meaning and reads as clutter. Pain without two scores stays in the
// narrative context instead (see subjectiveNarrativeContext).
function painComparison(pain) {
  const rows = [];
  for (const p of pain) {
    const b = numOrNull(p.base), l = numOrNull(p.latest);
    if (b == null || l == null) continue; // qualitative / one-sided → narrative only
    const d = l - b;
    let change, interp;
    if (Math.abs(d) < PAIN_DEADBAND) { change = 'Steady'; interp = `Pain about the same (${b}/10 to ${l}/10).`; }
    else if (d < 0) { change = 'Improved'; interp = `Pain down ${b - l} points (${b}/10 to ${l}/10).`; }
    else { change = 'Declined'; interp = `Pain up ${l - b} points (${b}/10 to ${l}/10).`; }
    rows.push({ test: `Pain — ${p.site}`, baseline: `${b}/10`, latest: `${l}/10`, change, interpretation: interp });
  }
  return { rows };
}

// Goals + pain + issues → a context block for the narrative LLM (not the table).
// ALL pain is surfaced here (with scores where available) so the prose can speak
// to symptom change even when there is no two-point numeric comparison.
function subjectiveNarrativeContext(parsed) {
  const lines = [];
  if (parsed.goals.length) {
    lines.push('PATIENT GOALS (comment on progress only where the results support it):');
    for (const g of parsed.goals) lines.push(`- ${g.goal} — ${g.status}${g.basis ? ` (${g.basis})` : ''}`);
  }
  if (parsed.pain.length) {
    lines.push('PAIN (describe a change only as far as the note/score supports — do not overstate):');
    for (const p of parsed.pain) {
      const b = numOrNull(p.base), l = numOrNull(p.latest);
      const scores = (b != null || l != null) ? ` [${b != null ? b + '/10' : 'ns'} -> ${l != null ? l + '/10' : 'ns'}]` : '';
      lines.push(`- ${p.site}${scores}${p.note ? ` — ${p.note}` : ''}`);
    }
  }
  if (parsed.issues.length) {
    lines.push('FUNCTIONAL ISSUES / SYMPTOMS:');
    for (const i of parsed.issues) lines.push(`- ${i.issue} — ${i.change}`);
  }
  return lines.join('\n');
}

// Render the matched + new rows back into the editable pipe format the docx
// renderer (parseComparisonRows) and the preview textarea consume.
function comparisonToText(matched) {
  return matched.map(r => `${r.test} | ${r.baseline} | ${r.latest} | ${r.change} | ${r.interpretation}`).join('\n');
}
function findingsToText(rows) {
  return rows.map(r => `${r.test} | ${r.result} | ${r.interpretation || ''}`).join('\n');
}

// Turn the clinician's EDITED comparison table ("Test | Baseline | Latest | Change
// | What it means" lines) back into graded narrative input, so the prose can be
// re-written to match their corrections without re-reading the notes. A row with
// no baseline ("—") is flagged so the model still won't claim a change on it.
function comparisonToNarrativeInput(comparisonText) {
  const noBase = v => !v || v === '—' || v === '-' || /^n\/?a$/i.test(v);
  return (comparisonText || '')
    .split('\n')
    .filter(l => l.includes('|'))
    .map(line => {
      const p = line.split('|').map(s => s.trim());
      const [test, base, latest, change, interp] = p;
      if (!test) return null;
      const tag = noBase(base) ? ' (new this visit, no baseline — do NOT describe as improved or declined)' : '';
      return `${test}: ${base || '—'} → ${latest || ''} — ${change ? change + '. ' : ''}${interp || ''}${tag}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Re-write ONLY the narrative from an edited comparison table (+ the original
 * goals/pain/issues context), without re-extracting from the notes. Lets a
 * clinician correct the objective results and regenerate the prose to match.
 */
async function regenerateNarrative(comparisonText, subjectiveContext = '') {
  const narrativeInput = comparisonToNarrativeInput(comparisonText);
  if (!narrativeInput && !subjectiveContext) {
    return { progress: '', nextSteps: '', resultsSummary: '' };
  }
  const out = await generateReassessmentNarrative(narrativeInput, subjectiveContext);
  return { progress: out.progress, nextSteps: out.nextSteps, resultsSummary: out.resultsSummary };
}

/**
 * Full reassessment generation: extract findings from both sources, pair + grade
 * deterministically, then phrase the narrative. demographics = { age, sex }.
 */
async function generateReassessment(prevText, currText, demographics = {}) {
  const { age = null, sex = null } = demographics;

  // Objective findings (both notes) + the subjective comparison run in parallel.
  const [prevBlock, currBlock, subjectiveRaw] = await Promise.all([
    extractFindings(prevText, age, sex),
    extractFindings(currText, age, sex),
    extractSubjectiveComparison(prevText, currText),
  ]);

  const { matched, newFindings, notRepeated, gradedLines } = pairFindings(prevBlock, currBlock, age, sex);

  // Goals / pain / issues. Pain rated 0-10 at both visits becomes comparison rows
  // (lower-better); goals + issues + all pain feed the narrative context.
  const subjective = parseSubjective(subjectiveRaw);
  const { rows: painRows } = painComparison(subjective.pain);
  const comparisonRows = [...matched, ...painRows];

  // Narrative input: the graded objective comparison + what wasn't repeated.
  // (Pain/goals/issues ride in via subjectiveContext below.)
  let narrativeInput = gradedLines.join('\n');
  if (notRepeated.length) {
    narrativeInput += `\n\nMeasured at baseline but not repeated this visit (do not claim progress on these): ${notRepeated.map(r => r.test).join(', ')}.`;
  }
  const subjectiveContext = subjectiveNarrativeContext(subjective);

  let progress = '', nextSteps = '', resultsSummary = '';
  if (comparisonRows.length || newFindings.length || subjectiveContext) {
    try {
      const out = await generateReassessmentNarrative(narrativeInput, subjectiveContext);
      progress = out.progress;
      nextSteps = out.nextSteps;
      resultsSummary = out.resultsSummary;
    } catch (err) {
      console.error('Reassessment narrative failed:', err.message);
    }
  }

  return {
    comparison: comparisonToText(comparisonRows),
    newFindings: findingsToText(newFindings),
    notRepeated, // structured — surfaced as a hint in the UI, not the patient doc
    goals: subjective.goals, // structured — surfaced in the UI editor
    subjectiveContext, // returned so "rewrite from results" keeps goals/pain context
    progress,
    nextSteps,
    resultsSummary,
    counts: { matched: matched.length, new: newFindings.length, notRepeated: notRepeated.length, pain: painRows.length, goals: subjective.goals.length },
  };
}

module.exports = { generateReassessment, regenerateNarrative, comparisonToNarrativeInput, pairFindings, parseRows, parseSubjective, painComparison };
