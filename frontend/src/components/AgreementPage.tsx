import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { API_URL } from '../config';

interface AgreementSection {
  heading: string;
  body?: string[];
  bullets?: string[];
  note?: string;
  subsections?: { subheading: string; body: string[] }[];
}

interface AgreementPart {
  key: string;
  title: string;
  intro?: string;
  sections: AgreementSection[];
}

interface Provider {
  name: string;
  accreditation: string;
  business: string;
  location: string;
  contact: string;
  phone: string;
}

interface Agreement {
  version: string;
  docTitle: string;
  tierLabel: string | null;
  startDate: string | null;
  provider: Provider;
  about: string;
  feesSummary: string | null;
  parts: AgreementPart[];
  signatureNote: string;
}

interface AgreementDetails {
  patientName: string;
  tier: string;
  path: string;
  tierLabel: string | null;
  startDate: string | null;
  agreementVersion: string;
  agreement: Agreement | null;
}

// Renders one structured Part A / Part B section (heading + body + bullets +
// optional subsections), matching the Cliniko agreement layout.
const Section = ({ section }: { section: AgreementSection }) => (
  <div className="mt-5">
    <h3 className="text-sm font-semibold font-display text-secondary-500">{section.heading}</h3>
    {section.body?.map((p, i) => (
      <p key={i} className="mt-1.5 text-sm text-slate-600 leading-relaxed">{p}</p>
    ))}
    {section.bullets && (
      <ul className="mt-2 space-y-1.5">
        {section.bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    )}
    {section.note && (
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{section.note}</p>
    )}
    {section.subsections?.map((sub, i) => (
      <div key={i} className="mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{sub.subheading}</h4>
        {sub.body.map((p, j) => (
          <p key={j} className="mt-1 text-sm text-slate-600 leading-relaxed">{p}</p>
        ))}
      </div>
    ))}
  </div>
);

// Public service-agreement sign page. Reached via an operator-minted tokenised
// link (?token=…). Validates the token, shows the full structured agreement
// (provider header, Part A clinical services, Part B Direct Debit terms), captures
// a typed-name e-signature + consent, then redirects to the Stripe setup-Checkout.
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
      <div className="min-h-dvh bg-slate-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-400" size={28} />
      </div>
    );
  }

  if (loadError || !details) {
    return (
      <div className="min-h-dvh bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm max-w-md w-full p-8 text-center">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={40} />
          <h1 className="text-xl font-bold font-display text-secondary-500 mb-2">Link unavailable</h1>
          <p className="text-slate-500 text-sm">{loadError || 'This agreement link is invalid or has expired.'}</p>
          <p className="text-slate-400 text-xs mt-4">Please contact Moveify Health Solutions for a new link.</p>
        </div>
      </div>
    );
  }

  const a = details.agreement;

  return (
    <div className="min-h-dvh bg-slate-100 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* Masthead */}
        <div className="px-6 sm:px-9 pt-6 pb-4 border-b-2 border-primary-400 flex items-baseline justify-between gap-4 flex-wrap">
          <span className="font-display font-bold text-secondary-500 text-lg">Moveify Health Solutions</span>
          <span className="text-xs text-slate-400">
            {a ? `${a.provider.location} · ${a.provider.phone}` : 'moveifyhealth.com'}
          </span>
        </div>

        {/* Navy banner */}
        <div className="bg-secondary-500 px-6 sm:px-9 py-7 relative">
          <div className="absolute top-0 right-0 h-full w-2 bg-primary-400" />
          <p className="text-primary-400 text-[11px] font-bold tracking-[0.2em] uppercase">Service Agreement</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold font-display text-white leading-tight">
            {a ? a.docTitle : 'Moveify Service Agreement'}
          </h1>
          <p className="mt-2 text-slate-300 text-sm">Version {details.agreementVersion}</p>
        </div>

        <div className="px-6 sm:px-9 py-7">
          {a && (
            <>
              {/* Provider */}
              <div className="text-sm text-slate-600 space-y-0.5">
                <p><span className="text-slate-400">Provider:</span> {a.provider.name}</p>
                <p>{a.provider.accreditation}</p>
                <p>{a.provider.business}</p>
              </div>

              {/* Program summary */}
              <div className="mt-5 bg-primary-50 border border-primary-100 rounded-xl p-4">
                <h2 className="text-sm font-semibold font-display text-secondary-500 mb-2">Your program</h2>
                <dl className="text-sm text-slate-600 space-y-1">
                  {details.patientName && (
                    <div className="flex justify-between gap-4"><dt className="text-slate-400">Client</dt><dd className="font-medium text-slate-800 text-right">{details.patientName}</dd></div>
                  )}
                  <div className="flex justify-between gap-4"><dt className="text-slate-400">Program</dt><dd className="font-medium text-slate-800 text-right">{a.tierLabel || `${details.tier} (${details.path})`}</dd></div>
                  {a.feesSummary && (
                    <div className="flex justify-between gap-4"><dt className="text-slate-400">Fees</dt><dd className="font-medium text-slate-800 text-right">{a.feesSummary}</dd></div>
                  )}
                  {a.startDate && (
                    <div className="flex justify-between gap-4"><dt className="text-slate-400">Start date</dt><dd className="font-medium text-slate-800 text-right">{a.startDate}</dd></div>
                  )}
                </dl>
              </div>

              <p className="mt-5 text-sm text-slate-500 leading-relaxed">{a.about}</p>

              {/* Parts */}
              {a.parts.map((part) => (
                <div key={part.key} className="mt-8">
                  <h2 className="text-lg font-bold font-display text-primary-500 border-b border-slate-100 pb-2">{part.title}</h2>
                  {part.intro && <p className="mt-3 text-sm text-slate-500 leading-relaxed">{part.intro}</p>}
                  {part.sections.map((s, i) => <Section key={i} section={s} />)}
                </div>
              ))}
            </>
          )}

          {/* Signature */}
          <div className="mt-9 border-t border-slate-200 pt-6">
            <h2 className="text-lg font-bold font-display text-secondary-500">Signatures</h2>
            {a && <p className="mt-2 text-sm text-slate-500 leading-relaxed">{a.signatureNote}</p>}
            <label className="block text-sm font-medium text-slate-700 mt-5 mb-2">Type your full name to sign</label>
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
                I have read and understood both Part A (Clinical Services) and Part B (Direct Debit Request Service
                Agreement), and I consent to the collection and handling of my health information in accordance with the
                Moveify Privacy Policy.
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
            <p className="text-xs text-slate-400 mt-3 text-center flex items-center justify-center gap-1.5">
              <ShieldCheck size={13} /> You’ll next set up your Direct Debit (card or bank account) securely with Stripe. No payment is taken yet.
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
    <div className="min-h-dvh bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm max-w-md w-full p-8 text-center">
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
