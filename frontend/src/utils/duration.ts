import type { ExerciseType } from '../types/index.ts';
import { exercises as defaultExercises } from '../data/exercises.ts';

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min} min`;
}

// Lookup map from exercise name to exerciseType (built-in exercises only)
const exerciseTypeMap = new Map<string, ExerciseType>();
for (const ex of defaultExercises) {
  if (ex.exerciseType) {
    exerciseTypeMap.set(ex.name.toLowerCase(), ex.exerciseType);
  }
}

/**
 * Resolve the exercise type for an exercise.
 * Checks the exercise object first, then falls back to the built-in exercise library.
 */
export function getExerciseType(exercise: { name: string; exerciseType?: ExerciseType }): ExerciseType {
  return exercise.exerciseType || exerciseTypeMap.get(exercise.name.toLowerCase()) || 'reps';
}
