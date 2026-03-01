import { useState, useEffect, useMemo } from 'react';
import { Search, Play, Plus, Trash2, X, Star, Filter } from 'lucide-react';
import type { ProgramExercise, Exercise, ExerciseFilters } from '../types/index.ts';
import { exercises as defaultExercises } from '../data/exercises';
import { AddExerciseModal } from './modals/AddExerciseModal';
import { API_URL } from '../config';

// Extract unique, sorted values from a comma-separated field across all exercises
const extractUniqueValues = (exercises: Exercise[], field: keyof Exercise): string[] => {
  const values = new Set<string>();
  for (const ex of exercises) {
    const val = ex[field];
    if (typeof val === 'string' && val) {
      for (const part of val.split(',')) {
        const trimmed = part.trim();
        if (trimmed) values.add(trimmed);
      }
    }
  }
  return Array.from(values).sort();
};

// Check if a comma-separated field contains an exact value (not substring)
const fieldContainsValue = (fieldValue: string | undefined, filterValue: string): boolean => {
  if (!fieldValue) return false;
  return fieldValue.split(',').some(v => v.trim() === filterValue);
};

// Merge two string arrays, deduplicate and sort
const mergeAndSort = (a: string[], b: string[]): string[] => {
  return Array.from(new Set([...a, ...b])).sort();
};

// Exercise Detail Modal Component
const ExerciseDetailModal = ({
  exercise,
  onAddToProgram,
  onClose
}: {
  exercise: Exercise;
  onAddToProgram: (exercises: ProgramExercise[]) => void;
  onClose: () => void;
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-xl text-gray-900">{exercise.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">{exercise.duration}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Video Player (larger) */}
        {exercise.videoUrl && (
          <div className="aspect-video bg-black">
            <iframe
              src={exercise.videoUrl}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        )}

        {/* Full Description (scrollable) */}
        <div className="flex-1 overflow-y-auto p-4">
          <h4 className="font-medium text-gray-900 mb-2">Instructions</h4>
          <p className="text-gray-700 whitespace-pre-wrap">{exercise.description}</p>
        </div>

        {/* Footer with Add Button */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={() => {
              onAddToProgram([{ ...exercise, sets: 3, reps: 10, completed: false }]);
              onClose();
            }}
            className="w-full py-3 rounded-lg font-medium transition-colors bg-moveify-teal text-white hover:bg-moveify-teal-dark"
          >
            Add to Program
          </button>
        </div>
      </div>
    </div>
  );
};

interface ExerciseLibraryProps {
  onAddToProgram: (exercises: ProgramExercise[]) => void;
  clinicianId?: number;
}

export const ExerciseLibrary = ({ onAddToProgram, clinicianId }: ExerciseLibraryProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [detailModal, setDetailModal] = useState<Exercise | null>(null);
  const [filters, setFilters] = useState<ExerciseFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Extract filter options from hardcoded defaults (always available)
  const defaultFilterOptions = useMemo(() => ({
    jointAreas: extractUniqueValues(defaultExercises, 'jointArea'),
    muscleGroups: extractUniqueValues(defaultExercises, 'muscleGroup'),
    movementTypes: extractUniqueValues(defaultExercises, 'movementType'),
    equipment: extractUniqueValues(defaultExercises, 'equipment'),
    positions: extractUniqueValues(defaultExercises, 'position'),
    categories: extractUniqueValues(defaultExercises, 'category'),
  }), []);

  const [apiFilterOptions, setApiFilterOptions] = useState<{
    jointAreas: string[];
    muscleGroups: string[];
    movementTypes: string[];
    equipment: string[];
    positions: string[];
    categories: string[];
  }>({
    jointAreas: [],
    muscleGroups: [],
    movementTypes: [],
    equipment: [],
    positions: [],
    categories: []
  });

  // Merge default + API filter options
  const filterOptions = useMemo(() => ({
    jointAreas: mergeAndSort(defaultFilterOptions.jointAreas, apiFilterOptions.jointAreas),
    muscleGroups: mergeAndSort(defaultFilterOptions.muscleGroups, apiFilterOptions.muscleGroups),
    movementTypes: mergeAndSort(defaultFilterOptions.movementTypes, apiFilterOptions.movementTypes),
    equipment: mergeAndSort(defaultFilterOptions.equipment, apiFilterOptions.equipment),
    positions: mergeAndSort(defaultFilterOptions.positions, apiFilterOptions.positions),
    categories: mergeAndSort(defaultFilterOptions.categories, apiFilterOptions.categories),
  }), [defaultFilterOptions, apiFilterOptions]);

  // Fetch custom exercises for this clinician
  useEffect(() => {
    if (clinicianId) {
      fetchCustomExercises();
      fetchFavorites();
      fetchFilterOptions();
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
        const mapped = data.map((ex: {
          id: number;
          name: string;
          category: string;
          duration: string;
          difficulty: string;
          description: string;
          video_url?: string;
          joint_area?: string;
          muscle_group?: string;
          movement_type?: string;
          equipment?: string;
          position?: string;
        }) => ({
          id: ex.id + 10000, // Offset to avoid ID collision with default exercises
          dbId: ex.id, // Store original DB ID for deletion
          name: ex.name,
          category: ex.category,
          duration: ex.duration,
          difficulty: ex.difficulty,
          description: ex.description,
          videoUrl: ex.video_url,
          jointArea: ex.joint_area,
          muscleGroup: ex.muscle_group,
          movementType: ex.movement_type,
          equipment: ex.equipment,
          position: ex.position,
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

  const fetchFavorites = async () => {
    if (!clinicianId) return;

    try {
      const response = await fetch(`${API_URL}/exercises/favorites/${clinicianId}`);
      if (response.ok) {
        const data = await response.json();
        const favSet = new Set<string>(data.map((fav: { exercise_id: number; exercise_type: string }) =>
          `${fav.exercise_type}-${fav.exercise_id}`
        ));
        setFavorites(favSet);
      }
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const response = await fetch(`${API_URL}/exercises/filter-options`);
      if (response.ok) {
        const data = await response.json();
        setApiFilterOptions({
          jointAreas: data.jointAreas || [],
          muscleGroups: data.muscleGroups || [],
          movementTypes: data.movementTypes || [],
          equipment: data.equipment || [],
          positions: data.positions || [],
          categories: data.categories || []
        });
      }
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
    }
  };

  const toggleFavorite = async (exerciseId: number, exerciseType: string) => {
    if (!clinicianId) return;

    const exerciseKey = `${exerciseType}-${exerciseId}`;
    const isFavorite = favorites.has(exerciseKey);

    console.log('Toggle favorite:', { exerciseId, exerciseType, exerciseKey, isFavorite, method: isFavorite ? 'DELETE' : 'POST' });

    try {
      const method = isFavorite ? 'DELETE' : 'POST';
      const response = await fetch(`${API_URL}/exercises/favorites`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicianId,
          exerciseId,
          exerciseType
        })
      });

      console.log('API response:', { ok: response.ok, status: response.status });

      if (response.ok) {
        const newFavorites = new Set<string>(favorites);
        if (isFavorite) {
          newFavorites.delete(exerciseKey);
          console.log('Removed from favorites:', exerciseKey);
        } else {
          newFavorites.add(exerciseKey);
          console.log('Added to favorites:', exerciseKey);
        }
        setFavorites(newFavorites);
        console.log('Updated favorites set size:', newFavorites.size);
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
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

  // Shared filter function — applies search, filters, and favorites
  const applyFilters = (exerciseList: Exercise[]): Exercise[] => {
    const search = searchTerm.toLowerCase();
    return exerciseList.filter(exercise => {
      const matchesSearch =
        exercise.name.toLowerCase().includes(search) ||
        exercise.category.toLowerCase().includes(search);

      const matchesCategory = !filters.category || exercise.category === filters.category;
      const matchesJoint = !filters.jointArea || fieldContainsValue(exercise.jointArea, filters.jointArea);
      const matchesMuscle = !filters.muscleGroup || fieldContainsValue(exercise.muscleGroup, filters.muscleGroup);
      const matchesMovement = !filters.movementType || fieldContainsValue(exercise.movementType, filters.movementType);
      const matchesEquipment = !filters.equipment || fieldContainsValue(exercise.equipment, filters.equipment);
      const matchesPosition = !filters.position || fieldContainsValue(exercise.position, filters.position);

      const exerciseKey = `${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`;
      const matchesFavorites = !filters.showFavoritesOnly || favorites.has(exerciseKey);

      return matchesSearch && matchesCategory && matchesJoint && matchesMuscle &&
             matchesMovement && matchesEquipment && matchesPosition &&
             matchesFavorites;
    });
  };

  // Combine default and custom exercises
  const allExercises = [...defaultExercises, ...customExercises];
  const filteredExercises = applyFilters(allExercises);
  const filteredCustom = applyFilters(customExercises);
  const filteredDefault = applyFilters(defaultExercises);

  return (
    <div className="h-full flex flex-col min-h-0">
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border-2 border-gray-300 rounded-lg hover:border-moveify-teal transition-colors"
          >
            <Filter size={20} />
            <span>Filters</span>
            {Object.values(filters).filter(v => v).length > 0 && (
              <span className="bg-moveify-teal text-white text-xs px-2 py-1 rounded-full">
                {Object.values(filters).filter(v => v).length}
              </span>
            )}
          </button>
          {clinicianId && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-3 rounded-lg font-medium whitespace-nowrap bg-white border-2 border-moveify-teal text-moveify-teal hover:bg-moveify-teal hover:text-white transition-colors flex items-center gap-2"
            >
              <Plus size={20} />
              Add Exercise
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={filters.category || ''}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                >
                  <option value="">All Categories</option>
                  {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Joint/Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Joint/Area</label>
                <select
                  value={filters.jointArea || ''}
                  onChange={(e) => setFilters({ ...filters, jointArea: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                >
                  <option value="">All Joints</option>
                  {filterOptions.jointAreas.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>

              {/* Muscle Group */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Muscle Group</label>
                <select
                  value={filters.muscleGroup || ''}
                  onChange={(e) => setFilters({ ...filters, muscleGroup: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                >
                  <option value="">All Muscles</option>
                  {filterOptions.muscleGroups.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Equipment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Equipment</label>
                <select
                  value={filters.equipment || ''}
                  onChange={(e) => setFilters({ ...filters, equipment: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                >
                  <option value="">All Equipment</option>
                  {filterOptions.equipment.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                </select>
              </div>

              {/* Position */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Position</label>
                <select
                  value={filters.position || ''}
                  onChange={(e) => setFilters({ ...filters, position: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                >
                  <option value="">All Positions</option>
                  {filterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Movement Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Movement Type</label>
                <select
                  value={filters.movementType || ''}
                  onChange={(e) => setFilters({ ...filters, movementType: e.target.value || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                >
                  <option value="">All Movements</option>
                  {filterOptions.movementTypes.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                </select>
              </div>

              {/* Favorites Only */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.showFavoritesOnly || false}
                    onChange={(e) => setFilters({ ...filters, showFavoritesOnly: e.target.checked })}
                    className="w-4 h-4 text-moveify-teal rounded focus:ring-moveify-teal"
                  />
                  <span className="text-sm font-medium text-gray-700">Favorites Only</span>
                </label>
              </div>
            </div>

            {/* Clear Filters */}
            {Object.values(filters).some(v => v) && (
              <button
                onClick={() => setFilters({})}
                className="text-sm text-moveify-teal hover:text-moveify-teal-dark font-medium"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-4">
          <p className="text-gray-500">Loading exercises...</p>
        </div>
      )}

      {/* Scrollable Exercise Grid Container */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        {/* Custom Exercises Section */}
        {filteredCustom.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Your Custom Exercises</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {filteredCustom.map(exercise => {
                return (
                  <div
                    key={exercise.id}
                    onClick={() => setDetailModal(exercise)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/exercise', JSON.stringify({ ...exercise, sets: 3, reps: 10, completed: false }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="bg-white rounded-xl shadow-sm border-2 border-gray-100 overflow-hidden hover:shadow-md transition-all cursor-pointer aspect-square flex flex-col"
                  >
                    {/* Video Thumbnail */}
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 basis-2/3 flex items-center justify-center relative">
                      {/* Favorite Star */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const exerciseType = exercise.isCustom ? 'custom' : 'default';
                          toggleFavorite(exercise.id, exerciseType);
                        }}
                        className={`absolute top-3 left-3 p-2 rounded-full transition-colors z-10 ${
                          favorites.has(`${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`)
                            ? 'bg-yellow-400 text-white'
                            : 'bg-white/90 text-gray-400 hover:text-yellow-400'
                        }`}
                        title={favorites.has(`${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={18} fill={favorites.has(`${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`) ? 'currentColor' : 'none'} />
                      </button>
                      {exercise.videoUrl ? (
                        <Play className="text-white" size={40} fill="white" />
                      ) : (
                        <Play className="text-white/50" size={56} />
                      )}
                      {/* Add to Program Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToProgram([{ ...exercise, sets: 3, reps: 10, completed: false }]);
                        }}
                        className="absolute top-3 right-3 p-2 rounded-full transition-colors bg-white/90 text-gray-400 hover:text-moveify-teal"
                        title="Add to program"
                      >
                        <Plus size={16} />
                      </button>
                      {/* Delete Button */}
                      <button
                        onClick={(e) => handleDeleteExercise(exercise.id, (exercise as any).dbId, e)}
                        disabled={deletingId === exercise.id}
                        className="absolute top-3 right-12 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition-colors disabled:opacity-50"
                        title="Delete exercise"
                      >
                        <Trash2 size={16} />
                      </button>
                      <span className="absolute bottom-3 left-3 bg-purple-700/80 text-white text-xs font-medium px-2 py-1 rounded">
                        Custom
                      </span>
                    </div>

                    {/* Exercise Info */}
                    <div className="basis-1/3 flex items-center p-2">
                      <h3 className="font-medium text-gray-900 text-xs line-clamp-2">{exercise.name}</h3>
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {filteredDefault.map(exercise => {
              return (
                <div
                  key={exercise.id}
                  onClick={() => setDetailModal(exercise)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/exercise', JSON.stringify({ ...exercise, sets: 3, reps: 10, completed: false }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="bg-white rounded-xl shadow-sm border-2 border-gray-100 overflow-hidden hover:shadow-md transition-all cursor-pointer aspect-square flex flex-col"
                >
                  {/* Video Thumbnail */}
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 basis-2/3 flex items-center justify-center relative">
                    {/* Favorite Star */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const exerciseType = exercise.isCustom ? 'custom' : 'default';
                        toggleFavorite(exercise.id, exerciseType);
                      }}
                      className={`absolute top-3 left-3 p-2 rounded-full transition-colors z-10 ${
                        favorites.has(`${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`)
                          ? 'bg-yellow-400 text-white'
                          : 'bg-white/90 text-gray-400 hover:text-yellow-400'
                      }`}
                      title={favorites.has(`${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star size={18} fill={favorites.has(`${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`) ? 'currentColor' : 'none'} />
                    </button>
                    {exercise.videoUrl ? (
                      <Play className="text-white" size={40} fill="white" />
                    ) : (
                      <Play className="text-white/50" size={56} />
                    )}
                    {/* Add to Program Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToProgram([{ ...exercise, sets: 3, reps: 10, completed: false }]);
                      }}
                      className="absolute top-3 right-3 p-2 rounded-full transition-colors bg-white/90 text-gray-400 hover:text-moveify-teal"
                      title="Add to program"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* Exercise Info */}
                  <div className="basis-1/3 flex items-center p-2">
                    <h3 className="font-medium text-gray-900 text-xs line-clamp-2">{exercise.name}</h3>
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
      </div>

      {/* Add Exercise Modal */}
      {showAddModal && clinicianId && (
        <AddExerciseModal
          clinicianId={clinicianId}
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchCustomExercises}
        />
      )}

      {/* Exercise Detail Modal */}
      {detailModal && (
        <ExerciseDetailModal
          exercise={detailModal}
          onAddToProgram={onAddToProgram}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  );
};
