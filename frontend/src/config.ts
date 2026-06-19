// API Configuration
// In production, use VITE_API_URL environment variable
// In development, dynamically use current hostname

const getApiUrl = () => {
  // Check for environment variable (set in Vercel)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Fallback for local development - use current hostname
  // WARNING: This fallback uses HTTP — only safe for local development
  const hostname = window.location.hostname;
  if (window.location.protocol === 'https:') {
    console.warn('VITE_API_URL not set — falling back to HTTP API URL. Set VITE_API_URL for production.');
  }
  return `http://${hostname}:3000/api`;
};

export const API_URL = getApiUrl();

// Shared-email login: patients who share a contact email with a spouse sign in
// with a login name instead, which maps to a synthetic account email
// "<name>@login.moveifyapp.com". The login form appends this domain when the
// entered identifier isn't already an email.
// ⚠ Must match backend/lib/login-identity.js LOGIN_USERNAME_DOMAIN.
export const LOGIN_USERNAME_DOMAIN = 'login.moveifyapp.com';

// Turn whatever the user typed into the credential Firebase expects: an email
// stays as-is; a bare login name becomes "<name>@login.moveifyapp.com".
export const toLoginIdentifier = (input: string): string => {
  const trimmed = input.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@${LOGIN_USERNAME_DOMAIN}`;
};
