import { useState } from 'react';
import type { Patient, UserRole, User } from '../types/index.ts';
import { API_URL } from '../config';
import { ForgotPasswordModal } from './modals/ForgotPasswordModal';

interface LoginPageProps {
  onLogin: (role: UserRole, patient?: Patient, user?: User) => void;
}

export const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Helper function to retry fetch with exponential backoff
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 2) => {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (error: any) {
        // If it's a timeout or network error, and we have retries left, try again
        if (i < maxRetries && (error.name === 'AbortError' || error.message.includes('fetch'))) {
          const delay = Math.min(1000 * Math.pow(2, i), 3000); // 1s, 2s, max 3s
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
      // Add timeout for slow networks (20 seconds per attempt)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetchWithRetry(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        // Login successful
        const user = data.user;

        if (user.role === 'patient') {
          // Fetch THIS patient's full data including assigned program (more efficient)
          try {
            const patientController = new AbortController();
            const patientTimeoutId = setTimeout(() => patientController.abort(), 15000);

            const patientResponse = await fetchWithRetry(`${API_URL}/patients/${user.id}`, {
              signal: patientController.signal
            });

            clearTimeout(patientTimeoutId);

            if (patientResponse.ok) {
              const patientWithProgram = await patientResponse.json();
              onLogin('patient', patientWithProgram);
            } else {
              throw new Error('Failed to fetch patient data');
            }
          } catch (patientError) {
            console.warn('Failed to fetch patient program, logging in with basic data:', patientError);
            // Fallback: create patient object without program
            const patient: Patient = {
              id: user.id,
              name: user.name,
              email: user.email,
              dob: user.dob || '',
              age: user.dob ? new Date().getFullYear() - new Date(user.dob).getFullYear() : 0,
              condition: user.condition || '',
              phone: user.phone || '',
              address: user.address || '',
              dateAdded: user.created_at,
              assignedPrograms: []
            };
            onLogin('patient', patient);
          }
        } else {
          // Clinician login - pass user data
          const clinicianUser: User = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: 'clinician'
          };
          onLogin('clinician', undefined, clinicianUser);
        }
      } else {
        setLoginError(data.error || 'Invalid email or password');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.name === 'AbortError') {
        setLoginError('Login timed out. The server may be slow or unavailable. Please try again.');
      } else if (error.message === 'Max retries exceeded') {
        setLoginError('Connection failed after multiple attempts. Please check your internet connection.');
      } else {
        setLoginError('Connection error. Please make sure the server is running and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-moveify-teal/10 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md border border-gray-100">
        <div className="text-center mb-10">
          <div className="inline-block mb-4">
            <img
              src="/assets/moveify-logo.png"
              alt="Moveify Logo"
              className="h-24 w-auto mx-auto"
            />
          </div>
          <p className="text-moveify-navy text-lg font-medium">Sign in to your account</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLoginSubmit()}
              placeholder="your@email.com"
              className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLoginSubmit()}
              placeholder="••••••••"
              className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-moveify-teal focus:border-moveify-teal shadow-sm transition-all"
            />
          </div>

          {loginError && (
            <div className="bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300 text-red-800 px-5 py-4 rounded-xl font-medium shadow-sm">
              {loginError}
            </div>
          )}

          <button
            onClick={handleLoginSubmit}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-moveify-teal to-moveify-ocean text-white py-4 rounded-xl hover:from-moveify-teal-dark hover:to-moveify-ocean font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-moveify-teal hover:text-moveify-teal-dark font-medium text-sm"
            >
              Forgot password?
            </button>
          </div>
        </div>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
};
