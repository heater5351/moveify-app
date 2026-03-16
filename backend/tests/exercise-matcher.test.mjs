import { describe, it, expect } from 'vitest';
import { matchExercise, matchExercises, normalize, tokenScore } from '../services/exercise-matcher.js';

const LIBRARY = [
  { name: 'Squat with Bodyweight', exerciseType: 'reps', equipment: 'Bodyweight', jointArea: 'Hip, Knee', muscleGroup: 'Quadriceps, Glutes' },
  { name: 'Back Squat with Barbell', exerciseType: 'reps', equipment: 'Barbell', jointArea: 'Hip, Knee', muscleGroup: 'Quadriceps, Glutes' },
  { name: 'Romanian Deadlift with Barbell', exerciseType: 'reps', equipment: 'Barbell', jointArea: 'Hip, Knee', muscleGroup: 'Hamstrings, Glutes' },
  { name: 'Calf Raise with Bodyweight', exerciseType: 'reps', equipment: 'Bodyweight', jointArea: 'Ankle', muscleGroup: 'Calves' },
  { name: 'Walking', exerciseType: 'cardio', equipment: null, jointArea: null, muscleGroup: null },
  { name: 'Wall Sit with Bodyweight', exerciseType: 'duration', equipment: 'Bodyweight', jointArea: 'Knee', muscleGroup: 'Quadriceps' },
];

describe('normalize', () => {
  it('lowercases and strips articles', () => {
    expect(normalize('The Squat with Bodyweight')).toBe('squat with bodyweight');
  });

  it('applies synonyms', () => {
    expect(normalize('Squat with DB')).toBe('squat with dumbbells');
    expect(normalize('RDL with BB')).toBe('romanian deadlift with barbell');
  });
});

describe('matchExercise', () => {
  it('finds exact match (case-insensitive)', () => {
    const result = matchExercise('squat with bodyweight', LIBRARY);
    expect(result.confidence).toBe('exact');
    expect(result.matchedExercise?.name).toBe('Squat with Bodyweight');
  });

  it('finds normalized match via synonyms', () => {
    const result = matchExercise('Squat with BW', LIBRARY);
    expect(result.confidence).toBe('exact');
    expect(result.matchedExercise?.name).toBe('Squat with Bodyweight');
  });

  it('finds fuzzy match', () => {
    const result = matchExercise('Bodyweight Squat', LIBRARY);
    expect(result.confidence).not.toBe('none');
    expect(result.matchedExercise?.name).toBe('Squat with Bodyweight');
  });

  it('returns none for completely unknown exercise', () => {
    const result = matchExercise('Underwater Basket Weaving', LIBRARY);
    expect(result.confidence).toBe('none');
    expect(result.matchedExercise).toBeNull();
  });

  it('handles empty input', () => {
    const result = matchExercise('', LIBRARY);
    expect(result.confidence).toBe('none');
  });

  it('handles empty library', () => {
    const result = matchExercise('Squat', []);
    expect(result.confidence).toBe('none');
  });
});

describe('matchExercises', () => {
  it('matches multiple exercises', () => {
    const suggested = [
      { name: 'Squat with Bodyweight', sets: 3, reps: 12 },
      { name: 'Romanian Deadlift with Barbell', sets: 3, reps: 10 },
      { name: 'Unknown Exercise', sets: 2, reps: 8 },
    ];
    const results = matchExercises(suggested, LIBRARY);
    expect(results).toHaveLength(3);
    expect(results[0].confidence).toBe('exact');
    expect(results[1].confidence).toBe('exact');
    expect(results[2].confidence).toBe('none');
  });
});
