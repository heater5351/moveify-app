// Core data types for the Moveify App

export type ExerciseType = 'reps' | 'duration' | 'cardio';

export type Exercise = {
  id: number;
  name: string;
  category: string;
  duration: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  videoUrl?: string; // YouTube embed URL
  exerciseType?: ExerciseType; // 'reps' (default), 'duration' (timed holds), 'cardio' (duration only)
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
  showFavoritesOnly?: boolean;
}

export type CompletionData = {
  setsPerformed?: number;
  repsPerformed?: number;
  weightPerformed?: number;
  durationPerformed?: number; // seconds
  rpeRating?: number;
  painLevel?: number;
  notes?: string;
  completionDate?: string; // ISO date string for the scheduled completion date
}

export type ProgramExercise = Exercise & {
  /** Server program_exercises row id — set when loaded from an existing program.
   *  Distinct from `id`, which is the library exercise id for newly added
   *  exercises and must NOT be sent as a row id on update (collision risk). */
  programExerciseId?: number;
  sets: number;
  reps: number;
  prescribedWeight?: number;
  prescribedDuration?: number; // seconds
  restDuration?: number; // seconds
  completed: boolean;
  holdTime?: string;
  instructions?: string;
  image?: string; // image URL from backend (alias for imageUrl in program context)
  enablePeriodization?: boolean;
  isWarmup?: boolean;
  completionData?: CompletionData | null;
  allCompletions?: { [date: string]: CompletionData }; // All completions by date (YYYY-MM-DD)
}

export type ProgramConfig = {
  id?: number;
  name?: string;
  startDate: 'today' | 'tomorrow' | 'nextweek' | 'custom' | string;
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
  sex?: string;
  age: number;
  email: string;
  phone: string;
  address: string;
  dateAdded: string;
  pendingSetup?: boolean;
  clinikoPatientId?: string | null;
  clinikoSyncedAt?: string | null;
  // PMS-style enrichment (all optional; '' clears, omitted preserves on save)
  title?: string;
  preferredName?: string;
  pronouns?: string;
  occupation?: string;
  /** @deprecated Moved to the shared contacts directory (see PatientContactLink). No longer populated. */
  emergencyContactName?: string;
  /** @deprecated Moved to the shared contacts directory. No longer populated. */
  emergencyContactRelationship?: string;
  /** @deprecated Moved to the shared contacts directory. No longer populated. */
  emergencyContactPhone?: string;
  referralSource?: string;
  /** @deprecated Moved to the shared contacts directory (report-recipient GP). No longer populated. */
  referringGp?: string;
  medicareNumber?: string;
  privateHealthFund?: string;
  privateHealthMemberNumber?: string;
  dvaNumber?: string;
  assignedPrograms: AssignedProgram[];
}

// A file attached to a patient record (PMS Files section). Metadata only —
// the bytes are streamed from GCS via the authenticated download endpoint.
export type PatientFile = {
  id: number;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  category: string | null;
  description: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

// Shared contacts directory (PMS-style referrers/relationships). A clinic-wide,
// reusable contact (GP, specialist, NDIS support coordinator, parent/guardian…)
// linked many-to-many to patients via PatientContactLink.
export type ContactType = 'gp' | 'specialist' | 'support_coordinator' | 'guardian' | 'other';

export type Contact = {
  id: number;
  contactType: ContactType;
  title: string;
  name: string;
  organisation: string;
  specialty: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  /** Number of patients linked to this contact (directory list view only). */
  patientCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

// A patient's link to a directory contact, with per-patient context. The
// report-recipient GP auto-fills the GP reassessment letter's recipient block.
export type PatientContactLink = {
  linkId: number;
  relationship: string;
  isReportRecipient: boolean;
  isEmergency: boolean;
  contact: Contact;
};

export type NewPatient = {
  name: string;
  dob: string;
  email: string;
  phone: string;
  address: string;
}

export type UserRole = 'clinician' | 'patient' | '';

export type User = {
  id: number;
  email: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  isAdmin?: boolean;
  defaultLocationId?: number | null;
  locationName?: string | null;
}

export type Location = {
  id: number;
  name: string;
  address: string | null;
  created_at: string;
}

export type Clinician = {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  isAdmin?: boolean;
  default_location_id: number | null;
  defaultLocationId?: number | null;
  location_name: string | null;
  locationName?: string | null;
  created_at: string;
  createdAt?: string;
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
  duration?: number | null;
  restDuration?: number | null;
}

export type PeriodizationTemplate = {
  id: number;
  name: string;
  description: string | null;
  blockDuration: 4 | 6 | 8;
  weightUnit?: 'kg' | 'percent' | null;
  createdBy: number;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TemplateWeek = {
  id: number;
  templateId: number;
  weekNumber: number;
  sets: number;
  reps: number;
  rpeTarget?: number | null;
  weightOffset?: number | null;
  notes?: string | null;
  duration?: number | null;
  restDuration?: number | null;
}

// Convenience type for template with weeks loaded
export type TemplateWithWeeks = PeriodizationTemplate & {
  weeks: TemplateWeek[];
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

export type ProgramTemplate = {
  id: number;
  name: string;
  description: string | null;
  exercise_count?: number;
  created_at: string;
};

export type BlockStatusResponse = {
  hasBlock: boolean;
  id?: number;
  programId?: number;
  blockDuration?: number;
  startDate?: string;
  currentWeek?: number;
  status?: 'active' | 'completed' | 'paused';
  weeks?: BlockWeekRow[];
}

export type DataRequest = {
  id: number;
  user_id: number;
  request_type: 'export' | 'deletion';
  status: 'pending' | 'approved' | 'completed' | 'denied';
  admin_notes: string | null;
  processed_by: number | null;
  requested_at: string;
  processed_at: string | null;
  patient_name?: string;
  patient_email?: string;
}

// Daily Activity view types (clinician per-day drill-down)
export type ExerciseCompletion = {
  id: number;
  exerciseName: string;
  completionDate: string;
  setsPerformed: number;
  repsPerformed: number;
  weightPerformed: number | null;
  durationPerformed: number | null;
  prescribedSets: number;
  prescribedReps: number;
  prescribedWeight: number | null;
  prescribedDuration: number | null;
  rpeRating: number | null;
  painLevel: number | null;
  notes: string | null;
}

export type BlockWeekRow = {
  programExerciseId: number;
  exerciseName: string;
  weekNumber: number;
  sets: number;
  reps: number;
  rpeTarget?: number | null;
  weight?: number | null;
  notes?: string | null;
  duration?: number | null;
  restDuration?: number | null;
}

// Scribe types
export type Suggestion = {
  text: string;
  phase: 'subjective' | 'objective' | 'planning';
  refs: { title: string; url: string }[];
}

export type PromptVersion = {
  id: number;
  discipline: string;
  createdAt: string;
  systemPrompt?: string;
}

export type SoapTemplate = {
  id: number;
  name: string;
  discipline: string;
  systemPrompt: string;
  isDefault: boolean;
}

export type HandoutSections = {
  whatsGoingOn: string;
  ourAims: string;
  howWeGetThere: string;
  whatToExpect: string;
  clinicalContext?: string;
  resultsSummary?: string;
}

// Whether age/sex norm grounding was applied. When age/sex is missing the
// assessment table falls back to neutral baselines instead of graded results.
export type HandoutGrounding = {
  missingSex: boolean;
  missingAge: boolean;
  hasFindings: boolean;
}

// Reassessment summary: baseline vs latest comparison + progress narrative.
export type ReassessmentData = {
  comparison: string;    // "Test | Baseline | Latest | Change | What it means" lines (matched + pain)
  newFindings: string;   // "Test | Result | Interpretation" lines (measured this visit only)
  notRepeated: { test: string; result: string }[]; // measured at baseline only
  goals: { goal: string; status: string; basis: string }[]; // baseline goals + progress status
  subjectiveContext: string; // goals/pain/issues context, resent on "rewrite from results"
  // Patient-facing narrative (audience 'patient')
  progress: string;      // bullets
  nextSteps: string;     // bullets
  resultsSummary: string;
  // GP-facing narrative (audience 'gp')
  executiveSummary?: string;
  clinicalInterpretation?: string;
  recommendations?: string;
  // Recipient details extracted from an uploaded previous report (GP variant) —
  // pre-fills the letter's "Addressed to" block.
  meta?: { gpName?: string; practiceName?: string; practiceAddress?: string; practiceEmail?: string; patientName?: string; dob?: string };
  counts: { matched: number; new: number; notRepeated: number; pain: number; goals: number };
  grounding?: HandoutGrounding;
}

export type ReportSections = {
  executiveSummary: string;
  objectiveAssessment: string;
  goals: string;
  managementPlan: string;
}
