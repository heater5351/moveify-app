// AI Assistant SSE streaming utility
// Uses native fetch + ReadableStream (not fetchWithRetry — SSE needs raw stream)
import { API_URL } from '../config';
import { getToken, clearAuth } from './api';

export type AiMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiExerciseMatch = {
  suggested: {
    name: string;
    sets?: number;
    reps?: number;
    prescribedWeight?: number;
    prescribedDuration?: number;
    restDuration?: number;
    instructions?: string;
  };
  matched: {
    name: string;
    exerciseType: string;
    equipment: string | null;
    jointArea: string | null;
    muscleGroup: string | null;
  } | null;
  confidence: 'exact' | 'fuzzy' | 'none';
  score: number;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  dailyUsage: number;
  dailyLimit: number;
};

type StreamCallback = {
  onText: (text: string) => void;
  onExercises: (exercises: AiExerciseMatch[]) => void;
  onDone: (usage: AiUsage) => void;
  onError: (error: string) => void;
};

/**
 * Stream a chat message to the AI assistant via SSE
 */
export async function streamAiChat(
  messages: AiMessage[],
  callbacks: StreamCallback,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken();
  if (!token) {
    callbacks.onError('Not authenticated');
    return;
  }

  const response = await fetch(`${API_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (response.status === 401) {
    clearAuth();
    window.location.href = '/';
    return;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'AI request failed' }));
    callbacks.onError(errorData.error || `Request failed (${response.status})`);
    return;
  }

  if (!response.body) {
    callbacks.onError('No response stream');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();

        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          switch (parsed.type) {
            case 'text':
              callbacks.onText(parsed.text);
              break;
            case 'exercises':
              callbacks.onExercises(parsed.exercises);
              break;
            case 'done':
              callbacks.onDone(parsed.usage);
              break;
            case 'error':
              callbacks.onError(parsed.error);
              break;
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fetch daily AI usage
 */
export async function getAiUsage(): Promise<{ dailyUsage: number; dailyLimit: number }> {
  const token = getToken();
  const response = await fetch(`${API_URL}/ai/usage`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to fetch usage');
  return response.json();
}

export type AiProtocol = {
  id: number;
  name: string;
  content: string;
  category: string | null;
  created_by: number;
  is_global: boolean;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch protocols
 */
export async function getAiProtocols(): Promise<AiProtocol[]> {
  const token = getToken();
  const response = await fetch(`${API_URL}/ai/protocols`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to fetch protocols');
  const data = await response.json();
  return data.protocols;
}

/**
 * Create a protocol
 */
export async function createAiProtocol(protocol: { name: string; content: string; category?: string; isGlobal?: boolean }): Promise<AiProtocol> {
  const token = getToken();
  const response = await fetch(`${API_URL}/ai/protocols`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(protocol),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed' }));
    throw new Error(err.error || 'Failed to create protocol');
  }
  const data = await response.json();
  return data.protocol;
}

/**
 * Update a protocol
 */
export async function updateAiProtocol(id: number, protocol: { name?: string; content?: string; category?: string; isGlobal?: boolean }): Promise<AiProtocol> {
  const token = getToken();
  const response = await fetch(`${API_URL}/ai/protocols/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(protocol),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed' }));
    throw new Error(err.error || 'Failed to update protocol');
  }
  const data = await response.json();
  return data.protocol;
}

/**
 * Delete a protocol
 */
export async function deleteAiProtocol(id: number): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_URL}/ai/protocols/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed' }));
    throw new Error(err.error || 'Failed to delete protocol');
  }
}
