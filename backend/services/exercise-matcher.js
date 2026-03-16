// Fuzzy exercise name matching — maps AI-suggested names to the real exercise library

/**
 * Synonyms map for normalizing exercise names
 */
const SYNONYMS = {
  'db': 'dumbbells',
  'dbs': 'dumbbells',
  'dumbbell': 'dumbbells',
  'bb': 'barbell',
  'kb': 'kettlebell',
  'band': 'resistance band',
  'bands': 'resistance band',
  'bw': 'bodyweight',
  'bodyweight': 'bodyweight',
  'body weight': 'bodyweight',
  'cable rope': 'cable rope',
  'cable bar': 'cable bar',
  'cable handle': 'cable handle',
  'sl': 'single leg',
  'rdl': 'romanian deadlift',
  'sldl': 'single leg deadlift',
  'press': 'press',
  'pushup': 'push up',
  'pushups': 'push up',
  'push-up': 'push up',
  'pull-up': 'pull up',
  'pullup': 'pull up',
};

/**
 * Normalize an exercise name for comparison
 */
function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  // Remove articles and extra whitespace
  n = n.replace(/\b(the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
  // Apply synonyms
  for (const [from, to] of Object.entries(SYNONYMS)) {
    // Word boundary replacement
    const regex = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    n = n.replace(regex, to);
  }
  return n.trim();
}

/**
 * Tokenize a name into significant words
 */
function tokenize(name) {
  return normalize(name)
    .split(/\s+/)
    .filter(w => w.length > 1 && !['with', 'and', 'on', 'to', 'the', 'a'].includes(w));
}

/**
 * Calculate token overlap score between two names (0-1)
 */
function tokenScore(nameA, nameB) {
  const tokensA = tokenize(nameA);
  const tokensB = tokenize(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  let matches = 0;
  for (const t of tokensA) {
    if (tokensB.includes(t)) matches++;
  }
  // Jaccard-like: intersection / union
  const union = new Set([...tokensA, ...tokensB]).size;
  return matches / union;
}

/**
 * Match a single AI-suggested exercise name against the library
 * @param {string} suggestedName - Name from AI response
 * @param {Array} exercises - Exercise library array
 * @returns {{ matchedExercise: object|null, confidence: 'exact'|'fuzzy'|'none', score: number }}
 */
function matchExercise(suggestedName, exercises) {
  if (!suggestedName || !exercises || exercises.length === 0) {
    return { matchedExercise: null, confidence: 'none', score: 0 };
  }

  const normalizedSuggested = normalize(suggestedName);

  // 1. Exact match (case-insensitive)
  const exact = exercises.find(e => e.name.toLowerCase() === suggestedName.toLowerCase());
  if (exact) {
    return { matchedExercise: exact, confidence: 'exact', score: 1.0 };
  }

  // 2. Normalized exact match
  const normalizedExact = exercises.find(e => normalize(e.name) === normalizedSuggested);
  if (normalizedExact) {
    return { matchedExercise: normalizedExact, confidence: 'exact', score: 0.95 };
  }

  // 3. Token-based fuzzy matching
  let bestMatch = null;
  let bestScore = 0;

  for (const exercise of exercises) {
    const score = tokenScore(suggestedName, exercise.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = exercise;
    }
  }

  if (bestScore >= 0.6) {
    return { matchedExercise: bestMatch, confidence: 'fuzzy', score: bestScore };
  }

  // 4. Partial match — check if the suggested name contains the core movement
  const suggestedTokens = tokenize(suggestedName);
  for (const exercise of exercises) {
    const exerciseTokens = tokenize(exercise.name);
    // Check if all core movement tokens from the exercise appear in the suggestion
    const movementTokens = exerciseTokens.filter(t =>
      !['bodyweight', 'dumbbells', 'dumbbell', 'barbell', 'machine', 'cable', 'handle', 'rope', 'bar', 'support', 'resistance', 'band'].includes(t)
    );
    if (movementTokens.length > 0) {
      const movementMatches = movementTokens.filter(t => suggestedTokens.includes(t)).length;
      const movementScore = movementMatches / movementTokens.length;
      if (movementScore >= 0.8 && movementScore > bestScore) {
        bestScore = movementScore * 0.55; // Discount for partial match
        bestMatch = exercise;
      }
    }
  }

  if (bestMatch && bestScore >= 0.4) {
    return { matchedExercise: bestMatch, confidence: 'fuzzy', score: bestScore };
  }

  return { matchedExercise: null, confidence: 'none', score: 0 };
}

/**
 * Match multiple AI-suggested exercises against the library
 * @param {Array} suggestedExercises - Array of { name, sets, reps, ... } from AI
 * @param {Array} exerciseLibrary - Exercise library array
 * @returns {Array} - Each item has original suggestion + match result
 */
function matchExercises(suggestedExercises, exerciseLibrary) {
  return suggestedExercises.map(suggested => {
    const result = matchExercise(suggested.name, exerciseLibrary);
    return {
      suggested,
      ...result,
    };
  });
}

module.exports = { matchExercise, matchExercises, normalize, tokenize, tokenScore };
