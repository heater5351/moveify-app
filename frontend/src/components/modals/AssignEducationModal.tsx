import { useState, useEffect } from 'react';
import { BookOpen, Search, Check, X } from 'lucide-react';
import type { EducationModule, PatientEducationModule } from '../../types/index.ts';
import { API_URL } from '../../config';

interface AssignEducationModalProps {
  patientId: number;
  patientName: string;
  onClose: () => void;
  onAssigned: () => void;
}

export const AssignEducationModal = ({
  patientId,
  patientName,
  onClose,
  onAssigned
}: AssignEducationModalProps) => {
  const [allModules, setAllModules] = useState<EducationModule[]>([]);
  const [assignedModules, setAssignedModules] = useState<PatientEducationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchData();
  }, [patientId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [modulesRes, assignedRes, categoriesRes] = await Promise.all([
        fetch(`${API_URL}/education/modules`),
        fetch(`${API_URL}/education/patient/${patientId}/modules`),
        fetch(`${API_URL}/education/categories`)
      ]);

      if (modulesRes.ok) {
        const data = await modulesRes.json();
        setAllModules(data.modules || []);
      }

      if (assignedRes.ok) {
        const data = await assignedRes.json();
        setAssignedModules(data.modules || []);
      }

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (moduleId: number) => {
    try {
      setAssigning(true);
      const response = await fetch(
        `${API_URL}/education/patient/${patientId}/modules/${moduleId}`,
        { method: 'POST' }
      );

      if (response.ok) {
        await fetchData();
        onAssigned();
      }
    } catch (error) {
      console.error('Failed to assign module:', error);
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (moduleId: number) => {
    try {
      setAssigning(true);
      const response = await fetch(
        `${API_URL}/education/patient/${patientId}/modules/${moduleId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        await fetchData();
        onAssigned();
      }
    } catch (error) {
      console.error('Failed to unassign module:', error);
    } finally {
      setAssigning(false);
    }
  };

  const isAssigned = (moduleId: number) => {
    return assignedModules.some(m => m.id === moduleId);
  };

  const filteredModules = allModules.filter(module => {
    const matchesSearch = module.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (module.description && module.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = !selectedCategory || module.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl ring-1 ring-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold font-display text-slate-800">Assign Education Modules</h2>
              <p className="text-sm text-slate-500 mt-1">
                Assign educational content to {patientName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="px-6 py-4 border-b border-slate-100 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search modules..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 outline-none"
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <div className="ml-auto text-sm text-slate-500">
              {assignedModules.length} module{assignedModules.length !== 1 ? 's' : ''} assigned
            </div>
          </div>
        </div>

        {/* Module List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-slate-500">Loading modules...</p>
            </div>
          ) : filteredModules.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="mx-auto text-slate-400 mb-4" size={48} />
              <p className="text-slate-500">No modules found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredModules.map(module => {
                const assigned = isAssigned(module.id);
                const assignedModule = assignedModules.find(m => m.id === module.id);

                return (
                  <div
                    key={module.id}
                    className={`rounded-lg p-4 ${
                      assigned ? 'bg-primary-50 ring-1 ring-primary-300' : 'bg-white ring-1 ring-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-800">{module.title}</h3>
                            {module.category && (
                              <span className="inline-block text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded mt-1">
                                {module.category}
                              </span>
                            )}
                          </div>
                          {assigned && assignedModule && (
                            <div className="flex items-center gap-2 ml-4">
                              {assignedModule.viewed ? (
                                <span className="flex items-center gap-1 text-emerald-600 text-sm">
                                  <Check size={16} />
                                  Read
                                </span>
                              ) : (
                                <span className="text-amber-600 text-sm">Not read</span>
                              )}
                            </div>
                          )}
                        </div>

                        {module.description && (
                          <p className="text-sm text-slate-500 mb-2">{module.description}</p>
                        )}

                        {module.estimatedDurationMinutes && (
                          <p className="text-xs text-slate-400">
                            {module.estimatedDurationMinutes} min read
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => assigned ? handleUnassign(module.id) : handleAssign(module.id)}
                        disabled={assigning}
                        className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap ${
                          assigned
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-primary-400 text-white hover:bg-primary-500'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {assigned ? 'Unassign' : 'Assign'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full bg-primary-400 text-white px-6 py-3 rounded-lg hover:bg-primary-500 font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
