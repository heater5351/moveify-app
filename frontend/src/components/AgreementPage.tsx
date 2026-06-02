import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { API_URL } from '../config';

interface BillingTerms {
  summary: string;
  authorisation: string;
  whenChargesTitle: string;
  whenCharges: string;
}

interface AgreementDetails {
  patientName: string;
  tier: string;
  path: string;
  tierLabel: string | null;
  startDate: string | null;
  agreementVersion: string;
  title: string;
  paragraphs: string[];
  billing: BillingTerms | null;
}

// Public service-agreement sign page. Reached via an operator-minted tokenised
// link (?token=…). Validates the token, shows Part A + a read-only program
// summary, captures a typed-name e-signature + consent, then redirects to the
// Stripe setup-Checkout returned by the backend.
export const AgreementPage = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<AgreementDetails | null>(null);
  const [loadError, setLoadError] = useState('');

  const [signedName, setSignedName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!token) { setLoadError('No agreement token provided.'); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/agreements/validate/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok) setDetails(data);
        else setLoadError(data.error || 'This agreement link is invalid or has expired.');
      } catch {
        setLoadError('Could not load the agreement. Please check your connection.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSign = async () => {
    setSubmitError('');
    if (!signedName.trim()) { setSubmitError('Please type your full name to sign.'); return; }
    if (!consent) { setSubmitError('Please tick the box to confirm you agree.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/agreements/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName: signedName.trim(), consent: true }),
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setSubmitError(data.error || 'Could not submit the agreement. Please contact the clinic.');
        setSubmitting(false);
      }
    } catch {
      setSubmitError('Connection error. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-400" size={28} />
      </div>
    );
  }

  if (loadError || !details) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm max-w-md w-full p-8 text-center">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={40} />
          <h1 className="text-xl font-bold font-display text-secondary-500 mb-2">Link unavailable</h1>
          <p className="text-slate-500 text-sm">{loadError || 'This agreement link is invalid or has expired.'}</p>
          <p className="text-slate-400 text-xs mt-4">Please contact Moveify Health Solutions for a new link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8">
          <h1 className="text-2xl font-bold font-display text-secondary-500">{details.title}</h1>
          <p className="text-xs text-slate-400 mt-1">Version {details.agreementVersion}</p>

          {/* Program summary (read-only) */}
          <div className="mt-6 bg-primary-50 border border-primary-100 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-secondary-500 mb-2">Your program</h2>
            <dl className="text-sm text-slate-600 space-y-1">
              {details.patientName && (
                <div className="flex justify-between"><dt className="text-slate-400">Client</dt><dd className="font-medium text-slate-800">{details.patientName}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-slate-400">Program</dt><dd className="font-medium text-slate-800">{details.tierLabel || `${details.tier} (${details.path})`}</dd></div>
              {details.billing && (
                <div className="flex justify-between gap-4"><dt className="text-slate-400">Fees</dt><dd className="font-medium text-slate-800 text-right">{details.billing.summary}</dd></div>
              )}
              {details.startDate && (
                <div className="flex justify-between"><dt className="text-slate-400">Start date</dt><dd className="font-medium text-slate-800">{details.startDate}</dd></div>
              )}
            </dl>
          </div>

          {/* Part A body */}
          <div className="mt-6 space-y-3 text-sm text-slate-600 leading-relaxed">
            {details.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>

          {/* Payment Authorisation (plan-specific) */}
          {details.billing && (
            <div className="mt-6 border border-slate-200 rounded-lg p-4 bg-slate-50">
              <h2 className="text-sm font-semibold text-secondary-500 mb-2">Payment Authorisation</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{details.billing.authorisation}</p>
              <h3 className="text-sm font-semibold text-secondary-500 mt-4 mb-1">{details.billing.whenChargesTitle}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{details.billing.whenCharges}</p>
            </div>
          )}

          {/* Signature */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Type your full name to sign</label>
            <input
              type="text"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              placeholder="Full name"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-400 focus:ring-primary-400"
              />
              <span className="text-sm text-slate-600">
                I have read and agree to this Service Agreement, and I consent to the collection and handling of my health
                information in accordance with the Moveify Privacy Policy.
              </span>
            </label>

            {submitError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{submitError}</div>
            )}

            <button
              onClick={handleSign}
              disabled={submitting || !signedName.trim() || !consent}
              className="mt-6 w-full px-4 py-3 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="animate-spin" size={18} /> Setting up…</> : 'Agree & continue to payment setup'}
            </button>
            <p className="text-xs text-slate-400 mt-3 text-center">
              You’ll next set up your Direct Debit (card or bank account) securely with Stripe. No payment is taken yet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Stripe redirects here after the setup Checkout (success or cancelled).
export const AgreementResultPage = ({ variant }: { variant: 'success' | 'cancelled' }) => {
  const isSuccess = variant === 'success';
  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm max-w-md w-full p-8 text-center">
        {isSuccess ? (
          <CheckCircle className="text-green-500 mx-auto mb-4" size={44} />
        ) : (
          <AlertCircle className="text-amber-500 mx-auto mb-4" size={44} />
        )}
        <h1 className="text-xl font-bold font-display text-secondary-500 mb-2">
          {isSuccess ? 'You’re all set!' : 'Payment setup not completed'}
        </h1>
        <p className="text-slate-500 text-sm">
          {isSuccess
            ? 'Your agreement is signed and your payment method is saved. Direct Debit payments clear in 2–3 business days; card payments are immediate. Your program will begin as scheduled.'
            : 'Your agreement was signed but payment setup wasn’t finished. Please reopen your link to complete it, or contact the clinic for a new one.'}
        </p>
        <p className="text-slate-400 text-xs mt-4">Moveify Health Solutions</p>
      </div>
    </div>
  );
};
