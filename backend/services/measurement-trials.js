/**
 * Aggregate multiple trials of a strength/functional test into a single stored
 * value. HHD and grip strength are noisy, so the clinician records 2–3 attempts and
 * we keep the aggregate (the raw trials live in the measurement's `detail` JSONB for
 * transparency). The aggregate is computed HERE on the server — never trusted from
 * the client. Pure + unit-testable. No patient values are logged.
 *
 * method: 'mean' (HHD, grip, hops — averages effort/examiner noise; rounded to 0.1)
 *         'max'  (SEBT, peak performance tests — best of N).
 */
function aggregateTrials(values, method = 'mean') {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  if (nums.length === 0) return null;
  if (method === 'max') return Math.max(...nums);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(mean * 10) / 10;
}

module.exports = { aggregateTrials };
