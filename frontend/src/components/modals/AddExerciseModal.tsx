import { useState } from 'react';
import { X, Play, ExternalLink } from 'lucide-react';
import { API_URL } from '../../config';
import { getAuthHeaders } from '../../utils/api';

// Convert YouTube URL to embed format
const convertToEmbedUrl = (url: string): string | null => {
  if (!url) return null;

  // Handle youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
  if (watchMatch) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`;
  }

  // Handle youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }

  // Handle youtube.com/embed/VIDEO_ID (already embed format)
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
  if (embedMatch) {
    return url;
  }

  return null;
};

interface AddExerciseModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = [
  'Musculoskeletal',
  'Women\'s Health',
  'Neurological',
  'Cardio',
  'Balance',
  'Flexibility'
];

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

const EQUIPMENT_OPTIONS = [
  'Bodyweight',
  'Dumbbells',
  'Barbell',
  'Resistance Band',
  'Machine',
  'Kettlebell',
  'Medicine Ball',
  'Foam Roller',
  'Stability Ball',
  'Support'
];

const POSITION_OPTIONS = [
  'Standing',
  'Seated',
  'Supine',
  'Prone',
  'Side-lying',
  'Quadruped',
  'Kneeling',
  'Hanging'
];

const JOINT_AREA_OPTIONS = [
  'Hip',
  'Knee',
  'Shoulder',
  'Elbow',
  'Ankle',
  'Spine',
  'Wrist'
];

const MUSCLE_GROUP_OPTIONS = [
  'Quadriceps',
  'Glutes',
  'Hamstrings',
  'Chest',
  'Triceps',
  'Biceps',
  'Lats',
  'Deltoids',
  'Abs',
  'Obliques',
  'Core',
  'Lower Back',
  'Calves',
  'Forearms',
  'Traps',
  'Rhomboids',
  'Rear Deltoids',
  'Adductors',
  'Hip Flexors',
  'Rotator Cuff',
  'Brachialis',
  'Serratus'
];

const MOVEMENT_TYPE_OPTIONS = [
  'Flexion',
  'Extension',
  'Abduction',
  'Adduction',
  'Rotation',
  'External Rotation',
  'Isometric',
  'Elevation',
  'Lateral Flexion',
  'Plantar Flexion'
];

export const AddExerciseModal = ({ onClose, onSuccess }: AddExerciseModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Musculoskeletal',
    difficulty: 'Beginner',
    duration: '',
    description: '',
    videoUrl: '',
    jointArea: '',
    muscleGroup: '',
    movementType: '',
    equipment: '',
    position: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Toggle a value in a comma-separated string field
  const toggleCheckboxValue = (field: 'jointArea' | 'muscleGroup' | 'movementType', value: string) => {
    const current = formData[field] ? formData[field].split(',').map(v => v.trim()).filter(Boolean) : [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated.join(', ') });
  };

  const handleSubmit = async () => {
    setError('');

    // Validation
    if (!formData.name || !formData.duration || !formData.description) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert video URL to embed format if provided
      const embedUrl = formData.videoUrl ? convertToEmbedUrl(formData.videoUrl) : '';

      const response = await fetch(`${API_URL}/exercises`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: formData.name,
          category: formData.category,
          difficulty: formData.difficulty,
          duration: formData.duration,
          description: formData.description,
          videoUrl: embedUrl || '',
          jointArea: formData.jointArea || null,
          muscleGroup: formData.muscleGroup || null,
          movementType: formData.movementType || null,
          equipment: formData.equipment || null,
          position: formData.position || null
        })
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create exercise');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Add New Exercise</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {/* Exercise Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Exercise Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              placeholder="e.g., Single Leg Deadlift"
            />
          </div>

          {/* Category and Difficulty Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              >
                {DIFFICULTIES.map(diff => (
                  <option key={diff} value={diff}>{diff}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              placeholder="e.g., 3 sets x 12 reps"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent resize-none"
              placeholder="Step-by-step instructions for performing the exercise..."
            />
          </div>

          {/* Video URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video URL <span className="text-gray-400">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.videoUrl}
                onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
                placeholder="https://youtube.com/watch?v=..."
              />
              {formData.videoUrl && convertToEmbedUrl(formData.videoUrl) && (
                <a
                  href={formData.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1 text-gray-600"
                  title="Preview video"
                >
                  <ExternalLink size={18} />
                </a>
              )}
            </div>
            {formData.videoUrl && !convertToEmbedUrl(formData.videoUrl) && (
              <p className="text-sm text-amber-600 mt-1">
                Please use a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...)
              </p>
            )}
            {formData.videoUrl && convertToEmbedUrl(formData.videoUrl) && (
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                <Play size={14} /> Valid YouTube URL detected
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-4"></div>
          <p className="text-sm font-medium text-gray-700 mb-3">
            Additional Metadata <span className="text-gray-400">(optional - helps with filtering)</span>
          </p>

          {/* Joint/Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Joint/Area
            </label>
            <div className="flex flex-wrap gap-2">
              {JOINT_AREA_OPTIONS.map(option => {
                const selected = formData.jointArea.split(',').map(v => v.trim()).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleCheckboxValue('jointArea', option)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      selected
                        ? 'bg-moveify-teal text-white border-moveify-teal'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-moveify-teal'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Muscle Group */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Muscle Group
            </label>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_GROUP_OPTIONS.map(option => {
                const selected = formData.muscleGroup.split(',').map(v => v.trim()).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleCheckboxValue('muscleGroup', option)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      selected
                        ? 'bg-moveify-teal text-white border-moveify-teal'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-moveify-teal'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Movement Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Movement Type
            </label>
            <div className="flex flex-wrap gap-2">
              {MOVEMENT_TYPE_OPTIONS.map(option => {
                const selected = formData.movementType.split(',').map(v => v.trim()).includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleCheckboxValue('movementType', option)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      selected
                        ? 'bg-moveify-teal text-white border-moveify-teal'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-moveify-teal'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Equipment and Position Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Equipment
              </label>
              <select
                value={formData.equipment}
                onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              >
                <option value="">Select equipment...</option>
                {EQUIPMENT_OPTIONS.map(eq => (
                  <option key={eq} value={eq}>{eq}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position
              </label>
              <select
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
              >
                <option value="">Select position...</option>
                {POSITION_OPTIONS.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.name || !formData.duration || !formData.description}
            className="flex-1 px-4 py-2 bg-moveify-teal text-white rounded-lg hover:bg-moveify-teal-dark font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Adding...' : 'Add Exercise'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddExerciseModal;
