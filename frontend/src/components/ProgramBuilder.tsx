import { useState } from 'react';
import { Trash2, X, GripVertical, BarChart2 } from 'lucide-react';
import type { ProgramExercise, Patient } from '../types/index.ts';
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
  onUpdateExercise: (index: number, field: 'sets' | 'reps' | 'weight', value: number) => void;
  onReorderExercises: (newOrder: ProgramExercise[]) => void;
  onAssignToPatient: () => void;
  onCancelPatientAssignment: () => void;
  onConfigureBlock?: () => void;
  hasBlock?: boolean;
}

interface SortableExerciseProps {
  exercise: ProgramExercise;
  index: number;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: 'sets' | 'reps' | 'weight', value: number) => void;
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

  const [weightInputValue, setWeightInputValue] = useState<string>(
    String(exercise.prescribedWeight || '')
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
          <h3 className="font-medium text-slate-800 text-sm truncate">{exercise.name}</h3>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0 ml-2"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-xs text-slate-400 block mb-1">Sets</label>
          <input
            type="number"
            min="1"
            value={exercise.sets}
            onChange={(e) => onUpdate(index, 'sets', parseInt(e.target.value) || 0)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 transition-all"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-slate-400 block mb-1">Reps</label>
          <input
            type="number"
            min="1"
            value={exercise.reps}
            onChange={(e) => onUpdate(index, 'reps', parseInt(e.target.value) || 0)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm text-slate-800 transition-all"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-slate-400 block mb-1">kg</label>
          <input
            type="text"
            inputMode="decimal"
            value={weightInputValue}
            onChange={(e) => {
              const value = e.target.value;
              // Allow empty string, numbers, and decimal point
              if (value === '' || /^\d*\.?\d*$/.test(value)) {
                setWeightInputValue(value);
                const numValue = parseFloat(value);
                onUpdate(index, 'weight', isNaN(numValue) ? 0 : numValue);
              }
            }}
            onBlur={() => {
              // Format on blur to ensure valid number
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
      </div>

      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded inline-block mt-1.5">
        {exercise.category}
      </span>
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
  hasBlock = false
}: ProgramBuilderProps) => {
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

      <div className="flex-1 overflow-y-auto p-5">
        {programExercises.length === 0 ? (
          <div className="text-center mt-12">
            <p className="text-slate-400 text-sm">No exercises added yet</p>
            <p className="text-slate-300 text-xs mt-1">Select exercises from the library</p>
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

      {programExercises.length > 0 && (
        <div className="p-5 border-t border-slate-100 space-y-2.5">
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
        </div>
      )}
    </div>
  );
};
