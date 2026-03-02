import { useState, useEffect } from 'react';
import { BookOpen, Check, Clock, ExternalLink } from 'lucide-react';
import type { PatientEducationModule } from '../types/index.ts';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';

interface PatientEducationModulesProps {
  patientId: number;
  isPatientView?: boolean; // True if viewing from patient portal, false if viewing from clinician dashboard
}

export const PatientEducationModules = ({ patientId, isPatientView = false }: PatientEducationModulesProps) => {
  const [modules, setModules] = useState<PatientEducationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<PatientEducationModule | null>(null);

  useEffect(() => {
    fetchModules();
  }, [patientId]);

  const fetchModules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/education/patient/${patientId}/modules`, {
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

  const handleViewModule = async (module: PatientEducationModule) => {
    setSelectedModule(module);

    // Mark as viewed if not already viewed and this is the patient viewing
    if (isPatientView && !module.viewed) {
      try {
        await fetch(`${API_URL}/education/patient/${patientId}/modules/${module.id}/viewed`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        // Update local state
        setModules(modules.map(m =>
          m.id === module.id ? { ...m, viewed: true, viewedAt: new Date().toISOString() } : m
        ));
      } catch (error) {
        console.error('Failed to mark module as viewed:', error);
      }
    }
  };

  const handleUnassign = async (moduleId: number) => {
    if (!confirm('Are you sure you want to unassign this module?')) {
      return;
    }

    try {
      await fetch(`${API_URL}/education/patient/${patientId}/modules/${moduleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      await fetchModules();
    } catch (error) {
      console.error('Failed to unassign module:', error);
    }
  };

  const unviewedCount = modules.filter(m => !m.viewed).length;

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading education modules...</p>
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="mx-auto text-gray-400 mb-4" size={48} />
        <p className="text-gray-500">No education modules assigned yet</p>
        {!isPatientView && (
          <p className="text-gray-400 text-sm mt-2">Assign modules from the Education Library</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Education Modules</h2>
          {unviewedCount > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {unviewedCount} unread module{unviewedCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Module List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map(module => (
          <div
            key={module.assignmentId}
            className={`bg-white border rounded-lg overflow-hidden hover:shadow-lg transition-shadow ${
              !module.viewed && isPatientView ? 'border-moveify-teal border-2' : 'border-gray-200'
            }`}
          >
            {module.imageUrl && (
              <img src={module.imageUrl} alt={module.title} className="w-full h-40 object-cover" />
            )}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 flex-1">{module.title}</h3>
                {module.viewed ? (
                  <div className="flex items-center gap-1 text-green-600 text-sm">
                    <Check size={16} />
                    <span>Read</span>
                  </div>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                    New
                  </span>
                )}
              </div>

              {module.category && (
                <span className="inline-block text-xs bg-primary-100 text-moveify-teal px-2 py-1 rounded mb-2">
                  {module.category}
                </span>
              )}

              {module.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{module.description}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                {module.estimatedDurationMinutes && (
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    <span>{module.estimatedDurationMinutes} min</span>
                  </div>
                )}
                {module.viewedAt && (
                  <span>
                    Read on {new Date(module.viewedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleViewModule(module)}
                  className="flex-1 bg-moveify-teal text-white px-4 py-2 rounded-lg hover:bg-moveify-teal-dark text-sm font-medium"
                >
                  {isPatientView ? 'Read Module' : 'View Module'}
                </button>
                {!isPatientView && (
                  <button
                    onClick={() => handleUnassign(module.id)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
                  >
                    Unassign
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Module Viewer Modal */}
      {selectedModule && (
        <ModuleViewerModal
          module={selectedModule}
          onClose={() => setSelectedModule(null)}
        />
      )}
    </div>
  );
};

// Module Viewer Modal
interface ModuleViewerModalProps {
  module: PatientEducationModule;
  onClose: () => void;
}

const ModuleViewerModal = ({ module, onClose }: ModuleViewerModalProps) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{module.title}</h2>
            {module.category && (
              <span className="inline-block text-sm bg-primary-100 text-moveify-teal px-3 py-1 rounded">
                {module.category}
              </span>
            )}
            {module.estimatedDurationMinutes && (
              <span className="ml-2 text-sm text-gray-500">
                {module.estimatedDurationMinutes} min read
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold ml-4"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {module.imageUrl && (
            <img
              src={module.imageUrl}
              alt={module.title}
              className="w-full max-h-96 object-cover rounded-lg mb-6"
            />
          )}

          {module.videoUrl && (
            <div className="mb-6">
              <a
                href={module.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-moveify-teal hover:text-moveify-teal-dark font-medium"
              >
                <ExternalLink size={18} />
                Watch Video
              </a>
            </div>
          )}

          {module.description && (
            <p className="text-lg text-gray-700 mb-6 leading-relaxed">
              {module.description}
            </p>
          )}

          <div className="prose prose-lg max-w-none">
            <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
              {module.content}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6">
          <button
            onClick={onClose}
            className="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
