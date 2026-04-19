import { useEffect, useRef } from 'react';
import { X, Printer, RefreshCw, Pencil } from 'lucide-react';
import type { HandoutSections } from '../../types';

interface HandoutPreviewProps {
  sections: HandoutSections;
  patientFirstName: string;
  assessmentDate: string;
  onClose: () => void;
  onRegenerate: () => void;
}

const TEAL = '#46c1c0';
const NAVY = '#132232';

function cleanText(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^[-•]\s*/gm, '').replace(/\n\s*\n/g, '\n').trim();
}

function formatClinicalContext(raw: string): React.ReactNode {
  const lines = raw.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const findings = lines.map(line => {
    const clean = line.replace(/^[-•*]\s*/, '').replace(/\*/g, '').trim();

    // Primary format: pipe-separated  Test | Value | Interpretation
    const pipes = clean.split('|').map(p => p.trim());
    if (pipes.length >= 3 && pipes[0] && pipes[1]) {
      return { test: pipes[0], value: pipes[1], interpretation: pipes[2] };
    }

    // Fallback: colon-dash format  Test: value — interpretation
    // Strip any "vs normative..." from the value column
    const match = clean.match(/^([^:]+):\s*([^—]+?)\s*—\s*(.+)$/);
    if (match) {
      const rawValue = match[2].trim();
      const value = rawValue.split(/\s+vs\s+/i)[0].trim();
      return { test: match[1].trim(), value, interpretation: match[3].trim() };
    }

    return null;
  }).filter(Boolean) as { test: string; value: string; interpretation: string }[];

  if (findings.length === 0) return null;

  return (
    <table style={{ width: '100%', fontSize: '0.81rem', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: TEAL }}>
          <th style={{ textAlign: 'left', padding: '8px 12px', color: 'white', fontWeight: 700, width: '30%' }}>Test</th>
          <th style={{ textAlign: 'left', padding: '8px 12px', color: 'white', fontWeight: 700, width: '20%' }}>Result</th>
          <th style={{ textAlign: 'left', padding: '8px 12px', color: 'white', fontWeight: 700 }}>Interpretation</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : 'white', borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '9px 12px', fontWeight: 700, color: NAVY }}>{f.test}</td>
            <td style={{ padding: '9px 12px', fontWeight: 600, color: TEAL }}>{f.value || '—'}</td>
            <td style={{ padding: '9px 12px', color: '#475569' }}>{f.interpretation}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HandoutPreview({
  sections,
  patientFirstName,
  assessmentDate,
  onClose,
  onRegenerate,
}: HandoutPreviewProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const foundRef   = useRef<HTMLDivElement>(null);
  const focusRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (foundRef.current) foundRef.current.innerText = cleanText(sections.found);
    if (focusRef.current) focusRef.current.innerText = cleanText(sections.focus);
  }, [sections]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'handout-print-css';
    style.textContent = `
      @page { size: A4; margin: 12mm; }
      @media print {
        html, body { overflow: visible !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
        body * { visibility: hidden !important; }
        #handout-modal-backdrop {
          position: static !important;
          overflow: visible !important;
          height: auto !important;
          background: transparent !important;
          display: block !important;
          padding: 0 !important;
          margin: 0 !important;
          flex-direction: column !important;
          align-items: stretch !important;
          justify-content: flex-start !important;
        }
        #handout-print-root, #handout-print-root * { visibility: visible !important; }
        #handout-print-root {
          position: static !important;
          width: 100% !important;
          max-width: none !important;
          height: auto !important;
          overflow: visible !important;
          background: white !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        [data-no-print] { display: none !important; }
        [contenteditable] { outline: none !important; border: none !important; background: white !important; }
        .print-break-inside { break-inside: avoid; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('handout-print-css')?.remove(); };
  }, []);

  function handlePrint() {
    const bd = backdropRef.current;
    if (!bd) { window.print(); return; }
    const savedCss = bd.style.cssText;
    bd.style.cssText = 'position:static;overflow:visible;height:auto;background:transparent;padding:0;margin:0;display:block;';
    document.body.style.overflow = 'visible';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      const restore = () => {
        bd.style.cssText = savedCss;
        document.body.style.overflow = '';
      };
      window.addEventListener('afterprint', restore, { once: true });
      setTimeout(restore, 3000);
    }));
  }

  // Shared styles
  const font: React.CSSProperties = { fontFamily: 'DM Sans, Arial, sans-serif' };
  const dividerStyle: React.CSSProperties = { borderTop: '1px solid #e5e7eb', margin: '14px 0' };
  const bodyStyle: React.CSSProperties = { ...font, color: NAVY, fontSize: '0.82rem', lineHeight: '1.6' };
  const headingStyle: React.CSSProperties = { ...font, color: TEAL, fontWeight: 800, fontSize: '0.83rem', letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: 0 };
  const subHeadingStyle: React.CSSProperties = { ...font, color: TEAL, fontWeight: 700, fontSize: '0.77rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '5px', marginTop: '12px' };

  // Numbered section card (sections 1–2)
  const sectionCard: React.CSSProperties = {
    borderLeft: `4px solid ${TEAL}`,
    borderRadius: '0 8px 8px 0',
    background: '#f8fafc',
    padding: '14px 16px 14px 14px',
    marginBottom: '12px',
  };
  const sectionCardHeader: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px',
  };
  const badge: React.CSSProperties = {
    width: '22px', height: '22px', borderRadius: '50%',
    background: TEAL, color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
  };
  const editableArea: React.CSSProperties = {
    ...bodyStyle,
    whiteSpace: 'pre-wrap',
    minHeight: '80px',
    padding: '8px 10px',
    background: 'white',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  };
  const tierBlock: React.CSSProperties = {
    border: '1px solid #e2e8f0',
    borderRadius: '8px', padding: '10px 12px', marginBottom: '8px',
    background: 'white', color: NAVY, fontSize: '0.79rem', lineHeight: '1.55',
  };

  return (
    <div
      ref={backdropRef}
      id="handout-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2"
    >
      <div id="handout-print-root" className="bg-white w-full max-w-[210mm] rounded-xl shadow-2xl">

        {/* Toolbar */}
        <div data-no-print className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 rounded-t-xl sticky top-4 z-10 shadow-sm">
          <div>
            <h2 className="font-display font-bold text-secondary-700 text-base">Patient Handout Preview</h2>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Click any text section to edit before printing
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition"
              style={{ background: TEAL }}
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-8 py-6" style={font}>

          {/* Header — letterhead */}
          <table style={{ width: '100%', borderCollapse: 'collapse', paddingBottom: '12px', borderBottom: `2px solid ${TEAL}` }}>
            <tbody>
              <tr>
                <td style={{ width: '42%', verticalAlign: 'middle', paddingRight: '12px', paddingBottom: '12px' }}>
                  <img
                    src="/assets/gp-report-logo.png"
                    alt="Moveify Health Solutions"
                    style={{ height: '40mm', maxHeight: '40mm', objectFit: 'contain', display: 'block' }}
                  />
                </td>
                <td style={{ width: '58%', verticalAlign: 'middle', textAlign: 'right', paddingBottom: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: NAVY, letterSpacing: '0.02em' }}>
                    Exercise Physiology Assessment Summary
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px', fontWeight: 500 }}>
                    {patientFirstName} · {assessmentDate}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '16px' }}>

            {/* Section 1 — What We Found */}
            <div className="print-break-inside" style={sectionCard}>
              <div style={sectionCardHeader}>
                <div style={badge}>1</div>
                <div style={headingStyle}>What We Found</div>
              </div>
              <div
                ref={foundRef}
                contentEditable
                suppressContentEditableWarning
                className="outline-none focus:ring-2 focus:ring-primary-300 rounded"
                style={editableArea}
              />
              {sections.clinicalContext && formatClinicalContext(sections.clinicalContext) && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginTop: '10px' }}>
                  <div style={{ background: NAVY, padding: '8px 12px', fontWeight: 700, color: 'white', fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                    Assessment Results
                  </div>
                  {formatClinicalContext(sections.clinicalContext)}
                </div>
              )}
            </div>

            {/* Section 2 — What We'll Focus On */}
            <div className="print-break-inside" style={sectionCard}>
              <div style={sectionCardHeader}>
                <div style={badge}>2</div>
                <div style={headingStyle}>What We'll Focus On</div>
              </div>
              <div
                ref={focusRef}
                contentEditable
                suppressContentEditableWarning
                className="outline-none focus:ring-2 focus:ring-primary-300 rounded"
                style={editableArea}
              />
            </div>

            <hr style={dividerStyle} />

            {/* Section 3 — Your Options */}
            <div style={{ ...headingStyle, marginBottom: '8px' }}>Section 3 — Your Options</div>
            <div style={subHeadingStyle}>Treatment Blocks — 6 Weeks</div>
            <div style={{ ...bodyStyle, marginBottom: '8px' }}>
              Payment: Weekly direct debit over 6 weeks, or pay in full with 5% discount<br />
              Includes: Unlimited gym access + Moveify app
            </div>

            {(['Foundation', 'Progress', 'Performance'] as const).map(tier => (
              <div key={tier} style={tierBlock}>
                <div style={{ fontWeight: 700, color: NAVY, marginBottom: '3px', fontSize: '0.81rem' }}>
                  {tier === 'Foundation'  && 'Tier 1 — Foundation · $525 ($87.50/week)'}
                  {tier === 'Progress'    && 'Tier 2 — Progress · $695 ($115.83/week)'}
                  {tier === 'Performance' && 'Tier 3 — Performance · $875 ($145.83/week)'}
                </div>
                <div style={bodyStyle}>
                  {tier === 'Foundation' && (
                    <>Sessions: 60-min program design + 6 group sessions + 30-min reassessment + phone check-in<br />
                    Medicare offset: Up to $123.60 back · Net cost from $401.40 ($66.90/week)<br />
                    Pay in full: $498.75 (5% discount)<br />
                    Best for: Stable presentations, general deconditioning, independent patients</>
                  )}
                  {tier === 'Progress' && (
                    <>Sessions: 60-min program design + 5 x 30-min weekly 1:1s + 30-min reassessment<br />
                    Medicare offset: Up to $309 back · Net cost from $386 ($64.33/week)<br />
                    Pay in full: $660.25 (5% discount)<br />
                    Best for: MSK and chronic disease, patients needing regular clinical oversight</>
                  )}
                  {tier === 'Performance' && (
                    <>Sessions: 60-min program design + 5 x 45-min weekly 1:1s + 30-min reassessment<br />
                    Medicare offset: Up to $309 back · Net cost from $566 ($94.33/week)<br />
                    Pay in full: $831.25 (5% discount)<br />
                    Best for: Complex neuro, cardiac, post-surgical, multi-morbidity</>
                  )}
                </div>
              </div>
            ))}

            <div style={subHeadingStyle}>Not Ready to Commit? Casual Options</div>
            <div style={{ ...bodyStyle, marginBottom: '6px' }}>
              If you'd prefer to try a session or two before committing to a block, that's completely fine.
            </div>
            <table style={{ width: '100%', fontSize: '0.79rem', color: NAVY, marginTop: '6px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${TEAL}` }}>
                  <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 700, color: TEAL, width: '45%' }}>Service</th>
                  <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 700, color: TEAL, width: '15%' }}>Fee</th>
                  <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['1:1 Consultation (60 min)', '$170', 'Full program design or complex consultation'],
                  ['1:1 Consultation (45 min)', '$130', 'Standard clinical session'],
                  ['1:1 Consultation (30 min)', '$85', 'Follow-up or program adjustment'],
                  ['Group Session (45-60 min)', '$30', 'Supervised floor session with your program'],
                  ['Phone Check-in (10 min)', '$50', 'Brief clinical check-in'],
                ].map(([name, fee, desc], idx, arr) => (
                  <tr key={name} style={{ borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: '6px 4px', fontWeight: 700, color: TEAL }}>{fee}</td>
                    <td style={{ padding: '6px 0', color: '#64748b', fontSize: '0.77rem' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...bodyStyle, color: '#6b7280', marginTop: '5px', fontSize: '0.74rem' }}>
              Note: If you decide to commit to a treatment block within 7 days of your casual sessions, the fees paid are credited toward your block price.
            </div>

            <hr style={dividerStyle} />

            {/* Section 4 — Medicare & Health Fund */}
            <div style={{ ...headingStyle, marginBottom: '8px' }}>Section 4 — Medicare and Health Fund Offsets</div>
            <div style={subHeadingStyle}>Medicare CDM Rebates</div>
            <div style={bodyStyle}>
              If you have a Chronic Disease Management (CDM) plan from your GP, you are eligible for up to 5 Medicare-rebated allied health sessions per calendar year. Each eligible 1:1 session earns a rebate of $61.80.
            </div>
            <div style={subHeadingStyle}>Private Health Insurance</div>
            <div style={bodyStyle}>
              If you hold extras cover, you may be able to claim a rebate on Exercise Physiology sessions. You cannot claim both Medicare and PHI on the same session.
            </div>

            <hr style={dividerStyle} />

            {/* Section 5 — Next Steps */}
            <div style={{ ...headingStyle, marginBottom: '8px' }}>Section 5 — Next Steps</div>
            <div style={subHeadingStyle}>Ready to Get Started?</div>
            <ul style={{ ...bodyStyle, paddingLeft: '16px', margin: '3px 0 8px' }}>
              <li>Choose your program above and let Ryan know today</li>
              <li>If you'd like to take this home and think it over, that's completely fine</li>
              <li>Questions? Call or email: ryan@moveifyhealth.com</li>
            </ul>

            <hr style={dividerStyle} />

            {/* Footer */}
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.72rem', marginTop: '8px', ...font }}>
              Moveify Health Solutions · ryan@moveifyhealth.com · 0435 524 991<br />
              ABN 52 263 141 529 · 4 George St, Williamstown SA
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
