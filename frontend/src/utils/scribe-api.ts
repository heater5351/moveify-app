/**
 * Scribe API wrapper — thin layer over Moveify's auth + fetch.
 * All paths are relative to /scribe (e.g. '/sessions' → '/api/scribe/sessions').
 */
import { API_URL } from '../config';
import { getAuthHeaders } from './api';
import type { ReassessmentData } from '../types';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}/scribe${path}`, {
    ...options,
    headers: { ...(await getAuthHeaders()), ...(options.headers as Record<string, string> ?? {}) },
  });
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

export async function generateReassessment(
  sessionId: number,
  baselineSessionId: number,
  currentSourceText: string,
  audience: 'patient' | 'gp' = 'patient',
): Promise<ReassessmentData> {
  const controller = new AbortController();
  // Two findings extractions + the narrative — give it more headroom than the handout.
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await apiFetch(`/sessions/${sessionId}/reassessment/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baselineSessionId, currentSourceText, audience }),
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
