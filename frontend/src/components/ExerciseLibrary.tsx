import { useState } from 'react';
import { Search, Play, Clock } from 'lucide-react';
import type { ProgramExercise } from '../types/index.ts';
import { exercises } from '../data/exercises';

interface ExerciseLibraryProps {
  onAddToProgram: (exercises: ProgramExercise[]) => void;
}

export const ExerciseLibrary = ({ onAddToProgram }: ExerciseLibraryProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<number[]>([]);

  const toggleExercise = (exerciseId: number) => {
    if (selectedExercises.includes(exerciseId)) {
      setSelectedExercises(selectedExercises.filter(id => id !== exerciseId));
    } else {
      setSelectedExercises([...selectedExercises, exerciseId]);
    }
  };

  const handleAddToProgram = () => {
    if (selectedExercises.length === 0) return;

    const newExercises = exercises
      .filter(ex => selectedExercises.includes(ex.id))
      .map(ex => ({
        ...ex,
        sets: 3,
        reps: 10,
        completed: false
      }));

    onAddToProgram(newExercises);
    setSelectedExercises([]);
  };

  const filteredExercises = exercises.filter(exercise =>
    exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    exercise.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Selected Count */}
      {selectedExercises.length > 0 && (
        <div className="mb-6 bg-primary-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-900 font-medium">
            {selectedExercises.length} exercise{selectedExercises.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-8">
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search exercises..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>
          <button
            onClick={handleAddToProgram}
            disabled={selectedExercises.length === 0}
            className={`px-6 py-3 rounded-lg font-medium whitespace-nowrap ${
              selectedExercises.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-moveify-teal text-white hover:bg-moveify-teal-dark'
            }`}
          >
            Add to Program
          </button>
        </div>
      </div>

      {/* Exercise Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {filteredExercises.map(exercise => {
          const isSelected = selectedExercises.includes(exercise.id);
          return (
            <div
              key={exercise.id}
              onClick={() => toggleExercise(exercise.id)}
              className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden hover:shadow-md transition-all cursor-pointer ${
                isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-100'
              }`}
            >
              {/* Video Thumbnail */}
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 h-48 flex items-center justify-center relative">
                <Play className="text-white" size={56} />
                {isSelected && (
                  <div className="absolute top-3 left-3 bg-moveify-teal text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
                    ✓
                  </div>
                )}
                <span className="absolute top-3 right-3 bg-white/90 text-moveify-teal text-xs font-semibold px-3 py-1 rounded-full">
                  {exercise.difficulty}
                </span>
              </div>

              {/* Exercise Info */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-lg">{exercise.name}</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {exercise.category}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  {exercise.description}
                </p>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock size={16} />
                  <span>{exercise.duration}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* No Results */}
      {filteredExercises.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No exercises found matching "{searchTerm}"</p>
        </div>
      )}
    </>
  );
};
