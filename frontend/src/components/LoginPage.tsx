import { useState } from 'react';
import type { Patient, UserRole, User } from '../types/index.ts';
import { API_URL } from '../config';

interface LoginPageProps {
  onLogin: (role: UserRole, patient?: Patient, user?: User) => void;
}

export const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginSubmit = async () => {
    setLoginError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        // Login successful
        const user = data.user;

        if (user.role === 'patient') {
          // Fetch patient's full data including assigned program
          const patientResponse = await fetch(`${API_URL}/patients`);
          const patientsData = await patientResponse.json();

          // Find this patient in the list (which includes their program)
          const patientWithProgram = patientsData.patients.find((p: Patient) => p.id === user.id);

          if (patientWithProgram) {
            onLogin('patient', patientWithProgram);
          } else {
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
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Connection error. Please make sure the server is running.');
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
        </div>

        <div className="mt-8 text-center bg-gradient-to-r from-gray-50 to-primary-50 rounded-xl p-5 border border-gray-200">
          <p className="text-sm font-semibold text-gray-700 mb-3">Demo Accounts:</p>
          <div className="space-y-2 text-sm text-gray-600">
            <p><span className="font-medium text-gray-800">Clinician:</span> clinician@physitrack.com / clinic123</p>
            <p><span className="font-medium text-gray-800">Patient:</span> sarah.j@email.com / patient123</p>
          </div>
        </div>
      </div>
    </div>
  );
};
