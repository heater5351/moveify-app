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
