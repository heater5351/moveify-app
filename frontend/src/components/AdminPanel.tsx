import { useState, useEffect } from 'react';
import { UserPlus, MapPin, Plus, Pencil, Trash2, Shield, ShieldOff, Database, Download, AlertTriangle, Check, X, Bug } from 'lucide-react';
import type { Clinician, Location, DataRequest } from '../types/index';

type BugReport = {
  id: number;
  user_id: number;
  category: 'bug' | 'feature' | 'other';
  description: string;
  page: string | null;
  status: 'open' | 'reviewed' | 'resolved';
  admin_notes: string | null;
  reporter_name: string;
  reporter_email: string;
  reporter_role: string;
  created_at: string;
  updated_at: string;
};
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';
import { InviteClinicianModal } from './modals/InviteClinicianModal';
import { ConfirmModal } from './modals/ConfirmModal';

type AdminPanelProps = {
  currentUserId: number;
  onNotification: (message: string, type: 'success' | 'error') => void;
};

export const AdminPanel = ({ currentUserId, onNotification }: AdminPanelProps) => {
  const [activeTab, setActiveTab] = useState<'clinicians' | 'locations' | 'data-requests' | 'bug-reports'>('clinicians');
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Location form
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');

  // Data requests
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ type: 'approve-deletion' | 'execute-deletion'; id: number; name: string } | null>(null);

  // Bug reports
  const [bugReports, setBugReports] = useState<BugReport[]>([]);

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

  const fetchDataRequests = async () => {
    try {
      const res = await fetch(`${API_URL}/data-requests`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDataRequests(data.requests);
      }
    } catch {
      // Silently fail
    }
  };

  const fetchBugReports = async () => {
    try {
      const res = await fetch(`${API_URL}/feedback`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBugReports(data);
      }
    } catch {
      // Silently fail
    }
  };

  const handleUpdateBugReport = async (id: number, status: string) => {
    try {
      const res = await fetch(`${API_URL}/feedback/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        await fetchBugReports();
        onNotification(`Report marked as ${status}`, 'success');
      }
    } catch {
      onNotification('Failed to update report', 'error');
    }
  };

  useEffect(() => {
    Promise.all([fetchClinicians(), fetchLocations(), fetchDataRequests(), fetchBugReports()]).finally(() => setLoading(false));
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

  const handleApproveExport = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/data-requests/${id}/approve`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDataRequests();
        onNotification(data.message, 'success');
      } else {
        onNotification(data.error || 'Failed to approve', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const handleDenyRequest = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/data-requests/${id}/deny`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDataRequests();
        onNotification('Request denied', 'success');
      } else {
        onNotification(data.error || 'Failed to deny', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const handleApproveDeletion = async (id: number) => {
    setConfirmAction(null);
    try {
      const res = await fetch(`${API_URL}/data-requests/${id}/approve`, {
        method: 'PATCH',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDataRequests();
        onNotification(data.message, 'success');
      } else {
        onNotification(data.error || 'Failed to approve', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const handleExecuteDeletion = async (id: number) => {
    setConfirmAction(null);
    try {
      const res = await fetch(`${API_URL}/data-requests/${id}/execute-deletion`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDataRequests();
        onNotification(data.message, 'success');
      } else {
        onNotification(data.error || 'Failed to execute deletion', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const handleDownloadExport = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/data-requests/${id}/download`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition');
        const filename = disposition?.match(/filename="(.+)"/)?.[1] || `export-${id}.json`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        onNotification(data.error || 'Download failed', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-50 text-yellow-600',
      approved: 'bg-blue-50 text-blue-600',
      completed: 'bg-green-50 text-green-600',
      denied: 'bg-red-50 text-red-600',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[status] || 'bg-slate-100 text-slate-500'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
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
        <p className="text-sm text-slate-500 mt-1">Manage clinicians, locations, data requests, and bug reports</p>
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
        <button
          onClick={() => setActiveTab('data-requests')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors relative ${
            activeTab === 'data-requests'
              ? 'bg-white text-secondary-500 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Data Requests
          {dataRequests.filter(r => r.status === 'pending' || r.status === 'approved').length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {dataRequests.filter(r => r.status === 'pending' || r.status === 'approved').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('bug-reports')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors relative ${
            activeTab === 'bug-reports'
              ? 'bg-white text-secondary-500 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Bug Reports
          {bugReports.filter(r => r.status === 'open').length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {bugReports.filter(r => r.status === 'open').length}
            </span>
          )}
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

      {/* Data Requests Tab */}
      {activeTab === 'data-requests' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {dataRequests.length} request{dataRequests.length !== 1 ? 's' : ''}
              {dataRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="text-yellow-600 font-medium">
                  {' '}({dataRequests.filter(r => r.status === 'pending').length} pending)
                </span>
              )}
            </p>
          </div>

          {dataRequests.length === 0 ? (
            <div className="bg-white rounded-xl ring-1 ring-slate-200 p-8 text-center">
              <Database size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No data requests yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl ring-1 ring-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Patient</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Requested</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dataRequests.map(req => (
                    <tr key={req.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-slate-800">{req.patient_name}</span>
                        <span className="block text-xs text-slate-400">{req.patient_email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          req.request_type === 'export' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {req.request_type === 'export' ? <Download size={10} /> : <AlertTriangle size={10} />}
                          {req.request_type === 'export' ? 'Export' : 'Deletion'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(req.status)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(req.requested_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Pending export: approve or deny */}
                          {req.status === 'pending' && req.request_type === 'export' && (
                            <>
                              <button
                                onClick={() => handleApproveExport(req.id)}
                                className="p-1.5 rounded-md text-green-500 hover:bg-green-50 transition-colors"
                                title="Approve export"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                onClick={() => handleDenyRequest(req.id)}
                                className="p-1.5 rounded-md text-red-400 hover:bg-red-50 transition-colors"
                                title="Deny request"
                              >
                                <X size={15} />
                              </button>
                            </>
                          )}

                          {/* Pending deletion: approve (with confirm) or deny */}
                          {req.status === 'pending' && req.request_type === 'deletion' && (
                            <>
                              <button
                                onClick={() => setConfirmAction({ type: 'approve-deletion', id: req.id, name: req.patient_name || 'this patient' })}
                                className="p-1.5 rounded-md text-green-500 hover:bg-green-50 transition-colors"
                                title="Approve deletion"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                onClick={() => handleDenyRequest(req.id)}
                                className="p-1.5 rounded-md text-red-400 hover:bg-red-50 transition-colors"
                                title="Deny request"
                              >
                                <X size={15} />
                              </button>
                            </>
                          )}

                          {/* Approved deletion: execute */}
                          {req.status === 'approved' && req.request_type === 'deletion' && (
                            <button
                              onClick={() => setConfirmAction({ type: 'execute-deletion', id: req.id, name: req.patient_name || 'this patient' })}
                              className="px-3 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                            >
                              Execute Deletion
                            </button>
                          )}

                          {/* Completed export: download */}
                          {req.status === 'completed' && req.request_type === 'export' && (
                            <button
                              onClick={() => handleDownloadExport(req.id)}
                              className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 transition-colors"
                              title="Download export"
                            >
                              <Download size={15} />
                            </button>
                          )}

                          {/* Completed/denied: show status icon */}
                          {(req.status === 'completed' && req.request_type === 'deletion') && (
                            <span className="p-1.5 text-slate-300"><Check size={15} /></span>
                          )}
                          {req.status === 'denied' && (
                            <span className="p-1.5 text-slate-300"><X size={15} /></span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bug Reports Tab */}
      {activeTab === 'bug-reports' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {bugReports.length} report{bugReports.length !== 1 ? 's' : ''}
              {bugReports.filter(r => r.status === 'open').length > 0 && (
                <span className="text-yellow-600 font-medium">
                  {' '}({bugReports.filter(r => r.status === 'open').length} open)
                </span>
              )}
            </p>
          </div>

          {bugReports.length === 0 ? (
            <div className="bg-white rounded-xl ring-1 ring-slate-200 p-8 text-center">
              <Bug size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No bug reports yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bugReports.map(report => (
                <div key={report.id} className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          report.category === 'bug' ? 'bg-red-50 text-red-600' :
                          report.category === 'feature' ? 'bg-amber-50 text-amber-600' :
                          'bg-blue-50 text-blue-600'
                        }`}>
                          {report.category === 'bug' ? 'Bug' : report.category === 'feature' ? 'Feature' : 'Other'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          report.status === 'open' ? 'bg-yellow-50 text-yellow-600' :
                          report.status === 'reviewed' ? 'bg-blue-50 text-blue-600' :
                          'bg-green-50 text-green-600'
                        }`}>
                          {report.status}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">{report.reporter_role}</span>
                      </div>
                      <p className="text-sm text-slate-800 mb-1.5">{report.description}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                        <span>{report.reporter_name} ({report.reporter_email})</span>
                        <span>{new Date(report.created_at).toLocaleDateString()}</span>
                        {report.page && <span>Page: {report.page}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {report.status === 'open' && (
                        <button
                          onClick={() => handleUpdateBugReport(report.id, 'reviewed')}
                          className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                        >
                          Review
                        </button>
                      )}
                      {report.status !== 'resolved' && (
                        <button
                          onClick={() => handleUpdateBugReport(report.id, 'resolved')}
                          className="px-2.5 py-1 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm Data Action Modal */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'approve-deletion' ? 'Approve Deletion Request' : 'Execute Data Deletion'}
          message={
            confirmAction.type === 'approve-deletion'
              ? `Are you sure you want to approve the data deletion request for ${confirmAction.name}? You will still need to execute the deletion separately.`
              : `This will permanently delete all health data for ${confirmAction.name} and anonymize their account. This action CANNOT be undone.`
          }
          confirmText={confirmAction.type === 'approve-deletion' ? 'Approve' : 'Delete All Data'}
          cancelText="Cancel"
          type="danger"
          onConfirm={() =>
            confirmAction.type === 'approve-deletion'
              ? handleApproveDeletion(confirmAction.id)
              : handleExecuteDeletion(confirmAction.id)
          }
          onCancel={() => setConfirmAction(null)}
        />
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
