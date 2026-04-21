import { useEffect, useRef } from 'react';
import { X, Printer, RefreshCw } from 'lucide-react';
import type { ReportSections } from '../../types';

interface ReportPreviewProps {
  type: 'cdmp';
  sections: ReportSections;
  patientName: string;
  sessionDate: string;
  onClose: () => void;
  onRegenerate: () => void;
}

const NAVY  = '#132232';
const TEAL  = '#46C1C0';
const LABEL = '#D0EEEE'; // patient details label cell background

function cleanText(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/gm, '').trim();
}

function parseObjectiveRows(raw: string): { test: string; result: string; interpretation: string }[] {
  return raw.split('\n')
    .filter(l => l.trim() && l.includes('|'))
    .map(l => {
      const parts = l.split('|').map(p => p.trim());
      return { test: parts[0] || '', result: parts[1] || '', interpretation: parts[2] || '' };
    });
}

export default function ReportPreview({
  sections, patientName, sessionDate, onClose, onRegenerate,
}: ReportPreviewProps) {
  const backdropRef  = useRef<HTMLDivElement>(null);
  const summaryRef   = useRef<HTMLDivElement>(null);
  const goalsRef     = useRef<HTMLDivElement>(null);
  const planRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (summaryRef.current) summaryRef.current.innerText = cleanText(sections.executiveSummary);
    if (goalsRef.current)   goalsRef.current.innerText   = cleanText(sections.goals);
    if (planRef.current)    planRef.current.innerText    = cleanText(sections.managementPlan);
  }, [sections]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'report-print-css';
    style.textContent = `
      @page { size: A4 portrait; margin: 15mm 18mm; }
      @media print {
        html, body { overflow: visible !important; height: auto !important; }
        body * { visibility: hidden !important; }
        #report-print-root, #report-print-root * { visibility: visible !important; }
        #report-print-root {
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important; height: auto !important;
          overflow: visible !important;
          background: white !important; padding: 0 !important;
        }
        [data-no-print] { display: none !important; }
        [contenteditable] { outline: none !important; border: none !important; }
        .rpt-page-break { page-break-after: always !important; }
        .rpt-avoid-break { break-inside: avoid; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('report-print-css')?.remove(); };
  }, []);

  function handlePrint() {
    const bd = backdropRef.current;
    if (!bd) { window.print(); return; }
    const savedCss = bd.style.cssText;
    bd.style.cssText = 'position:static;overflow:visible;height:auto;background:transparent;padding:8px 0;display:block;';
    document.body.style.overflow = 'visible';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      const restore = () => { bd.style.cssText = savedCss; document.body.style.overflow = ''; };
      window.addEventListener('afterprint', restore, { once: true });
      setTimeout(restore, 3000);
    }));
  }

  const font: React.CSSProperties = { fontFamily: "'DM Sans', Arial, sans-serif" };

  const bodyText: React.CSSProperties = {
    ...font, fontSize: '0.84rem', color: NAVY, lineHeight: '1.65',
  };

  const editable: React.CSSProperties = {
    ...bodyText, whiteSpace: 'pre-wrap', minHeight: '56px', padding: '8px 10px', outline: 'none',
  };

  const editableField: React.CSSProperties = {
    ...bodyText, display: 'inline-block',
    borderBottom: '1px dashed #94a3b8', minWidth: '160px',
    outline: 'none', padding: '1px 4px',
  };

  // Dark navy banner with centered white uppercase text — matches template exactly
  const sectionBanner: React.CSSProperties = {
    ...font, background: NAVY, color: 'white',
    fontWeight: 700, fontSize: '0.8rem',
    letterSpacing: '0.09em', textTransform: 'uppercase',
    textAlign: 'center', padding: '7px 12px', marginBottom: '0',
  };

  // Header: logo | vertical divider | title — matches template page layout
  const Header = () => (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <tbody>
          <tr>
            {/* Logo */}
            <td style={{ width: '38%', padding: '4px 0', verticalAlign: 'middle' }}>
              <img
                src="/assets/gp-report-logo.png"
                alt="Moveify Health Solutions"
                style={{ height: '40mm', maxHeight: '40mm', objectFit: 'contain', display: 'block' }}
              />
            </td>
            {/* Vertical divider */}
            <td style={{ width: '1px', padding: '0 14px', verticalAlign: 'stretch' }}>
              <div style={{ width: '1px', minHeight: '40mm', background: '#c8d0d8', margin: '0 auto' }} />
            </td>
            {/* Title */}
            <td style={{ padding: '4px 0 4px 14px', verticalAlign: 'middle', textAlign: 'right' }}>
              <div style={{ ...font, fontWeight: 800, fontSize: '1.05rem', color: NAVY, letterSpacing: '0.04em' }}>
                INITIAL CONSULTATION REPORT
              </div>
              <div style={{ ...font, fontSize: '0.8rem', color: TEAL, marginTop: '3px', fontWeight: 500 }}>
                Exercise Physiology
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <hr style={{ border: 'none', borderTop: '1.5px solid #c8d0d8', margin: '0 0 14px 0' }} />
    </>
  );

  const Footer = () => (
    <div style={{ ...font, fontSize: '0.7rem', color: '#666', textAlign: 'center', marginTop: '20px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }}>
      Moveify Health Solutions &nbsp;·&nbsp; Exercise Physiology &nbsp;&nbsp;|&nbsp;&nbsp;
      0435 524 991 &nbsp;·&nbsp; ryan@moveifyhealth.com &nbsp;·&nbsp; ABN: 52 263 141 529
    </div>
  );

  const objectiveRows = parseObjectiveRows(sections.objectiveAssessment);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2"
    >
      <div className="w-full max-w-[210mm]">

        {/* Toolbar */}
        <div data-no-print className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 rounded-t-xl sticky top-4 z-10 shadow-sm">
          <h2 className="font-display font-bold text-secondary-700 text-base">CDMP Report Preview</h2>
          <div className="flex items-center gap-2">
            <button onClick={onRegenerate} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition" style={{ background: TEAL }}>
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── PRINTABLE CONTENT ─── */}
        <div id="report-print-root" className="bg-white" style={font}>

          {/* ══ PAGE 1: Cover Letter ══ */}
          <div className="rpt-page-break" style={{ padding: '14mm 16mm 10mm' }}>
            <Header />

            {/* GP address block */}
            <div style={{ ...bodyText, lineHeight: '1.85', marginBottom: '20px' }}>
              <div><strong>Dr&nbsp;<span contentEditable suppressContentEditableWarning style={{ ...editableField, fontWeight: 700 }}>Doctor Name</span></strong></div>
              <div><span contentEditable suppressContentEditableWarning style={{ ...editableField, minWidth: '220px' }}>Practice Name</span></div>
              <div><span contentEditable suppressContentEditableWarning style={{ ...editableField, minWidth: '200px' }}>Address</span></div>
              <div><span contentEditable suppressContentEditableWarning style={{ ...editableField, minWidth: '180px' }}>Town Postcode</span></div>
            </div>

            <div style={{ ...bodyText, marginBottom: '20px' }}>{sessionDate}</div>

            <p style={{ ...bodyText, fontWeight: 700, marginBottom: '16px' }}>
              Dear Dr <span contentEditable suppressContentEditableWarning style={{ ...editableField, minWidth: '110px', fontWeight: 400 }}>Surname</span>,
            </p>

            <p style={{ ...bodyText, marginBottom: '14px' }}>
              Thank you sincerely for referring <strong>{patientName}</strong> to Moveify Health Solutions for Exercise Physiology services under the MBS GP Chronic Condition Management Plan. Please find below the report and recommendations following {patientName.split(' ')[0]}'s Initial Consultation on {sessionDate}.
            </p>

            <p style={{ ...bodyText, marginBottom: '40px' }}>
              Should you have any questions or queries, please do not hesitate to contact me on 0435 524 991 or ryan@moveifyhealth.com
            </p>

            <p style={{ ...bodyText, marginBottom: '60px' }}>Yours sincerely,</p>

            <div style={{ ...bodyText }}>
              <div style={{ fontWeight: 700 }}>Ryan Heath</div>
              <div style={{ fontWeight: 700 }}>Accredited Exercise Physiologist</div>
              <div>BclinExPhys (Hons)</div>
            </div>

            <Footer />
          </div>

          {/* ══ PAGE 2+: Clinical Report ══ */}
          <div style={{ padding: '14mm 16mm 10mm' }}>
            <Header />

            {/* PATIENT DETAILS */}
            <div style={sectionBanner}>PATIENT DETAILS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border: '1px solid #d1d5db' }}>
              <tbody>
                {([
                  ['Patient Name', patientName],
                  ['Referring GP', ''],
                  ['Date of Birth', ''],
                  ['Medicare No', ''],
                  ['Referral Date', ''],
                ] as [string, string][]).map(([label, value], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #d1d5db' }}>
                    <td style={{ background: LABEL, color: NAVY, ...font, fontWeight: 700, fontSize: '0.78rem', padding: '7px 12px', width: '35%', borderRight: '1px solid #d1d5db' }}>
                      {label}
                    </td>
                    <td style={{ background: 'white', ...bodyText, padding: '7px 12px' }}>
                      <span contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block', minHeight: '16px' }}>{value}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* EXECUTIVE SUMMARY */}
            <div className="rpt-avoid-break" style={{ marginBottom: '14px' }}>
              <div style={sectionBanner}>EXECUTIVE SUMMARY</div>
              <div ref={summaryRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* OBJECTIVE ASSESSMENT */}
            <div className="rpt-avoid-break" style={{ marginBottom: '14px' }}>
              <div style={sectionBanner}>OBJECTIVE ASSESSMENT</div>
              {objectiveRows.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ background: TEAL, color: 'white', ...font, fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', textAlign: 'left', width: '28%' }}>Test</th>
                      <th style={{ background: TEAL, color: 'white', ...font, fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', textAlign: 'left', width: '18%' }}>Result</th>
                      <th style={{ background: TEAL, color: 'white', ...font, fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', textAlign: 'left' }}>Interpretation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objectiveRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                        <td style={{ ...bodyText, padding: '7px 12px', fontWeight: 700 }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.test}</span>
                        </td>
                        <td style={{ ...bodyText, padding: '7px 12px' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.result}</span>
                        </td>
                        <td style={{ ...bodyText, padding: '7px 12px' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.interpretation}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div contentEditable suppressContentEditableWarning style={editable}>
                  {cleanText(sections.objectiveAssessment)}
                </div>
              )}
            </div>

            {/* GOALS */}
            <div className="rpt-avoid-break" style={{ marginBottom: '14px' }}>
              <div style={sectionBanner}>GOALS</div>
              <div ref={goalsRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* RECOMMENDATIONS */}
            <div className="rpt-avoid-break" style={{ marginBottom: '14px' }}>
              <div style={sectionBanner}>RECOMMENDATIONS</div>
              <div ref={planRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            <Footer />
          </div>

        </div>{/* end report-print-root */}
      </div>
    </div>
  );
}
