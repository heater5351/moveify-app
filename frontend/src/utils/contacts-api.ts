/**
 * Contacts API wrapper — shared contacts directory + patient links.
 * Directory CRUD lives at /api/contacts; patient links at
 * /api/patients/:patientId/contacts. All calls attach the (async) auth header.
 */
import { API_URL } from '../config';
import { getAuthHeaders } from './api';
import type { Contact, ContactType, PatientContactLink } from '../types';

// Fields a clinician can edit on a directory contact (id/timestamps excluded).
export type ContactInput = {
  contactType: ContactType;
  title?: string;
  name: string;
  organisation?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

async function jsonHeaders(): Promise<Record<string, string>> {
  return { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error || fallback;
}

// --- Directory --------------------------------------------------------------

export async function listContacts(opts: { q?: string; type?: ContactType } = {}): Promise<Contact[]> {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.type) params.set('type', opts.type);
  const qs = params.toString();
  const res = await fetch(`${API_URL}/contacts${qs ? `?${qs}` : ''}`, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(await readError(res, 'Failed to load contacts'));
  return (await res.json()).contacts as Contact[];
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const res = await fetch(`${API_URL}/contacts`, {
    method: 'POST', headers: await jsonHeaders(), body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to create contact'));
  return res.json();
}

export async function updateContact(id: number, input: ContactInput): Promise<Contact> {
  const res = await fetch(`${API_URL}/contacts/${id}`, {
    method: 'PUT', headers: await jsonHeaders(), body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to update contact'));
  return res.json();
}

export async function deleteContact(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/contacts/${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(await readError(res, 'Failed to delete contact'));
}

// --- Patient links ----------------------------------------------------------

export async function getPatientContacts(patientId: number): Promise<PatientContactLink[]> {
  const res = await fetch(`${API_URL}/patients/${patientId}/contacts`, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(await readError(res, 'Failed to load contacts'));
  return (await res.json()).contacts as PatientContactLink[];
}

export type LinkContactPayload = {
  contactId?: number;          // link an existing directory contact…
  contact?: ContactInput;      // …or create-and-link a new one
  relationship?: string;
  isReportRecipient?: boolean;
  isEmergency?: boolean;
};

export async function linkContact(patientId: number, payload: LinkContactPayload): Promise<PatientContactLink> {
  const res = await fetch(`${API_URL}/patients/${patientId}/contacts`, {
    method: 'POST', headers: await jsonHeaders(), body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to link contact'));
  return res.json();
}

export async function updatePatientContact(
  patientId: number,
  linkId: number,
  patch: { relationship?: string; isReportRecipient?: boolean; isEmergency?: boolean },
): Promise<PatientContactLink> {
  const res = await fetch(`${API_URL}/patients/${patientId}/contacts/${linkId}`, {
    method: 'PUT', headers: await jsonHeaders(), body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to update contact link'));
  return res.json();
}

export async function unlinkContact(patientId: number, linkId: number): Promise<void> {
  const res = await fetch(`${API_URL}/patients/${patientId}/contacts/${linkId}`, {
    method: 'DELETE', headers: await getAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to unlink contact'));
}

// Human-readable labels for contact types (shared by directory + patient UI).
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  gp: 'GP / referring doctor',
  specialist: 'Specialist',
  support_coordinator: 'Support coordinator',
  guardian: 'Parent / guardian',
  other: 'Other',
};
