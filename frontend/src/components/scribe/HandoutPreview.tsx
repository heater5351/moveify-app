import { useEffect, useRef } from 'react';
import { X, Printer, RefreshCw } from 'lucide-react';
import type { HandoutSections } from '../../types';

interface HandoutPreviewProps {
  sections: HandoutSections;
  patientFirstName: string;
  assessmentDate: string;
  onClose: () => void;
  onRegenerate: () => void;
}

function formatClinicalContext(raw: string): React.ReactNode {
  const lines = raw.split('\n').filter(l => l.trim());
  const findings = lines.map(line => {
    const cleanLine = line.replace(/^- /, '').trim();
    const match = cleanLine.match(/^([^:]+):\s*([^—]+)\s*—\s*(.+)$/);
    if (match && match[1] && match[2] && match[3]) {
      return { test: match[1].trim(), value: match[2].trim(), interpretation: match[3].trim() };
    }
    return { test: cleanLine, value: '', interpretation: '' };
  });

  return (
    <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: TEAL }}>
          <th style={{ textAlign: 'left', padding: '9px 12px', color: 'white', fontWeight: 700, width: '32%' }}>Test / Measure</th>
          <th style={{ textAlign: 'left', padding: '9px 12px', color: 'white', fontWeight: 700, width: '22%' }}>Your Result</th>
          <th style={{ textAlign: 'left', padding: '9px 12px', color: 'white', fontWeight: 700 }}>What This Means</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : 'white', borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '10px 12px', fontWeight: 700, color: NAVY }}>{f.test}</td>
            <td style={{ padding: '10px 12px', fontWeight: 600, color: TEAL }}>{f.value || '—'}</td>
            <td style={{ padding: '10px 12px', color: '#475569' }}>{f.interpretation || (f.value ? '' : f.test)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TEAL = '#46c1c0';
const NAVY = '#132232';

function detectTier(pathway: string): 'Foundation' | 'Progress' | 'Performance' {
  if (/performance/i.test(pathway)) return 'Performance';
  if (/foundation/i.test(pathway)) return 'Foundation';
  return 'Progress';
}

export default function HandoutPreview({
  sections,
  patientFirstName,
  assessmentDate,
  onClose,
  onRegenerate,
}: HandoutPreviewProps) {
  const recommendedTier = detectTier(sections.pathway);

  const foundRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const pathwayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (foundRef.current) foundRef.current.innerText = cleanText(sections.found);
    if (focusRef.current) focusRef.current.innerText = cleanText(sections.focus);
    if (pathwayRef.current) pathwayRef.current.innerText = cleanText(sections.pathway);
  }, [sections]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'handout-print-css';
    style.textContent = `
      @page { size: A4; margin: 12mm; }
      @media print {
        html, body { overflow: visible !important; height: auto !important; }
        body * { visibility: hidden !important; }
        #handout-modal-backdrop { position: static !important; overflow: visible !important; height: auto !important; background: none !important; display: block !important; padding: 0 !important; }
        #handout-print-root, #handout-print-root * { visibility: visible !important; }
        #handout-print-root { position: static !important; width: 100% !important; max-width: none !important; height: auto !important; overflow: visible !important; background: white !important; box-shadow: none !important; border-radius: 0 !important; }
        #handout-print-root [data-no-print] { display: none !important; }
        #handout-print-root [contenteditable] { outline: none !important; border: none !important; }
        #handout-print-root hr { border-color: #d1d5db !important; }
        #handout-print-root .print-break-inside { break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('handout-print-css')?.remove(); };
  }, []);

  const tierBadge = (tier: 'Foundation' | 'Progress' | 'Performance') => {
    const isRec = tier === recommendedTier;
    return isRec ? (
      <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: TEAL, color: 'white' }}>
        Recommended ★
      </span>
    ) : null;
  };

  const dividerStyle: React.CSSProperties = { borderTop: `1px solid #d1d5db`, margin: '12px 0' };
  const headingStyle: React.CSSProperties = { color: TEAL, fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' };
  const sectionHeadingStyle: React.CSSProperties = { color: TEAL, fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '5px', marginTop: '12px' };
  const bodyStyle: React.CSSProperties = { color: NAVY, fontSize: '0.82rem', lineHeight: '1.6' };
  const contextBoxStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginTop: '12px' };
  const tierBlockStyle = (isRec: boolean): React.CSSProperties => ({
    border: isRec ? `2px solid ${TEAL}` : '1px solid #e5e7eb',
    borderRadius: '8px', padding: '10px 12px', marginBottom: '8px',
    background: isRec ? '#f0fafa' : 'white', color: NAVY, fontSize: '0.79rem', lineHeight: '1.55',
    boxShadow: isRec ? '0 2px 8px rgba(70, 193, 192, 0.15)' : 'none',
  });

  function cleanText(text: string): string {
    return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^[-•]\s*/gm, '').replace(/\n\s*\n/g, '\n').trim();
  }

  return (
    <div id="handout-modal-backdrop" className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2">
      <div id="handout-print-root" className="bg-white w-full max-w-[210mm]">
        <div data-no-print className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-display font-bold text-secondary-700 text-base">Patient Handout Preview</h2>
          <div className="flex items-center gap-2">
            <button onClick={onRegenerate} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition" style={{ background: TEAL }}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-8 py-6" style={{ color: NAVY, fontFamily: 'DM Sans, sans-serif' }}>
          <div className="text-center mb-5" style={{ paddingBottom: '12px', borderBottom: `2px solid ${TEAL}` }}>
            <div style={{ ...headingStyle, fontSize: '1.1rem', letterSpacing: '0.12em', marginBottom: '4px' }}>MOVEIFY HEALTH SOLUTIONS</div>
            <div style={{ color: NAVY, fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.02em' }}>Exercise Physiology Assessment Summary</div>
            <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px', fontWeight: 500 }}>{patientFirstName} · {assessmentDate}</div>
          </div>

          <div className="print-break-inside">
            <div style={headingStyle}>1. What We Found</div>
            <div ref={foundRef} contentEditable suppressContentEditableWarning className="outline-none focus:ring-1 focus:ring-primary-300 rounded px-2" style={{ ...bodyStyle, whiteSpace: 'pre-wrap', minHeight: '80px', marginBottom: '12px' }} />
            {sections.clinicalContext && (
              <div style={contextBoxStyle}>
                <div style={{ background: NAVY, padding: '8px 12px', fontWeight: 700, color: 'white', fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                  📊 Assessment Results
                </div>
                {formatClinicalContext(sections.clinicalContext)}
              </div>
            )}
          </div>

          <hr style={dividerStyle} />

          <div className="print-break-inside">
            <div style={headingStyle}>2. What We'll Focus On</div>
            <div ref={focusRef} contentEditable suppressContentEditableWarning className="outline-none focus:ring-1 focus:ring-primary-300 rounded px-2" style={{ ...bodyStyle, whiteSpace: 'pre-wrap', minHeight: '60px', marginBottom: '12px' }} />
          </div>

          <hr style={dividerStyle} />

          <div className="print-break-inside">
            <div style={headingStyle}>3. Recommended Pathway</div>
            <div ref={pathwayRef} contentEditable suppressContentEditableWarning className="outline-none focus:ring-1 focus:ring-primary-300 rounded px-2" style={{ ...bodyStyle, whiteSpace: 'pre-wrap', minHeight: '50px', marginBottom: '12px' }} />
          </div>

          <hr style={dividerStyle} />

          <div style={headingStyle}>Section 4 — Your Options</div>
          <div style={sectionHeadingStyle}>Gateway Assessment</div>
          <div style={{ ...bodyStyle, marginBottom: '8px' }}>
            Fee: $61.80 · 60 minutes<br />
            Medicare CDM: Bulk billed — $0 out of pocket with GP referral<br />
            Private/PHI: $61.80 (claim PHI rebate where applicable)
          </div>

          <hr style={dividerStyle} />

          <div style={sectionHeadingStyle}>Treatment Blocks — 6 Weeks</div>
          <div style={{ ...bodyStyle, marginBottom: '6px' }}>
            Payment: Weekly direct debit over 6 weeks, or pay in full with 5% discount<br />
            Includes: Unlimited gym access + Moveify app
          </div>

          {(['Foundation', 'Progress', 'Performance'] as const).map(tier => (
            <div key={tier} style={tierBlockStyle(recommendedTier === tier)}>
              <div style={{ fontWeight: 700, color: NAVY }}>
                {tier === 'Foundation' && <>Tier 1 — Foundation · $525 ($87.50/week){tierBadge('Foundation')}</>}
                {tier === 'Progress' && <>Tier 2 — Progress · $695 ($115.83/week)<span className="ml-2 text-xs font-semibold text-gray-500">★ Most common</span>{tierBadge('Progress')}</>}
                {tier === 'Performance' && <>Tier 3 — Performance · $875 ($145.83/week){tierBadge('Performance')}</>}
              </div>
              {tier === 'Foundation' && <>Sessions: 60-min program design + 6 group sessions + 30-min reassessment + phone check-in<br />Medicare offset: Up to $123.60 back · Net cost from $401.40 ($66.90/week)<br />Pay in full: $498.75 (5% discount)<br />Best for: Stable presentations, general deconditioning, independent patients</>}
              {tier === 'Progress' && <>Sessions: 60-min program design + 5 × 30-min weekly 1:1s + 30-min reassessment<br />Medicare offset: Up to $309 back · Net cost from $386 ($64.33/week)<br />Pay in full: $660.25 (5% discount)<br />Best for: MSK and chronic disease, patients needing regular clinical oversight</>}
              {tier === 'Performance' && <>Sessions: 60-min program design + 5 × 45-min weekly 1:1s + 30-min reassessment<br />Medicare offset: Up to $309 back · Net cost from $566 ($94.33/week)<br />Pay in full: $831.25 (5% discount)<br />Best for: Complex neuro, cardiac, post-surgical, multi-morbidity</>}
            </div>
          ))}

          <hr style={dividerStyle} />

          <div style={sectionHeadingStyle}>Not Ready to Commit? Casual Options</div>
          <div style={bodyStyle}>If you'd prefer to try a session or two before committing to a block, that's completely fine.</div>
          <table style={{ width: '100%', fontSize: '0.79rem', color: NAVY, marginTop: '8px', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: `2px solid ${TEAL}` }}>
              <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 700, color: TEAL, width: '45%' }}>Service</th>
              <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 700, color: TEAL, width: '15%' }}>Fee</th>
              <th style={{ padding: '6px 0', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Details</th>
            </tr></thead>
            <tbody>
              {[['1:1 Consultation (60 min)', '$170', 'Full program design or complex consultation'], ['1:1 Consultation (45 min)', '$130', 'Standard clinical session'], ['1:1 Consultation (30 min)', '$85', 'Follow-up or program adjustment'], ['Group Session (45–60 min)', '$30', 'Supervised floor session with your program'], ['Phone Check-in (10 min)', '$50', 'Brief clinical check-in']].map(([name, fee, desc], idx, arr) => (
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

          <div style={headingStyle}>Section 5 — Medicare and Health Fund Offsets</div>
          <div style={sectionHeadingStyle}>Medicare CDM Rebates</div>
          <div style={bodyStyle}>
            If you have a Chronic Disease Management (CDM) plan from your GP, you are eligible for up to 5 Medicare-rebated allied health sessions per calendar year. Each eligible 1:1 session earns a rebate of $61.80.
          </div>
          <div style={sectionHeadingStyle}>Private Health Insurance</div>
          <div style={bodyStyle}>
            If you hold extras cover, you may be able to claim a rebate on Exercise Physiology sessions. You cannot claim both Medicare and PHI on the same session.
          </div>

          <hr style={dividerStyle} />

          <div style={headingStyle}>Section 6 — Next Steps</div>
          <div style={sectionHeadingStyle}>Ready to Get Started?</div>
          <ul style={{ ...bodyStyle, paddingLeft: '16px', margin: '3px 0 8px' }}>
            <li>Choose your program above and let Ryan know today</li>
            <li>If you'd like to take this home and think it over, that's completely fine</li>
            <li>Questions? Call or email: ryan@moveifyhealth.com</li>
          </ul>

          <hr style={dividerStyle} />

          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.72rem', marginTop: '8px' }}>
            Moveify Health Solutions · ryan@moveifyhealth.com<br />
            ABN 52 263 141 529 · 4 George St, Williamstown SA
          </div>
        </div>
      </div>
    </div>
  );
}
