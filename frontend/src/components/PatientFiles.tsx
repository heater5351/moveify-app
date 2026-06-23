import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, Loader2, FolderOpen, AlertTriangle } from 'lucide-react';
import type { PatientFile } from '../types/index.ts';
import { API_URL } from '../config';
import { getAuthHeaders } from '../utils/api';

interface PatientFilesProps {
  patientId: number;
}

function formatBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export const PatientFiles = ({ patientId }: PatientFilesProps) => {
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/patient-files/${patientId}`, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files || []);
        setConfigured(data.configured !== false);
      } else {
        setError(data.error || 'Failed to load files');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      // getAuthHeaders() sets Content-Type: application/json — drop it so the
      // browser can set the multipart/form-data boundary itself.
      const headers = await getAuthHeaders();
      delete (headers as Record<string, string>)['Content-Type'];
      const res = await fetch(`${API_URL}/patient-files/${patientId}`, { method: 'POST', headers, body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFiles(prev => [data as PatientFile, ...prev]);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (f: PatientFile) => {
    setBusyId(f.id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/patient-files/${patientId}/${f.id}/download`, { headers: await getAuthHeaders() });
      if (!res.ok) { setError('Download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Network error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (f: PatientFile) => {
    setBusyId(f.id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/patient-files/${patientId}/${f.id}`, { method: 'DELETE', headers: await getAuthHeaders() });
      if (res.ok) setFiles(prev => prev.filter(x => x.id !== f.id));
      else setError('Delete failed');
    } catch {
      setError('Network error');
    } finally {
      setBusyId(null);
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
      />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Files</h2>
        {configured && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-primary-400 hover:bg-primary-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 text-sm transition-colors shadow-sm"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? 'Uploading…' : 'Upload file'}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm font-medium text-red-500">{error}</p>
      )}

      {loading ? (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-10 flex justify-center">
          <Loader2 size={22} className="animate-spin text-slate-300" />
        </div>
      ) : !configured ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">File storage isn't set up yet</p>
            <p className="text-sm text-amber-700 mt-1 leading-relaxed">
              Uploads are disabled until the secure storage bucket is configured. Once the
              <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded text-[12px]">PATIENT_FILES_BUCKET</code>
              environment variable is set on the backend, files can be uploaded and downloaded here.
            </p>
          </div>
        </div>
      ) : files.length === 0 ? (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 p-10">
          <div className="max-w-sm mx-auto text-center">
            <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center border border-primary-100 mx-auto mb-4">
              <FolderOpen className="text-primary-400" size={26} />
            </div>
            <p className="text-sm text-slate-500 mb-5">No files uploaded yet. Attach referrals, imaging reports, consent forms, or other documents to this patient's record.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-primary-400 hover:bg-primary-500 text-white px-5 py-2 rounded-lg font-medium inline-flex items-center gap-2 text-sm transition-colors"
            >
              <Upload size={15} />
              Upload first file
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl ring-1 ring-slate-200 divide-y divide-slate-100 overflow-hidden">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText size={17} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{f.filename}</p>
                <p className="text-xs text-slate-400 truncate">
                  {[formatBytes(f.sizeBytes), f.category, f.uploadedByName, formatDate(f.createdAt)].filter(Boolean).join(' · ')}
                </p>
              </div>
              {pendingDeleteId === f.id ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-slate-500 mr-1">Delete?</span>
                  <button
                    onClick={() => setPendingDeleteId(null)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(f)}
                    disabled={busyId === f.id}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(f)}
                    disabled={busyId === f.id}
                    className="p-2 text-slate-500 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Download"
                  >
                    {busyId === f.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  </button>
                  <button
                    onClick={() => setPendingDeleteId(f.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
