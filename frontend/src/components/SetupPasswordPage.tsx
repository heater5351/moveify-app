import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  // Password strength checks
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

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

    if (!hasMinLength) {
      setSubmitError('Password must be at least 8 characters');
      return;
    }

    if (!passwordsMatch) {
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
        setSuccess(true);
      } else {
        setSubmitError(data.error || 'Failed to set password');
      }
    } catch {
      setSubmitError('Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isValidating) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-9 w-full max-w-sm text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-primary-400 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (validationError || !invitationData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-9 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold font-display text-secondary-500 mb-2">Invalid Invitation</h2>
          <p className="text-sm text-slate-500 mb-6">{validationError || 'This invitation link is no longer valid. Please contact your clinician for a new one.'}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-primary-400 hover:bg-primary-500 text-white py-2.5 rounded-lg font-medium transition-colors text-sm"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-9 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={24} className="text-green-500" />
          </div>
          <h2 className="text-lg font-semibold font-display text-secondary-500 mb-2">You're all set!</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your password has been created. You can now sign in to access your exercise programs.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-primary-400 hover:bg-primary-500 text-white py-2.5 rounded-lg font-medium transition-colors text-sm"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-9 w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/assets/moveify-logo.png"
            alt="Moveify Logo"
            className="h-14 w-auto mx-auto mb-6"
          />
          <h1 className="text-lg font-semibold font-display text-secondary-500 tracking-tight">
            Welcome, {invitationData.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-1">Create a password to set up your account</p>
        </div>

        <div className="bg-slate-50 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Email</p>
          <p className="text-sm text-slate-700 font-medium">{invitationData.email}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Password strength indicators */}
          {password.length > 0 && (
            <div className="space-y-1.5 px-1">
              <PasswordCheck met={hasMinLength} label="At least 8 characters" />
              <PasswordCheck met={hasUppercase} label="One uppercase letter" />
              <PasswordCheck met={hasNumber} label="One number" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Re-enter your password"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400 transition-all text-slate-900 placeholder:text-slate-400 bg-white text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1.5">Passwords do not match</p>
            )}
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !hasMinLength || !passwordsMatch}
            className="w-full bg-primary-400 hover:bg-primary-500 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-1"
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <a href="/" className="text-primary-400 hover:text-primary-500 font-medium">Sign in</a>
        </div>
      </div>
    </div>
  );
};

function PasswordCheck({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${met ? 'bg-green-500' : 'bg-slate-200'}`}>
        {met && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <span className={`text-xs ${met ? 'text-green-600' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}
