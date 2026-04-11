/**
 * Scribe API wrapper — thin layer over Moveify's auth + fetch.
 * All paths are relative to /scribe (e.g. '/sessions' → '/api/scribe/sessions').
 */
import { API_URL } from '../config';
import { getAuthHeaders } from './api';

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}/scribe${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers as Record<string, string> ?? {}) },
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
): Promise<{ sections: { found: string; focus: string; pathway: string }; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await apiFetch(`/sessions/${sessionId}/handout/generate`, {
      method: 'POST',
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

export async function generateReport(
  sessionId: number,
  type: 'cdmp'
): Promise<{ sections: { executiveSummary: string; objectiveAssessment: string; goals: string }; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await apiFetch(`/sessions/${sessionId}/report/generate`, {
      method: 'POST',
      body: JSON.stringify({ type }),
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
