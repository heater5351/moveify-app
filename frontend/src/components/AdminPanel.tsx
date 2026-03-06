import { useState, useEffect } from 'react';
import { UserPlus, MapPin, Plus, Pencil, Trash2, Shield, ShieldOff } from 'lucide-react';
import type { Clinician, Location } from '../types/index';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';
import { InviteClinicianModal } from './modals/InviteClinicianModal';
import { ConfirmModal } from './modals/ConfirmModal';

type AdminPanelProps = {
  currentUserId: number;
  onNotification: (message: string, type: 'success' | 'error') => void;
};

export const AdminPanel = ({ currentUserId, onNotification }: AdminPanelProps) => {
  const [activeTab, setActiveTab] = useState<'clinicians' | 'locations'>('clinicians');
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Location form
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');

  // Confirm modals
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'clinician' | 'location'; id: number; name: string } | null>(null);

  const fetchClinicians = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/clinicians`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setClinicians(data.clinicians);
      }
    } catch {
      // Silently fail
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/locations`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLocations(data.locations);
      }
    } catch {
      // Silently fail
    }
  };

  useEffect(() => {
    Promise.all([fetchClinicians(), fetchLocations()]).finally(() => setLoading(false));
  }, []);

  const handleToggleAdmin = async (clinicianId: number) => {
    try {
      const res = await fetch(`${API_URL}/admin/clinicians/${clinicianId}/toggle-admin`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        await fetchClinicians();
        onNotification(data.message, 'success');
      } else {
        onNotification(data.error || 'Failed to update admin status', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const handleDeleteClinician = async (id: number) => {
    setConfirmDelete(null);
    try {
      const res = await fetch(`${API_URL}/admin/clinicians/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        await fetchClinicians();
        onNotification('Clinician removed', 'success');
      } else {
        onNotification(data.error || 'Failed to remove clinician', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const handleSaveLocation = async () => {
    if (!locationName.trim()) return;

    try {
      const url = editingLocation
        ? `${API_URL}/admin/locations/${editingLocation.id}`
        : `${API_URL}/admin/locations`;
      const method = editingLocation ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: locationName.trim(), address: locationAddress.trim() || null })
      });

      if (res.ok) {
        await fetchLocations();
        setShowLocationForm(false);
        setEditingLocation(null);
        setLocationName('');
        setLocationAddress('');
        onNotification(editingLocation ? 'Location updated' : 'Location created', 'success');
      } else {
        const data = await res.json();
        onNotification(data.error || 'Failed to save location', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const handleDeleteLocation = async (id: number) => {
    setConfirmDelete(null);
    try {
      const res = await fetch(`${API_URL}/admin/locations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await fetchLocations();
        onNotification('Location deleted', 'success');
      } else {
        const data = await res.json();
        onNotification(data.error || 'Failed to delete location', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const startEditLocation = (loc: Location) => {
    setEditingLocation(loc);
    setLocationName(loc.name);
    setLocationAddress(loc.address || '');
    setShowLocationForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold font-display text-secondary-500">Admin Panel</h1>
        <p className="text-sm text-slate-500 mt-1">Manage clinicians and clinic locations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('clinicians')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'clinicians'
              ? 'bg-white text-secondary-500 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Clinicians
        </button>
        <button
          onClick={() => setActiveTab('locations')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'locations'
              ? 'bg-white text-secondary-500 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Locations
        </button>
      </div>

      {/* Clinicians Tab */}
      {activeTab === 'clinicians' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{clinicians.length} clinician{clinicians.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-400 hover:bg-primary-500 rounded-lg transition-colors"
            >
              <UserPlus size={15} />
              Invite Clinician
            </button>
          </div>

          <div className="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clinicians.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-800">{c.name}</span>
                      {c.id === currentUserId && (
                        <span className="ml-2 text-[10px] text-slate-400">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{c.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{c.location_name || '—'}</td>
                    <td className="px-4 py-3">
                      {c.is_admin ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                          Clinician
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.id !== currentUserId && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleAdmin(c.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title={c.is_admin ? 'Remove admin' : 'Make admin'}
                          >
                            {c.is_admin ? <ShieldOff size={15} /> : <Shield size={15} />}
                          </button>
                          <button
                            onClick={() => setConfirmDelete({ type: 'clinician', id: c.id, name: c.name })}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Remove clinician"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Locations Tab */}
      {activeTab === 'locations' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{locations.length} location{locations.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => {
                setEditingLocation(null);
                setLocationName('');
                setLocationAddress('');
                setShowLocationForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-400 hover:bg-primary-500 rounded-lg transition-colors"
            >
              <Plus size={15} />
              Add Location
            </button>
          </div>

          {/* Location form */}
          {showLocationForm && (
            <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4 mb-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">
                {editingLocation ? 'Edit Location' : 'New Location'}
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="e.g. Main Clinic"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                  <input
                    type="text"
                    value={locationAddress}
                    onChange={(e) => setLocationAddress(e.target.value)}
                    placeholder="e.g. 123 Health St"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveLocation}
                  disabled={!locationName.trim()}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-primary-400 hover:bg-primary-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {editingLocation ? 'Update' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowLocationForm(false);
                    setEditingLocation(null);
                    setLocationName('');
                    setLocationAddress('');
                  }}
                  className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {locations.length === 0 ? (
            <div className="bg-white rounded-xl ring-1 ring-slate-200 p-8 text-center">
              <MapPin size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No locations yet. Add your first clinic location.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map(loc => (
                <div key={loc.id} className="bg-white rounded-xl ring-1 ring-slate-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{loc.name}</p>
                    {loc.address && <p className="text-xs text-slate-400 mt-0.5">{loc.address}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditLocation(loc)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ type: 'location', id: loc.id, name: loc.name })}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Clinician Modal */}
      {showInviteModal && (
        <InviteClinicianModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={fetchClinicians}
        />
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${confirmDelete.type === 'clinician' ? 'Clinician' : 'Location'}`}
          message={
            confirmDelete.type === 'clinician'
              ? `Are you sure you want to remove ${confirmDelete.name}? Their account will be permanently deleted.`
              : `Are you sure you want to delete "${confirmDelete.name}"? Clinicians assigned to this location will have their location cleared.`
          }
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
          onConfirm={() =>
            confirmDelete.type === 'clinician'
              ? handleDeleteClinician(confirmDelete.id)
              : handleDeleteLocation(confirmDelete.id)
          }
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
