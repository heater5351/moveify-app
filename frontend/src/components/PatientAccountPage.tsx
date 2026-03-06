import { useState, useEffect } from 'react';
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Stethoscope, Download, Trash2, Clock, CheckCircle, XCircle, UserPen } from 'lucide-react';
import type { Patient, DataRequest } from '../types/index';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';

type PatientAccountPageProps = {
  patient: Patient;
  onBack: () => void;
  onEditProfile: () => void;
  onNotification: (message: string, type: 'success' | 'error') => void;
};

export const PatientAccountPage = ({ patient, onBack, onEditProfile, onNotification }: PatientAccountPageProps) => {
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [dataRequestLoading, setDataRequestLoading] = useState(false);

  const fetchMyDataRequests = async () => {
    try {
      const response = await fetch(`${API_URL}/data-requests/my`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setDataRequests(data.requests);
      }
    } catch {
      // Silently fail
    }
  };

  useEffect(() => {
    fetchMyDataRequests();
  }, []);

  const handleRequestData = async (type: 'export' | 'deletion') => {
    setDataRequestLoading(true);
    try {
      const response = await fetch(`${API_URL}/data-requests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ requestType: type })
      });
      const data = await response.json();
      if (response.ok) {
        await fetchMyDataRequests();
        onNotification(`${type === 'export' ? 'Export' : 'Deletion'} request submitted`, 'success');
      } else {
        onNotification(data.error || 'Failed to submit request', 'error');
      }
    } catch {
      onNotification('Connection error', 'error');
    } finally {
      setDataRequestLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 pb-8">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Profile Card */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-400 flex items-center justify-center text-xl font-bold text-white shrink-0">
              {patient.name?.[0]?.toUpperCase() || 'P'}
            </div>
            <div>
              <h2 className="text-lg font-semibold font-display text-secondary-500">{patient.name}</h2>
              <p className="text-xs text-slate-400">Patient</p>
            </div>
          </div>
          <button
            onClick={onEditProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <UserPen size={15} />
            Edit
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail size={15} className="text-slate-400 shrink-0" />
            <span className="text-slate-700">{patient.email}</span>
          </div>
          {patient.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">{patient.phone}</span>
            </div>
          )}
          {patient.address && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">{patient.address}</span>
            </div>
          )}
          {patient.dob && (
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">
                {new Date(patient.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          )}
          {patient.condition && (
            <div className="flex items-center gap-3 text-sm">
              <Stethoscope size={15} className="text-slate-400 shrink-0" />
              <span className="text-slate-700">{patient.condition}</span>
            </div>
          )}
        </div>
      </div>

      {/* Data Rights */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Your Data Rights</h3>
        <p className="text-xs text-slate-500 mb-4">
          Under the Australian Privacy Act, you can request a copy or deletion of your health data.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => handleRequestData('export')}
            disabled={dataRequestLoading || dataRequests.some(r => r.request_type === 'export' && (r.status === 'pending' || r.status === 'approved'))}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} className="text-blue-500 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-blue-800">Request Data Export</p>
              <p className="text-[11px] text-blue-600 mt-0.5">Get a copy of all your data</p>
            </div>
          </button>

          <button
            onClick={() => {
              if (confirm('Are you sure you want to request deletion of all your health data? This cannot be undone once processed.')) {
                handleRequestData('deletion');
              }
            }}
            disabled={dataRequestLoading || dataRequests.some(r => r.request_type === 'deletion' && (r.status === 'pending' || r.status === 'approved'))}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={18} className="text-red-500 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-red-800">Request Data Deletion</p>
              <p className="text-[11px] text-red-600 mt-0.5">Permanently delete your data</p>
            </div>
          </button>
        </div>

        {/* Request History */}
        {dataRequests.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Request History</h4>
            <div className="space-y-1.5">
              {dataRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    {req.request_type === 'export' ? (
                      <Download size={14} className="text-blue-400" />
                    ) : (
                      <Trash2 size={14} className="text-red-400" />
                    )}
                    <span className="text-sm text-slate-700">
                      {req.request_type === 'export' ? 'Export' : 'Deletion'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(req.requested_at).toLocaleDateString()}
                    </span>
                  </div>
                  {req.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-50 text-yellow-600">
                      <Clock size={9} /> Pending
                    </span>
                  )}
                  {req.status === 'approved' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">
                      <CheckCircle size={9} /> Approved
                    </span>
                  )}
                  {req.status === 'completed' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-600">
                      <CheckCircle size={9} /> Completed
                    </span>
                  )}
                  {req.status === 'denied' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">
                      <XCircle size={9} /> Denied
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
