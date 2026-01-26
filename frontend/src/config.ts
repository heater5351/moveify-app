// API Configuration
// In production, use VITE_API_URL environment variable
// In development, dynamically use current hostname

const getApiUrl = () => {
  // Check for environment variable (set in Vercel)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Fallback for local development - use current hostname
  const hostname = window.location.hostname;
  return `http://${hostname}:3000/api`;
};

export const API_URL = getApiUrl();
