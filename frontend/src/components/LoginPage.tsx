import { useState } from 'react';
import type { Patient, UserRole, User } from '../types/index.ts';
import { API_URL } from '../config';
import { ForgotPasswordModal } from './modals/ForgotPasswordModal';

interface LoginPageProps {
  onLogin: (role: UserRole, patient?: Patient, user?: User, token?: string) => void;
}

export const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Helper function to retry fetch with exponential backoff
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 2) => {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (error: unknown) {
        const err = error as Error;
        if (i < maxRetries && (err.name === 'AbortError' || err.message.includes('fetch'))) {
          const delay = Math.min(1000 * Math.pow(2, i), 3000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Max retries exceeded');
  };

  const handleLoginSubmit = async () => {
    setLoginError('');
    setIsLoading(true);

    try {
      const response = await fetchWithRetry(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await response.json();

      if (response.ok) {
        const user = data.user;
        const token = data.token;

        if (user.role === 'patient') {
          // Fetch THIS patient's full data including assigned program
          try {
            const patientController = new AbortController();
            const patientTimeoutId = setTimeout(() => patientController.abort(), 15000);

            const patientResponse = await fetchWithRetry(`${API_URL}/patients/${user.id}`, {
              signal: patientController.signal,
              headers: { 'Authorization': `Bearer ${token}` }
            });

            clearTimeout(patientTimeoutId);

            if (patientResponse.ok) {
              const patientWithProgram = await patientResponse.json();
              onLogin('patient', patientWithProgram, undefined, token);
            } else {
              throw new Error('Failed to fetch patient data');
            }
          } catch {
            // Fallback: create patient object without program
            const patient: Patient = {
              id: user.id,
              name: user.name,
              email: user.email,
              dob: user.dob || '',
              age: user.dob ? (() => { const d = new Date(user.dob), t = new Date(), a = t.getFullYear() - d.getFullYear(), m = t.getMonth() - d.getMonth(); return (m < 0 || (m === 0 && t.getDate() < d.getDate())) ? a - 1 : a; })() : 0,
              condition: user.condition || '',
              phone: user.phone || '',
              address: user.address || '',
              dateAdded: user.created_at,
              assignedPrograms: []
            };
            onLogin('patient', patient, undefined, token);
          }
        } else {
          // Clinician login
          const clinicianUser: User = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: 'clinician',
            isAdmin: !!user.is_admin
          };
          onLogin('clinician', undefined, clinicianUser, token);
        }
      } else {
        setLoginError(data.error || 'Invalid email or password');
      }
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        setLoginError('Login timed out. The server may be slow or unavailable. Please try again.');
      } else if (err.message === 'Max retries exceeded') {
        setLoginError('Connection failed after multiple attempts. Please check your internet connection.');
      } else {
        setLoginError('Connection error. Please make sure the server is running and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-9 w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/assets/moveify-logo.png"
            alt="Moveify Logo"
            className="h-14 w-auto mx-auto mb-6"
          />
          <h1 className="text-lg font-semibold font-display text-secondary-500 tracking-tight">Sign in to Moveify</h1>
          <p className="text-sm text-slate-500 mt-1">Enter your credentials to continue</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary-400 focus:ring-primary-400/30 cursor-pointer"
            />
            <span className="text-sm text-slate-500">Remember me for 7 days</span>
          </label>

          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {loginError}
            </div>
          )}

          <button
            onClick={handleLoginSubmit}
            disabled={isLoading}
            className="w-full bg-primary-400 hover:bg-primary-500 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-1"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a href="/privacy-policy" className="text-xs text-slate-400 hover:text-slate-500 transition-colors">
            Privacy Policy
          </a>
          <span className="text-xs text-slate-300 mx-1.5">|</span>
          <a href="/terms" className="text-xs text-slate-400 hover:text-slate-500 transition-colors">
            Terms and Conditions
          </a>
        </div>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
};
