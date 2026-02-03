import { Trash2, X, GripVertical } from 'lucide-react';
import type { ProgramExercise, Patient } from '../types/index.ts';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-gray-50 p-4 rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            aria-label="Drag to reorder"
          >
            <GripVertical size={20} />
          </button>
          <h3 className="font-semibold text-gray-900">{exercise.name}</h3>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 size={20} />
        </button>
      </div>

      <div className="flex gap-3 mb-2">
        <div className="flex-1">
          <label className="text-xs text-gray-600 block mb-1">Sets</label>
          <input
            type="number"
            min="1"
            value={exercise.sets}
            onChange={(e) => onUpdate(index, 'sets', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-600 block mb-1">Reps</label>
          <input
            type="number"
            min="1"
            value={exercise.reps}
            onChange={(e) => onUpdate(index, 'reps', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-600 block mb-1">Weight (kg)</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={exercise.prescribedWeight || 0}
            onChange={(e) => onUpdate(index, 'weight', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            placeholder="0"
          />
        </div>
      </div>

      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded inline-block">
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
  onCancelPatientAssignment
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
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Program Tab</h2>
      </div>

        {/* Patient Banner */}
        {selectedPatient && (
          <div className="px-6 py-3 bg-primary-50 border-b border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Patient:</span>
              <span className="text-sm font-semibold text-blue-900">{selectedPatient.name}</span>
            </div>
            <button
              onClick={onCancelPatientAssignment}
              className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
              title="Cancel program assignment"
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        )}

      {/* Program Name Input */}
      <div className="p-6 border-b border-gray-200 bg-primary-50">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Program Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={programName}
          onChange={(e) => onProgramNameChange(e.target.value)}
          placeholder="e.g., Knee Rehabilitation Week 1"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
        />
        {programExercises.length > 0 && !programName.trim() && (
          <p className="text-sm text-red-600 mt-1">Program name is required to assign</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {programExercises.length === 0 ? (
          <p className="text-gray-500 text-center mt-8">No exercises added yet</p>
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
              <div className="space-y-3">
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
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onAssignToPatient}
            disabled={!programName.trim()}
            className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {!programName.trim()
              ? 'Enter Program Name to Assign'
              : isEditing
                ? 'Update and Assign'
                : 'Assign to Patient'}
          </button>
        </div>
      )}
    </div>
  );
};
