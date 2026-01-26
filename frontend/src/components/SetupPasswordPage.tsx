import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

export const SetupPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [isValidating, setIsValidating] = useState(true);
  const [invitationData, setInvitationData] = useState<{
    email: string;
    name: string;
    role: string;
  } | null>(null);
  const [validationError, setValidationError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setValidationError('No invitation token provided');
      setIsValidating(false);
      return;
    }

    fetch(`${API_URL}/invitations/validate/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setInvitationData({
            email: data.email,
            name: data.name,
            role: data.role
          });
        } else {
          setValidationError(data.error || 'Invalid invitation');
        }
      })
      .catch(() => {
        setValidationError('Failed to validate invitation. Please check your connection.');
      })
      .finally(() => {
        setIsValidating(false);
      });
  }, [token]);

  const handleSubmit = async () => {
    setSubmitError('');

    // Validation
    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/invitations/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await response.json();

      if (response.ok) {
        // Success! Redirect to login
        alert('Password set successfully! You can now login with your email and password.');
        navigate('/');
      } else {
        setSubmitError(data.error || 'Failed to set password');
      }
    } catch (error) {
      setSubmitError('Connection error. Please make sure the server is running.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (validationError || !invitationData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Invalid Invitation</h2>
            <p className="text-gray-600 mb-6">{validationError}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-moveify-teal-dark transition-colors"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-moveify-teal mb-2">Welcome to Moveify!</h1>
          <p className="text-gray-600 mb-4">Set up your password to get started</p>
          <div className="bg-primary-50 border border-blue-200 rounded-lg p-4 text-left">
            <p className="text-sm text-gray-600"><strong>Name:</strong> {invitationData.name}</p>
            <p className="text-sm text-gray-600"><strong>Email:</strong> {invitationData.email}</p>
            <p className="text-sm text-gray-600"><strong>Role:</strong> {invitationData.role}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Create Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Re-enter your password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-moveify-teal focus:border-transparent"
            />
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !password || !confirmPassword}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-moveify-teal-dark font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Setting up...' : 'Set Password & Continue'}
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Already have an account? <a href="/" className="text-moveify-teal hover:underline">Login</a></p>
        </div>
      </div>
    </div>
  );
};
