// Core data types for the Moveify App

export type Exercise = {
  id: number;
  name: string;
  category: string;
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  videoUrl?: string; // YouTube embed URL
  // Filter metadata (optional, for custom exercises)
  jointArea?: string; // Comma-separated values (e.g., "Knee, Hip")
  muscleGroup?: string; // Comma-separated values (e.g., "Quadriceps, Glutes")
  movementType?: string; // Comma-separated values (e.g., "Flexion, Extension")
  equipment?: string; // e.g., "Bodyweight", "Dumbbell"
  position?: string; // e.g., "Standing", "Seated"
  // Computed fields (frontend only)
  isFavorited?: boolean;
  isCustom?: boolean;
}

export type ExerciseFavorite = {
  exerciseId: number;
  exerciseType: 'custom' | 'default';
  createdAt: string;
}

export type ExerciseFilters = {
  category?: string;
  jointArea?: string;
  muscleGroup?: string;
  movementType?: string;
  equipment?: string;
  position?: string;
  difficulty?: string;
  showFavoritesOnly?: boolean;
}

export type CompletionData = {
  setsPerformed?: number;
  repsPerformed?: number;
  weightPerformed?: number;
  rpeRating?: number;
  painLevel?: number;
  notes?: string;
  completionDate?: string; // ISO date string for the scheduled completion date
}

export type ProgramExercise = Exercise & {
  sets: number;
  reps: number;
  prescribedWeight?: number;
  completed: boolean;
  holdTime?: string;
  instructions?: string;
  completionData?: CompletionData | null;
  allCompletions?: { [date: string]: CompletionData }; // All completions by date (YYYY-MM-DD)
}

export type ProgramConfig = {
  id?: number;
  name?: string;
  startDate: 'today' | 'tomorrow' | 'nextweek' | 'custom';
  customStartDate: string;
  frequency: string[];
  duration: '1week' | '2weeks' | '4weeks' | '6weeks' | 'ongoing' | 'custom' | 'completed';
  customEndDate: string;
  trackActualPerformance?: boolean;
  trackRpe?: boolean;
  trackPainLevel?: boolean;
}

export type AssignedProgram = {
  id?: number;
  config: ProgramConfig;
  exercises: ProgramExercise[];
}

export type Patient = {
  id: number;
  name: string;
  dob: string;
  age: number;
  condition: string;
  email: string;
  phone: string;
  address: string;
  dateAdded: string;
  assignedPrograms: AssignedProgram[];
}

export type NewPatient = {
  name: string;
  dob: string;
  condition: string;
  email: string;
  phone: string;
  address: string;
}

export type UserRole = 'clinician' | 'patient' | '';

export type User = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

// Block-based periodization types
export type BlockSchedule = {
  id: number;
  programId: number;
  blockDuration: 4 | 6 | 8;
  startDate: string;
  currentWeek: number;
  status: 'active' | 'completed' | 'paused';
  lastEvaluatedAt: string | null;
}

export type ExerciseWeekPrescription = {
  programExerciseId: number;
  weekNumber: number;
  sets: number;
  reps: number;
  rpeTarget?: number | null;
  weight?: number | null;
  notes?: string | null;
}

export type PeriodizationTemplate = {
  id: number;
  name: string;
  description: string | null;
  blockDuration: 4 | 6 | 8;
  createdBy: number;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TemplateWeek = {
  id: number;
  templateId: number;
  exerciseSlot: number;
  weekNumber: number;
  sets: number;
  reps: number;
  rpeTarget?: number | null;
  notes?: string | null;
}

export type ClinicianFlag = {
  id: number;
  programId: number;
  patientId: number;
  flagType: 'pain_flare' | 'performance_hold' | 'block_complete';
  flagReason: string;
  flagDate: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: number | null;
  createdAt: string;
  // Joined fields
  patientName?: string;
  programName?: string;
}

// Daily check-in types
export type DailyCheckIn = {
  id: number;
  patientId: number;
  checkInDate: string;
  overallFeeling: number; // 1-5
  generalPainLevel: number; // 0-10
  energyLevel: number; // 1-5
  sleepQuality: number; // 1-5
  notes?: string;
  createdAt: string;
}

export type NewCheckIn = Omit<DailyCheckIn, 'id' | 'createdAt'>;

export type CheckInWarning = {
  type: 'low_energy' | 'high_pain' | 'poor_recovery';
  message: string;
  suggestion: string;
}

export type EducationModule = {
  id: number;
  title: string;
  description: string | null;
  content: string;
  category: string | null;
  estimatedDurationMinutes: number | null;
  imageUrl: string | null;
  videoUrl: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export type PatientEducationModule = EducationModule & {
  assignmentId: number;
  assignedDate: string;
  viewed: boolean;
  viewedAt: string | null;
}
