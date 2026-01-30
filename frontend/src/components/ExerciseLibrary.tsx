import { useState, useEffect } from 'react';
import { Search, Play, Plus, Trash2 } from 'lucide-react';
import type { ProgramExercise, Exercise } from '../types/index.ts';
import { exercises as defaultExercises } from '../data/exercises';
import { AddExerciseModal } from './modals/AddExerciseModal';
import { API_URL } from '../config';

interface ExerciseLibraryProps {
  onAddToProgram: (exercises: ProgramExercise[]) => void;
  clinicianId?: number;
}

export const ExerciseLibrary = ({ onAddToProgram, clinicianId }: ExerciseLibraryProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<number[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Fetch custom exercises for this clinician
  useEffect(() => {
    if (clinicianId) {
      fetchCustomExercises();
    }
  }, [clinicianId]);

  const fetchCustomExercises = async () => {
    if (!clinicianId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/exercises/clinician/${clinicianId}`);
      if (response.ok) {
        const data = await response.json();
        // Map database fields to Exercise type
        const mapped = data.map((ex: { id: number; name: string; category: string; duration: string; difficulty: string; description: string; video_url?: string }) => ({
          id: ex.id + 10000, // Offset to avoid ID collision with default exercises
          dbId: ex.id, // Store original DB ID for deletion
          name: ex.name,
          category: ex.category,
          duration: ex.duration,
          difficulty: ex.difficulty,
          description: ex.description,
          videoUrl: ex.video_url,
          isCustom: true
        }));
        setCustomExercises(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch custom exercises:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: number, dbId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card selection when clicking delete

    if (!confirm('Are you sure you want to delete this exercise? This cannot be undone.')) {
      return;
    }

    setDeletingId(exerciseId);
    try {
      const response = await fetch(`${API_URL}/exercises/${dbId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicianId })
      });

      if (response.ok) {
        // Remove from custom exercises list
        setCustomExercises(customExercises.filter(ex => ex.id !== exerciseId));
        // Remove from selected if it was selected
        setSelectedExercises(selectedExercises.filter(id => id !== exerciseId));
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete exercise');
      }
    } catch (error) {
      console.error('Delete exercise error:', error);
      alert('Failed to delete exercise');
    } finally {
      setDeletingId(null);
    }
  };

  // Combine default and custom exercises
  const allExercises = [...defaultExercises, ...customExercises];

  const toggleExercise = (exerciseId: number) => {
    if (selectedExercises.includes(exerciseId)) {
      setSelectedExercises(selectedExercises.filter(id => id !== exerciseId));
    } else {
      setSelectedExercises([...selectedExercises, exerciseId]);
    }
  };

  const handleAddToProgram = () => {
    if (selectedExercises.length === 0) return;

    const newExercises = allExercises
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

  const filteredExercises = allExercises.filter(exercise =>
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

      {/* Search Bar and Actions */}
      <div className="mb-8">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search exercises..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>
          {clinicianId && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-3 rounded-lg font-medium whitespace-nowrap bg-white border-2 border-moveify-teal text-moveify-teal hover:bg-moveify-teal hover:text-white transition-colors flex items-center gap-2"
            >
              <Plus size={20} />
              Add Exercise
            </button>
          )}
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

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-4">
          <p className="text-gray-500">Loading exercises...</p>
        </div>
      )}

      {/* Custom Exercises Section */}
      {customExercises.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Your Custom Exercises</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {customExercises
              .filter(exercise =>
                exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                exercise.category.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map(exercise => {
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
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 h-48 flex items-center justify-center relative">
                      <Play className="text-white" size={56} />
                      {isSelected && (
                        <div className="absolute top-3 left-3 bg-moveify-teal text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
                          ✓
                        </div>
                      )}
                      <button
                        onClick={(e) => handleDeleteExercise(exercise.id, (exercise as any).dbId, e)}
                        disabled={deletingId === exercise.id}
                        className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition-colors disabled:opacity-50"
                        title="Delete exercise"
                      >
                        <Trash2 size={16} />
                      </button>
                      <span className="absolute bottom-3 left-3 bg-purple-700/80 text-white text-xs font-medium px-2 py-1 rounded">
                        Custom
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

                      <p className="text-sm text-gray-600 line-clamp-3">
                        {exercise.description}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Default Exercises Section */}
      <div>
        {customExercises.length > 0 && (
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Default Exercise Library</h3>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {defaultExercises
            .filter(exercise =>
              exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              exercise.category.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map(exercise => {
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
                  </div>

                  {/* Exercise Info */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900 text-lg">{exercise.name}</h3>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {exercise.category}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 line-clamp-3">
                      {exercise.description}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* No Results */}
      {filteredExercises.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No exercises found matching "{searchTerm}"</p>
        </div>
      )}

      {/* Add Exercise Modal */}
      {showAddModal && clinicianId && (
        <AddExerciseModal
          clinicianId={clinicianId}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchCustomExercises}
        />
      )}
    </>
  );
};
