import { useState, useEffect } from 'react';
import { Search, Play, Plus, Trash2, X, Check, Star, Filter } from 'lucide-react';
import type { ProgramExercise, Exercise, ExerciseFilters } from '../types/index.ts';
import { exercises as defaultExercises } from '../data/exercises';
import { AddExerciseModal } from './modals/AddExerciseModal';
import { API_URL } from '../config';

// Exercise Detail Modal Component
const ExerciseDetailModal = ({
  exercise,
  isSelected,
  onToggleSelect,
  onClose
}: {
  exercise: Exercise;
  isSelected: boolean;
  onToggleSelect: () => void;
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
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                {exercise.category}
              </span>
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

        {/* Footer with Select Button */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={onToggleSelect}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              isSelected
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-moveify-teal text-white hover:bg-moveify-teal-dark'
            }`}
          >
            {isSelected ? 'Remove from Selection' : 'Add to Selection'}
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
  const [selectedExercises, setSelectedExercises] = useState<number[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [detailModal, setDetailModal] = useState<Exercise | null>(null);
  const [filters, setFilters] = useState<ExerciseFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [filterOptions, setFilterOptions] = useState<{
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
    categories: ['Musculoskeletal', 'Women\'s Health', 'Neurological', 'Cardio', 'Balance', 'Flexibility']
  });

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
        setFilterOptions(prev => ({
          ...prev,
          jointAreas: data.jointAreas || [],
          muscleGroups: data.muscleGroups || [],
          movementTypes: data.movementTypes || [],
          equipment: data.equipment || [],
          positions: data.positions || []
        }));
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

  const filteredExercises = allExercises.filter(exercise => {
    // Text search
    const matchesSearch =
      exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exercise.category.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter matching (use .includes() for comma-separated)
    const matchesCategory = !filters.category || exercise.category === filters.category;
    const matchesJoint = !filters.jointArea || exercise.jointArea?.includes(filters.jointArea);
    const matchesMuscle = !filters.muscleGroup || exercise.muscleGroup?.includes(filters.muscleGroup);
    const matchesMovement = !filters.movementType || exercise.movementType?.includes(filters.movementType);
    const matchesEquipment = !filters.equipment || exercise.equipment?.includes(filters.equipment);
    const matchesPosition = !filters.position || exercise.position?.includes(filters.position);

    // Favorites filter
    const exerciseKey = `${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`;
    const matchesFavorites = !filters.showFavoritesOnly || favorites.has(exerciseKey);

    return matchesSearch && matchesCategory && matchesJoint && matchesMuscle &&
           matchesMovement && matchesEquipment && matchesPosition &&
           matchesFavorites;
  });

  // Separate custom and default filtered exercises
  const filteredCustom = customExercises.filter(exercise => {
    // Text search
    const matchesSearch =
      exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exercise.category.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter matching (use .includes() for comma-separated)
    const matchesCategory = !filters.category || exercise.category === filters.category;
    const matchesJoint = !filters.jointArea || exercise.jointArea?.includes(filters.jointArea);
    const matchesMuscle = !filters.muscleGroup || exercise.muscleGroup?.includes(filters.muscleGroup);
    const matchesMovement = !filters.movementType || exercise.movementType?.includes(filters.movementType);
    const matchesEquipment = !filters.equipment || exercise.equipment?.includes(filters.equipment);
    const matchesPosition = !filters.position || exercise.position?.includes(filters.position);

    // Favorites filter
    const exerciseKey = `${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`;
    const matchesFavorites = !filters.showFavoritesOnly || favorites.has(exerciseKey);

    return matchesSearch && matchesCategory && matchesJoint && matchesMuscle &&
           matchesMovement && matchesEquipment && matchesPosition &&
           matchesFavorites;
  });

  const filteredDefault = defaultExercises.filter(exercise => {
    // Text search
    const matchesSearch =
      exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exercise.category.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter matching (use .includes() for comma-separated)
    const matchesCategory = !filters.category || exercise.category === filters.category;
    const matchesJoint = !filters.jointArea || exercise.jointArea?.includes(filters.jointArea);
    const matchesMuscle = !filters.muscleGroup || exercise.muscleGroup?.includes(filters.muscleGroup);
    const matchesMovement = !filters.movementType || exercise.movementType?.includes(filters.movementType);
    const matchesEquipment = !filters.equipment || exercise.equipment?.includes(filters.equipment);
    const matchesPosition = !filters.position || exercise.position?.includes(filters.position);

    // Favorites filter
    const exerciseKey = `${exercise.isCustom ? 'custom' : 'default'}-${exercise.id}`;
    const matchesFavorites = !filters.showFavoritesOnly || favorites.has(exerciseKey);

    return matchesSearch && matchesCategory && matchesJoint && matchesMuscle &&
           matchesMovement && matchesEquipment && matchesPosition &&
           matchesFavorites;
  });

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
      <div className="max-h-[calc(100vh-350px)] overflow-y-auto pr-2">
        {/* Custom Exercises Section */}
        {filteredCustom.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Your Custom Exercises</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {filteredCustom.map(exercise => {
                const isSelected = selectedExercises.includes(exercise.id);
                return (
                  <div
                    key={exercise.id}
                    onClick={() => setDetailModal(exercise)}
                    className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden hover:shadow-md transition-all cursor-pointer ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-100'
                    }`}
                  >
                    {/* Video Thumbnail */}
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 h-48 flex items-center justify-center relative">
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
                      {/* Selection Checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExercise(exercise.id);
                        }}
                        className={`absolute top-3 right-3 w-7 h-7 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-moveify-teal border-moveify-teal text-white'
                            : 'bg-white/90 border-gray-300 hover:border-moveify-teal'
                        }`}
                        title={isSelected ? 'Deselect exercise' : 'Select exercise'}
                      >
                        {isSelected && <Check size={16} />}
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
          {filteredDefault.map(exercise => {
              const isSelected = selectedExercises.includes(exercise.id);
              return (
                <div
                  key={exercise.id}
                  onClick={() => setDetailModal(exercise)}
                  className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden hover:shadow-md transition-all cursor-pointer ${
                    isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-100'
                  }`}
                >
                  {/* Video Thumbnail */}
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 h-48 flex items-center justify-center relative">
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
                    {/* Selection Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExercise(exercise.id);
                      }}
                      className={`absolute top-3 right-3 w-7 h-7 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-moveify-teal border-moveify-teal text-white'
                          : 'bg-white/90 border-gray-300 hover:border-moveify-teal'
                      }`}
                      title={isSelected ? 'Deselect exercise' : 'Select exercise'}
                    >
                      {isSelected && <Check size={16} />}
                    </button>
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
          isSelected={selectedExercises.includes(detailModal.id)}
          onToggleSelect={() => toggleExercise(detailModal.id)}
          onClose={() => setDetailModal(null)}
        />
      )}
    </>
  );
};
