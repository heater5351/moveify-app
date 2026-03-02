import { useState, useEffect } from 'react';
import { BookOpen, Plus, Edit, Trash2, Search, Filter } from 'lucide-react';
import type { EducationModule } from '../types/index.ts';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';

interface EducationLibraryProps {
  onAssignToPatient?: (module: EducationModule) => void;
}

export const EducationLibrary = ({ onAssignToPatient }: EducationLibraryProps) => {
  const [modules, setModules] = useState<EducationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingModule, setEditingModule] = useState<EducationModule | null>(null);

  useEffect(() => {
    fetchModules();
    fetchCategories();
  }, []);

  const fetchModules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/education/modules`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setModules(data.modules || []);
      }
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_URL}/education/categories`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleCreateModule = async (moduleData: Partial<EducationModule>) => {
    try {
      const response = await fetch(`${API_URL}/education/modules`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(moduleData)
      });

      if (response.ok) {
        await fetchModules();
        await fetchCategories();
        setShowCreateModal(false);
        setEditingModule(null);
      }
    } catch (error) {
      console.error('Failed to create module:', error);
    }
  };

  const handleUpdateModule = async (moduleId: number, updates: Partial<EducationModule>) => {
    try {
      const response = await fetch(`${API_URL}/education/modules/${moduleId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        await fetchModules();
        await fetchCategories();
        setEditingModule(null);
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Failed to update module:', error);
    }
  };

  const handleDeleteModule = async (moduleId: number) => {
    if (!confirm('Are you sure you want to delete this module? This will unassign it from all patients.')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/education/modules/${moduleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        await fetchModules();
      }
    } catch (error) {
      console.error('Failed to delete module:', error);
    }
  };

  const filteredModules = modules.filter(module => {
    const matchesSearch = module.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (module.description && module.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = !selectedCategory || module.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading education library...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="text-moveify-teal" size={32} />
          <h2 className="text-2xl font-bold text-gray-900">Education Library</h2>
        </div>
        <button
          onClick={() => {
            setEditingModule(null);
            setShowCreateModal(true);
          }}
          className="bg-moveify-teal text-white px-4 py-2 rounded-lg hover:bg-moveify-teal-dark font-medium flex items-center gap-2"
        >
          <Plus size={18} />
          Create Module
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search modules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent appearance-none bg-white min-w-[200px]"
          >
            <option value="">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Module Grid */}
      {filteredModules.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500">No modules found</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 text-moveify-teal hover:text-moveify-teal-dark font-medium"
          >
            Create your first module
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModules.map(module => (
            <div key={module.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
              {module.imageUrl && (
                <img src={module.imageUrl} alt={module.title} className="w-full h-48 object-cover" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 flex-1">{module.title}</h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingModule(module);
                        setShowCreateModal(true);
                      }}
                      className="p-1 text-gray-600 hover:text-moveify-teal"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteModule(module.id)}
                      className="p-1 text-gray-600 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {module.category && (
                  <span className="inline-block text-xs bg-primary-100 text-moveify-teal px-2 py-1 rounded mb-2">
                    {module.category}
                  </span>
                )}

                {module.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{module.description}</p>
                )}

                {module.estimatedDurationMinutes && (
                  <p className="text-xs text-gray-500 mb-3">
                    {module.estimatedDurationMinutes} min read
                  </p>
                )}

                {onAssignToPatient && (
                  <button
                    onClick={() => onAssignToPatient(module)}
                    className="w-full bg-moveify-teal text-white px-4 py-2 rounded-lg hover:bg-moveify-teal-dark text-sm font-medium"
                  >
                    Assign to Patient
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <ModuleEditorModal
          module={editingModule}
          onSave={editingModule ?
            (data) => handleUpdateModule(editingModule.id, data) :
            handleCreateModule
          }
          onClose={() => {
            setShowCreateModal(false);
            setEditingModule(null);
          }}
        />
      )}
    </div>
  );
};

// Module Editor Modal Component
interface ModuleEditorModalProps {
  module: EducationModule | null;
  onSave: (data: Partial<EducationModule>) => void;
  onClose: () => void;
}

const ModuleEditorModal = ({ module, onSave, onClose }: ModuleEditorModalProps) => {
  const [formData, setFormData] = useState({
    title: module?.title || '',
    description: module?.description || '',
    content: module?.content || '',
    category: module?.category || '',
    estimatedDurationMinutes: module?.estimatedDurationMinutes || '',
    imageUrl: module?.imageUrl || '',
    videoUrl: module?.videoUrl || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: formData.title,
      description: formData.description || null,
      content: formData.content,
      category: formData.category || null,
      estimatedDurationMinutes: formData.estimatedDurationMinutes ? parseInt(formData.estimatedDurationMinutes as string) : null,
      imageUrl: formData.imageUrl || null,
      videoUrl: formData.videoUrl || null
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {module ? 'Edit Module' : 'Create New Module'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., Pain Management, Exercise Basics"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              placeholder="Brief summary of the module"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={10}
              placeholder="Full module content (supports markdown)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estimated Duration (minutes)
            </label>
            <input
              type="number"
              min="1"
              value={formData.estimatedDurationMinutes}
              onChange={(e) => setFormData({ ...formData, estimatedDurationMinutes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Image URL
            </label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Video URL (YouTube, Vimeo, etc.)
            </label>
            <input
              type="url"
              value={formData.videoUrl}
              onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-moveify-teal text-white px-6 py-2 rounded-lg hover:bg-moveify-teal-dark font-medium"
            >
              {module ? 'Update Module' : 'Create Module'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
