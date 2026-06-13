import { useEffect, useRef, useState } from 'react';
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
  kind?: string;
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
  kind?: string;
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

// Dependency-free signature pad. Draws with pointer events (mouse + touch),
// exports a PNG data URL via onChange (null when cleared/empty).
const SignaturePad = ({ onChange }: { onChange: (dataUrl: string | null) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = '#132232';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(dirty.current ? canvasRef.current!.toDataURL('image/png') : null);
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={160}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full h-40 rounded-lg border border-slate-300 bg-white touch-none cursor-crosshair"
      />
      <button type="button" onClick={clear} className="mt-1 text-xs text-slate-400 hover:text-slate-600">
        Clear signature
      </button>
    </div>
  );
};

// Public service-agreement sign page. Reached via an operator-minted tokenised
// link (?token=…). Validates the token, shows the full structured agreement
// (provider header, Part A clinical services, Part B Direct Debit terms), captures
// a drawn signature + typed name + consent + Direct Debit authorisation, then
// redirects to the Stripe setup-Checkout.
export const AgreementPage = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<AgreementDetails | null>(null);
  const [loadError, setLoadError] = useState('');

  const [signedName, setSignedName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [ddAuthorised, setDdAuthorised] = useState(false);
  const [signingAsRep, setSigningAsRep] = useState(false);
  const [capacity, setCapacity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [signedDone, setSignedDone] = useState(false);

  const isNdis = details?.kind === 'ndis';

  const signedDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });

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
    if (!signature) { setSubmitError('Please draw your signature in the box.'); return; }
    if (!consent) { setSubmitError('Please tick the box to confirm you have read the agreement.'); return; }
    if (!isNdis && !ddAuthorised) { setSubmitError('Please confirm the Direct Debit authorisation.'); return; }
    if (isNdis && signingAsRep && !capacity.trim()) { setSubmitError('Please describe your authority to sign (e.g. plan nominee, guardian).'); return; }
    setSubmitting(true);
    try {
      const body = isNdis
        ? { signedName: signedName.trim(), consent: true, signature, signedCapacity: signingAsRep ? capacity.trim() : '' }
        : { signedName: signedName.trim(), consent: true, signature, ddAuthorised: true };
      const res = await fetch(`${API_URL}/agreements/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && isNdis && data.signed) {
        setSignedDone(true);
      } else if (res.ok && data.checkoutUrl) {
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

  if (signedDone) {
    return (
      <div className="min-h-dvh bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm max-w-md w-full p-8 text-center">
          <CheckCircle className="text-green-500 mx-auto mb-4" size={44} />
          <h1 className="text-xl font-bold font-display text-secondary-500 mb-2">Agreement signed</h1>
          <p className="text-slate-500 text-sm">
            Thank you{details.patientName ? `, ${details.patientName.split(' ')[0]}` : ''}. Your NDIS Service Agreement is
            signed and on file with Moveify Health Solutions. A copy can be provided on request — contact the clinic if
            you’d like one sent to you or your plan manager.
          </p>
          <p className="text-slate-400 text-xs mt-4">Moveify Health Solutions</p>
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
            <label className="block text-sm font-medium text-slate-700 mt-5 mb-2">Full name</label>
            <input
              type="text"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              placeholder="Full name"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />

            {isNdis && (
              <div className="mt-4">
                <span className="block text-sm font-medium text-slate-700 mb-2">I am signing as</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSigningAsRep(false)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${!signingAsRep ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    The participant
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigningAsRep(true)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${signingAsRep ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    Authorised representative
                  </button>
                </div>
                {signingAsRep && (
                  <input
                    type="text"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="Your authority to sign — e.g. plan nominee, guardian"
                    className="mt-2 w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent text-sm"
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-4 mb-2">
              <label className="block text-sm font-medium text-slate-700">Signature</label>
              <span className="text-xs text-slate-400">Date: {signedDate}</span>
            </div>
            <SignaturePad onChange={setSignature} />

            <label className="flex items-start gap-3 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-400 focus:ring-primary-400"
              />
              <span className="text-sm text-slate-600">
                {isNdis
                  ? 'I have read and understood this NDIS Service Agreement, including the NDIS short-notice cancellation policy, and I consent to the collection and handling of health information in accordance with the Moveify Privacy Policy and Consent & Pre-Exercise Questionnaire.'
                  : 'I have read and understood both Part A (Clinical Services) and Part B (Direct Debit Request Service Agreement), and I consent to the collection and handling of my health information in accordance with the Moveify Privacy Policy.'}
              </span>
            </label>
            {!isNdis && (
              <label className="flex items-start gap-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ddAuthorised}
                  onChange={(e) => setDdAuthorised(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-400 focus:ring-primary-400"
                />
                <span className="text-sm text-slate-600">
                  I authorise Moveify Health Solutions to debit my nominated account for the fees set out in this
                  agreement, and confirm I am an account holder or authorised signatory on that account.
                </span>
              </label>
            )}

            {submitError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{submitError}</div>
            )}

            <button
              onClick={handleSign}
              disabled={submitting || !signedName.trim() || !signature || !consent || (!isNdis && !ddAuthorised)}
              className="mt-6 w-full px-4 py-3 bg-primary-400 text-white rounded-lg hover:bg-primary-500 font-medium disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 className="animate-spin" size={18} /> {isNdis ? 'Signing…' : 'Setting up…'}</>
                : (isNdis ? 'Agree & sign' : 'Agree & continue to payment setup')}
            </button>
            <p className="text-xs text-slate-400 mt-3 text-center flex items-center justify-center gap-1.5">
              <ShieldCheck size={13} />
              {isNdis
                ? ' Your signed agreement is stored securely with Moveify. No payment details are collected — supports are claimed against your NDIS plan.'
                : ' You’ll next set up your Direct Debit (card or bank account) securely with Stripe. No payment is taken yet.'}
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
