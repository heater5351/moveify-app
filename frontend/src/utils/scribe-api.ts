/**
 * Scribe API wrapper — thin layer over Moveify's auth + fetch.
 * All paths are relative to /scribe (e.g. '/sessions' → '/api/scribe/sessions').
 */
import { API_URL } from '../config';
import { getAuthHeaders } from './api';
import type { ReassessmentData } from '../types';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(await getAuthHeaders()), ...(options.headers as Record<string, string> ?? {}) };
  // FormData must keep the browser-set multipart boundary — getAuthHeaders forces
  // an application/json content-type, which breaks the upload (the server then
  // can't parse it). Drop it so the browser sets multipart/form-data + boundary.
  if (options.body instanceof FormData) delete headers['Content-Type'];
  return fetch(`${API_URL}/scribe${path}`, { ...options, headers });
}

// The backend returns errors as either { error: "msg" } (route handlers) or
// { error: { message } } (global error handler). Coerce both to a readable string.
function errorMessage(body: unknown, fallback: string): string {
  const e = (body as { error?: unknown })?.error;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return fallback;
}

export async function deleteSession(sessionId: number): Promise<void> {
  const res = await apiFetch(`/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to delete session');
  }
}

export async function revertSessionToDraft(sessionId: number): Promise<void> {
  const res = await apiFetch(`/sessions/${sessionId}/revert-draft`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to revert session to draft');
  }
}

export async function generateHandout(
  sessionId: number,
  transcript: string,
  patientFirstName: string,
  assessmentDate: string
): Promise<{ sections: { whatsGoingOn: string; ourAims: string; howWeGetThere: string; whatToExpect: string; clinicalContext?: string }; model: string; grounding?: { missingSex: boolean; missingAge: boolean; hasFindings: boolean } }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await apiFetch(`/sessions/${sessionId}/handout/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, patientFirstName, assessmentDate }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Handout generation failed');
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadReportDocx(sessionId: number, data: Record<string, string>): Promise<void> {
  const res = await apiFetch(`/sessions/${sessionId}/report/docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'DOCX generation failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GP_Report_${data.patientName || 'Patient'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchHandoutDocx(sessionId: number, data: Record<string, string>): Promise<Blob> {
  const res = await apiFetch(`/sessions/${sessionId}/handout/docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'DOCX generation failed');
  }
  return res.blob();
}

// Extract plain text from an uploaded previous report (PDF/DOCX/TXT) for use as
// extra reassessment baseline context. Returns the extracted text.
export async function extractDocumentText(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  // Note: no Content-Type header — the browser sets the multipart boundary.
  const res = await apiFetch('/documents/extract', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(errorMessage(body, 'Could not read the document'));
  }
  return (await res.json()).text as string;
}

export async function generateReassessment(
  sessionId: number,
  baselineSessionId: number | null,
  currentSourceText: string,
  audience: 'patient' | 'gp' = 'patient',
  previousReportText = '',
): Promise<ReassessmentData> {
  const controller = new AbortController();
  // Two findings extractions + the narrative — give it more headroom than the handout.
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await apiFetch(`/sessions/${sessionId}/reassessment/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baselineSessionId, currentSourceText, audience, previousReportText }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Reassessment generation failed');
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function regradeReassessment(
  sessionId: number,
  comparison: string,
  audience: 'patient' | 'gp' = 'patient',
): Promise<{ comparison: string; grounding?: { missingSex: boolean; missingAge: boolean; hasFindings: boolean } }> {
  const res = await apiFetch(`/sessions/${sessionId}/reassessment/regrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comparison, audience }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Re-grade failed');
  }
  return res.json();
}

export async function regenerateReassessmentNarrative(
  sessionId: number,
  comparison: string,
  subjectiveContext: string,
  audience: 'patient' | 'gp' = 'patient',
): Promise<{ progress?: string; nextSteps?: string; resultsSummary?: string; executiveSummary?: string; clinicalInterpretation?: string; recommendations?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await apiFetch(`/sessions/${sessionId}/reassessment/narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comparison, subjectiveContext, audience }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Narrative regeneration failed');
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchReassessmentDocx(sessionId: number, data: Record<string, string>): Promise<Blob> {
  const res = await apiFetch(`/sessions/${sessionId}/reassessment/docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'DOCX generation failed');
  }
  return res.blob();
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── In-session structured assessments (Phase 3) ──────────────────────────────

export interface CatalogMeasure {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** 'presets' → tappable preset grid (ROM); 'keypad' → numeric keypad. */
  input?: 'presets' | 'keypad';
  /** Increment between preset buttons when input === 'presets'. */
  presetStep?: number;
}

export interface AssessmentCatalogEntry {
  key: string;
  displayName: string;
  region: string;
  laterality: 'bilateral' | 'single';
  measures: CatalogMeasure[];
}

export type MeasurementSide = 'left' | 'right' | 'bilateral';

export interface Measurement {
  id: number;
  assessment_key: string;
  side: MeasurementSide;
  measure_key: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

export interface MeasurementPoint { sessionId: number; date: string; value: number; }

export interface MeasurementSeries {
  assessmentKey: string;
  measureKey: string;
  side: MeasurementSide;
  unit: string | null;
  displayName: string;
  points: MeasurementPoint[];
  latestValue: number;
  latestInterpretation: string | null;
  change: { direction: string | null; absChange: number | null; text: string | null } | null;
}

export async function fetchMeasurementSeries(patientId: number): Promise<MeasurementSeries[]> {
  const res = await apiFetch(`/patients/${patientId}/measurements`);
  if (!res.ok) throw new Error('Failed to load measurement trends');
  return (await res.json()).series as MeasurementSeries[];
}

export async function fetchAssessmentCatalog(): Promise<AssessmentCatalogEntry[]> {
  const res = await apiFetch('/assessment-catalog');
  if (!res.ok) throw new Error('Failed to load assessment catalog');
  return (await res.json()).assessments as AssessmentCatalogEntry[];
}

export async function fetchMeasurements(sessionId: number): Promise<Measurement[]> {
  const res = await apiFetch(`/sessions/${sessionId}/measurements`);
  if (!res.ok) throw new Error('Failed to load measurements');
  return (await res.json()).measurements as Measurement[];
}

export async function saveMeasurement(
  sessionId: number,
  body: { assessmentKey: string; measureKey: string; side: MeasurementSide; value: number },
): Promise<Measurement> {
  const res = await apiFetch(`/sessions/${sessionId}/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to save measurement');
  }
  return (await res.json()).measurement as Measurement;
}

export async function deleteMeasurement(sessionId: number, measurementId: number): Promise<void> {
  const res = await apiFetch(`/sessions/${sessionId}/measurements/${measurementId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete measurement');
}

export async function generateReport(
  sessionId: number,
  type: 'cdmp',
  patientName?: string,
  sessionDate?: string,
): Promise<{ sections: { executiveSummary: string; objectiveAssessment: string; goals: string; managementPlan: string }; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await apiFetch(`/sessions/${sessionId}/report/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, patientName, sessionDate }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Report generation failed');
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
