// Core data types for the Moveify App

export type Exercise = {
  id: number;
  name: string;
  category: string;
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
}

export type CompletionData = {
  setsPerformed?: number;
  repsPerformed?: number;
  weightPerformed?: number;
  rpeRating?: number;
  painLevel?: number;
  notes?: string;
}

export type ProgramExercise = Exercise & {
  sets: number;
  reps: number;
  prescribedWeight?: number;
  completed: boolean;
  holdTime?: string;
  instructions?: string;
  completionData?: CompletionData;
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
  blockType?: 'introductory' | 'standard';
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

// Periodization types
export type BlockType = 'introductory' | 'standard';

export type PeriodizationCycle = {
  id: number;
  programId: number;
  blockType: BlockType;
  blockNumber: number;
  blockStartDate: string;
  currentWeek: number;
  totalWeeks: number;
  intensityMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

export type ProgressionLogEntry = {
  id: number;
  exerciseId: number;
  programId: number;
  previousSets?: number;
  previousReps?: number;
  newSets: number;
  newReps: number;
  adjustmentReason: string;
  avgRpe?: number;
  avgPain?: number;
  completionRate?: number;
  weekInCycle?: number;
  adjustedAt: string;
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
