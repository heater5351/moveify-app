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
const { extractFindings, generateReassessmentNarrative } = require('./scribe-llm');
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

// Build one before/after comparison row + a graded line for the narrative input.
function compareRow(prevRow, currRow, age, sex) {
  const test = currRow.name;
  let change = '—';
  let interpretation;
  let gradedLine;

  if (currRow.matched) {
    const res = compareValues(currRow.name, prevRow.result, currRow.result, age, sex);
    if (res) {
      change = CHANGE_LABEL[res.direction] || '—';
      interpretation = buildComparisonInterpretation(res) || currRow.interp;
      gradedLine = `${test}: ${prevRow.result} → ${currRow.result} — ${res.direction || 'no graded direction'}. ${interpretation}`;
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
      newFindings.push({ test: c.name, result: c.result, interpretation: c.interp });
      gradedLines.push(`${c.name}: ${c.result} (new this visit, no baseline). ${c.interp}`);
    }
  }

  const notRepeated = prev
    .filter(p => !currKeys.has(p.key))
    .map(p => ({ test: p.name, result: p.result }));

  return { matched, newFindings, notRepeated, gradedLines };
}

// Render the matched + new rows back into the editable pipe format the docx
// renderer (parseComparisonRows) and the preview textarea consume.
function comparisonToText(matched) {
  return matched.map(r => `${r.test} | ${r.baseline} | ${r.latest} | ${r.change} | ${r.interpretation}`).join('\n');
}
function findingsToText(rows) {
  return rows.map(r => `${r.test} | ${r.result} | ${r.interpretation || ''}`).join('\n');
}

/**
 * Full reassessment generation: extract findings from both sources, pair + grade
 * deterministically, then phrase the narrative. demographics = { age, sex }.
 */
async function generateReassessment(prevText, currText, demographics = {}) {
  const { age = null, sex = null } = demographics;

  const [prevBlock, currBlock] = await Promise.all([
    extractFindings(prevText, age, sex),
    extractFindings(currText, age, sex),
  ]);

  const { matched, newFindings, notRepeated, gradedLines } = pairFindings(prevBlock, currBlock, age, sex);

  // Narrative input: the graded comparison plus a note on what wasn't repeated.
  let narrativeInput = gradedLines.join('\n');
  if (notRepeated.length) {
    narrativeInput += `\n\nMeasured at baseline but not repeated this visit (do not claim progress on these): ${notRepeated.map(r => r.test).join(', ')}.`;
  }

  let progress = '', nextSteps = '', resultsSummary = '';
  if (matched.length || newFindings.length) {
    try {
      const out = await generateReassessmentNarrative(narrativeInput);
      progress = out.progress;
      nextSteps = out.nextSteps;
      resultsSummary = out.resultsSummary;
    } catch (err) {
      console.error('Reassessment narrative failed:', err.message);
    }
  }

  return {
    comparison: comparisonToText(matched),
    newFindings: findingsToText(newFindings),
    notRepeated, // structured — surfaced as a hint in the UI, not the patient doc
    progress,
    nextSteps,
    resultsSummary,
    counts: { matched: matched.length, new: newFindings.length, notRepeated: notRepeated.length },
  };
}

module.exports = { generateReassessment, pairFindings, parseRows };
