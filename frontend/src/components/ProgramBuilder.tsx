import { useState, useEffect } from 'react';
import { Trash2, X, GripVertical, BarChart2, FolderOpen, Save } from 'lucide-react';
import type { ProgramExercise, Patient } from '../types/index.ts';
import { formatDuration, getExerciseType } from '../utils/duration.ts';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProgramBuilderProps {
  programExercises: ProgramExercise[];
  programName: string;
  selectedPatient: Patient | null;
  isEditing: boolean;
  onProgramNameChange: (name: string) => void;
  onRemoveExercise: (index: number) => void;
  onUpdateExercise: (index: number, field: 'sets' | 'reps' | 'weight' | 'duration' | 'rest' | 'instructions', value: number | string) => void;
  onReorderExercises: (newOrder: ProgramExercise[]) => void;
  onAssignToPatient: () => void;
  onCancelPatientAssignment: () => void;
  onConfigureBlock?: () => void;
  hasBlock?: boolean;
  onAddExercise?: (exercise: ProgramExercise) => void;
  onSaveAsTemplate?: () => void;
  onLoadTemplate?: () => void;
}

interface SortableExerciseProps {
  exercise: ProgramExercise;
  index: number;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: 'sets' | 'reps' | 'weight' | 'duration' | 'rest' | 'instructions', value: number | string) => void;
}

const SortableExercise = ({ exercise, index, onRemove, onUpdate }: SortableExerciseProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `exercise-${index}` });

  const exerciseType = getExerciseType(exercise);

  const [setsInput, setSetsInput] = useState<string>(String(exercise.sets));
  const [repsInput, setRepsInput] = useState<string>(String(exercise.reps));
  const [weightInputValue, setWeightInputValue] = useState<string>(
    String(exercise.prescribedWeight || '')
  );
  const [durationInput, setDurationInput] = useState<string>(
    exerciseType === 'cardio'
      ? String(exercise.prescribedDuration ? Math.round(exercise.prescribedDuration / 60) : '')
      : String(exercise.prescribedDuration || '')
  );
  const [restInput, setRestInput] = useState<string>(
    String(exercise.restDuration || '')
  );
  const [instructionsInput, setInstructionsInput] = useState<string>(
    exercise.instructions || ''
  );
  const [showNotes, setShowNotes] = useState(!!exercise.instructions);

  // Sync local state when exercise props change (e.g., template load, block data applied)
  useEffect(() => {
    setSetsInput(String(exercise.sets));
    setRepsInput(String(exercise.reps));
    setWeightInputValue(String(exercise.prescribedWeight || ''));
    setDurationInput(
      exerciseType === 'cardio'
        ? String(exercise.prescribedDuration ? Math.round(exercise.prescribedDuration / 60) : '')
        : String(exercise.prescribedDuration || '')
    );
    setRestInput(String(exercise.restDuration || ''));
    setInstructionsInput(exercise.instructions || '');
  }, [exercise.sets, exercise.reps, exercise.prescribedWeight, exercise.prescribedDuration, exercise.restDuration, exercise.instructions, exerciseType]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Duration display helper for the label
  const durationLabel = exerciseType === 'cardio' ? 'Min' : 'Sec';

  return (
    <div ref={setNodeRef} style={style} className="bg-white ring-1 ring-slate-200 p-4 rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex-shrink-0"
            aria-label="Drag to reorder"
          >
            <GripVertical size={18} />
          </button>
          <div className="min-w-0">
            <h3 className="font-medium text-slate-800 text-sm truncate">{exercise.name}</h3>
            {exerciseType !== 'reps' && (
              <span className="text-xs text-primary-500 font-medium">
                {exerciseType === 'duration' ? 'Timed' : 'Cardio'}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0 ml-2"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex gap-2 mb-2">
        {/* Sets — shown for all exercise types */}
        {(
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1">Sets</label>
            <input
              type="number"
              min="1"
              value={setsInput}
              onChange={(e) => {
                setSetsInput(e.target.value);
                const num = parseInt(e.target.value);
                if (!isNaN(num)) onUpdate(index, 'sets', num);
              }}
              onBlur={() => {
                const num = parseInt(setsInput);
                if (isNaN(num) || num < 1) {
                  setSetsInput(String(exercise.sets || 1));
                  onUpdate(index, 'sets', exercise.sets || 1);
                }
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 transition-all"
            />
          </div>
        )}

        {/* Reps — only for reps type */}
        {exerciseType === 'reps' && (
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1">Reps</label>
            <input
              type="number"
              min="1"
              value={repsInput}
              onChange={(e) => {
                setRepsInput(e.target.value);
                const num = parseInt(e.target.value);
                if (!isNaN(num)) onUpdate(index, 'reps', num);
              }}
              onBlur={() => {
                const num = parseInt(repsInput);
                if (isNaN(num) || num < 1) {
                  setRepsInput(String(exercise.reps || 1));
                  onUpdate(index, 'reps', exercise.reps || 1);
                }
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 transition-all"
            />
          </div>
        )}

        {/* Duration — shown for duration and cardio types */}
        {(exerciseType === 'duration' || exerciseType === 'cardio') && (
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1">{durationLabel}</label>
            <input
              type="number"
              min="1"
              value={durationInput}
              onChange={(e) => {
                setDurationInput(e.target.value);
                const num = parseInt(e.target.value);
                if (!isNaN(num)) {
                  // Cardio: input is minutes, store as seconds
                  const seconds = exerciseType === 'cardio' ? num * 60 : num;
                  onUpdate(index, 'duration', seconds);
                }
              }}
              onBlur={() => {
                const num = parseInt(durationInput);
                if (isNaN(num) || num < 1) {
                  setDurationInput('');
                  onUpdate(index, 'duration', 0);
                }
              }}
              placeholder={exerciseType === 'cardio' ? '20' : '30'}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 transition-all"
            />
          </div>
        )}

        {/* Weight — only for reps type */}
        {exerciseType === 'reps' && (
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1">kg</label>
            <input
              type="text"
              inputMode="decimal"
              value={weightInputValue}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setWeightInputValue(value);
                  const numValue = parseFloat(value);
                  onUpdate(index, 'weight', isNaN(numValue) ? 0 : numValue);
                }
              }}
              onBlur={() => {
                const numValue = parseFloat(weightInputValue);
                if (isNaN(numValue) || weightInputValue === '') {
                  setWeightInputValue('0');
                  onUpdate(index, 'weight', 0);
                } else {
                  setWeightInputValue(String(numValue));
                }
              }}
              placeholder="0"
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 transition-all"
            />
          </div>
        )}

        {/* Rest — shown for all exercise types */}
        {(
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1">Rest</label>
            <input
              type="number"
              min="0"
              value={restInput}
              onChange={(e) => {
                setRestInput(e.target.value);
                const num = parseInt(e.target.value);
                onUpdate(index, 'rest', isNaN(num) ? 0 : num);
              }}
              onBlur={() => {
                const num = parseInt(restInput);
                if (isNaN(num) || restInput === '') {
                  setRestInput('');
                  onUpdate(index, 'rest', 0);
                }
              }}
              placeholder="60"
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 transition-all"
            />
          </div>
        )}
      </div>

      {/* Prescription summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {(exerciseType === 'cardio' || exerciseType === 'duration') && exercise.prescribedDuration
            ? `${exercise.sets} × ${formatDuration(exercise.prescribedDuration)}`
            : null}
          {exercise.restDuration
            ? ` · ${formatDuration(exercise.restDuration)} rest`
            : null}
        </p>
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="text-xs text-primary-400 hover:text-primary-600 transition-colors"
        >
          {showNotes ? 'Hide notes' : '+ Notes'}
        </button>
      </div>

      {/* Instructions/Notes */}
      {showNotes && (
        <div className="mt-2">
          <textarea
            value={instructionsInput}
            onChange={(e) => {
              setInstructionsInput(e.target.value);
              onUpdate(index, 'instructions', e.target.value);
            }}
            rows={2}
            placeholder="Notes for patient (e.g., Focus on keeping hips level)"
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-xs text-slate-700 transition-all resize-none"
          />
        </div>
      )}
    </div>
  );
};

export const ProgramBuilder = ({
  programExercises,
  programName,
  selectedPatient,
  isEditing,
  onProgramNameChange,
  onRemoveExercise,
  onUpdateExercise,
  onReorderExercises,
  onAssignToPatient,
  onCancelPatientAssignment,
  onConfigureBlock,
  hasBlock = false,
  onAddExercise,
  onSaveAsTemplate,
  onLoadTemplate
}: ProgramBuilderProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = parseInt((active.id as string).split('-')[1]);
      const newIndex = parseInt((over.id as string).split('-')[1]);

      const newOrder = arrayMove(programExercises, oldIndex, newIndex);
      onReorderExercises(newOrder);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold font-display text-secondary-500 tracking-tight">Program Builder</h2>
        <p className="text-xs text-slate-400 mt-0.5">{programExercises.length} exercise{programExercises.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Patient Banner */}
      {selectedPatient && (
        <div className="px-5 py-2.5 bg-primary-50 border-b border-primary-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">For:</span>
            <span className="text-sm font-medium text-secondary-500">{selectedPatient.name}</span>
          </div>
          <button
            onClick={onCancelPatientAssignment}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            title="Cancel program assignment"
          >
            <X size={13} />
            Cancel
          </button>
        </div>
      )}

      {/* Program Name Input */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          Program Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={programName}
          onChange={(e) => onProgramNameChange(e.target.value)}
          placeholder="e.g., Knee Rehabilitation Week 1"
          className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 placeholder:text-slate-400 bg-white transition-all"
        />
        {programExercises.length > 0 && !programName.trim() && (
          <p className="text-xs text-red-500 mt-1.5">Required to assign</p>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto p-5 transition-colors ${isDragOver ? 'bg-primary-50 ring-2 ring-inset ring-dashed ring-primary-300' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/exercise')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOver(true);
          }
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const data = e.dataTransfer.getData('application/exercise');
          if (data && onAddExercise) {
            try {
              const exercise = JSON.parse(data) as ProgramExercise;
              onAddExercise(exercise);
            } catch {
              // ignore invalid data
            }
          }
        }}
      >
        {programExercises.length === 0 ? (
          <div className="text-center mt-12">
            <p className="text-slate-400 text-sm">No exercises added yet</p>
            <p className="text-slate-300 text-xs mt-1">Drag exercises here or click + to add</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={programExercises.map((_, index) => `exercise-${index}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2.5">
                {programExercises.map((exercise, index) => (
                  <SortableExercise
                    key={`exercise-${index}`}
                    exercise={exercise}
                    index={index}
                    onRemove={onRemoveExercise}
                    onUpdate={onUpdateExercise}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="p-5 border-t border-slate-100 space-y-2.5">
        {/* Template buttons — always visible */}
        <div className="flex gap-2">
          {onLoadTemplate && (
            <button
              onClick={onLoadTemplate}
              className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <FolderOpen size={15} />
              Load Template
            </button>
          )}
          {onSaveAsTemplate && programExercises.length > 0 && (
            <button
              onClick={onSaveAsTemplate}
              className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Save size={15} />
              Save as Template
            </button>
          )}
        </div>

        {programExercises.length > 0 && (
          <>
            {onConfigureBlock && (
              <button
                onClick={onConfigureBlock}
                className="w-full flex items-center justify-center gap-2 border border-primary-300 text-primary-500 hover:bg-primary-50 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <BarChart2 size={15} />
                {hasBlock ? 'Edit Periodization Block' : 'Configure Block (optional)'}
              </button>
            )}
            <button
              onClick={onAssignToPatient}
              disabled={!programName.trim()}
              className="w-full bg-primary-400 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium disabled:bg-slate-300 disabled:cursor-not-allowed text-sm transition-colors shadow-sm"
            >
              {!programName.trim()
                ? 'Enter name to assign'
                : isEditing
                  ? 'Update Program'
                  : 'Assign to Patient'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
