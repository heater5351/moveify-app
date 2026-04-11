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

// Exact colours extracted from GP_Report_Template.docx
const NAVY   = '#132232';
const NAVY2  = '#1C2E3D';  // table headers / patient label cells
const TEAL   = '#46C1C0';
const LIGHT  = '#F0FAFA';  // alternating rows (even)
const LIGHT2 = '#FAFEFE';  // alternating rows (odd)
const XLIGHT = '#EBF8F8';  // signature box

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
  const backdropRef = useRef<HTMLDivElement>(null);
  const summaryRef  = useRef<HTMLDivElement>(null);
  const goalsRef    = useRef<HTMLDivElement>(null);
  const planRef     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (summaryRef.current) summaryRef.current.innerText = cleanText(sections.executiveSummary);
    if (goalsRef.current)   goalsRef.current.innerText   = cleanText(sections.goals);
    if (planRef.current)    planRef.current.innerText    = cleanText(sections.managementPlan);
  }, [sections]);

  // Inject print CSS — visibility trick + page break support
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'report-print-css';
    style.textContent = `
      @page { size: A4; margin: 15mm 18mm; }
      @media print {
        html, body { overflow: visible !important; height: auto !important; }
        body * { visibility: hidden !important; }
        #report-print-root, #report-print-root * { visibility: visible !important; }
        #report-print-root {
          position: fixed !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          background: white !important;
        }
        [data-no-print] { display: none !important; }
        [contenteditable] { outline: none !important; border: none !important; border-bottom: none !important; }
        .report-page-break { page-break-after: always !important; }
        .report-section { break-inside: avoid; }
        img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('report-print-css')?.remove(); };
  }, []);

  function handlePrint() {
    const bd = backdropRef.current;
    if (!bd) { window.print(); return; }

    // Temporarily remove overflow/fixed so browser can render full height
    const savedStyle = bd.style.cssText;
    bd.style.cssText = 'position:static;overflow:visible;background:transparent;height:auto;padding:0;display:block;';
    document.body.style.overflow = 'visible';

    window.print();

    const restore = () => {
      bd.style.cssText = savedStyle;
      document.body.style.overflow = '';
    };
    window.addEventListener('afterprint', restore, { once: true });
    // Fallback in case afterprint doesn't fire
    setTimeout(restore, 2000);
  }

  const objectiveRows = parseObjectiveRows(sections.objectiveAssessment);

  const bodyTd: React.CSSProperties = {
    fontFamily: "'DM Sans', Arial, sans-serif",
    fontSize: '0.82rem',
    color: NAVY,
    lineHeight: '1.6',
    padding: '6px 10px',
  };

  const editableBlock: React.CSSProperties = {
    ...bodyTd,
    padding: '8px 10px',
    whiteSpace: 'pre-wrap',
    minHeight: '60px',
    outline: 'none',
  };

  const editableInline: React.CSSProperties = {
    display: 'inline-block',
    fontFamily: "'DM Sans', Arial, sans-serif",
    fontSize: '0.82rem',
    color: NAVY,
    borderBottom: `1px dashed #94a3b8`,
    minWidth: '140px',
    outline: 'none',
    padding: '1px 4px',
  };

  const sectionHeadingTd: React.CSSProperties = {
    background: NAVY,
    color: 'white',
    fontFamily: "'DM Sans', Arial, sans-serif",
    fontWeight: 700,
    fontSize: '0.78rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '6px 10px',
  };

  // Letterhead table — logo LEFT (64%), title RIGHT (36% navy)
  const Letterhead = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
      <tbody>
        <tr>
          <td style={{ width: '64%', background: 'white', padding: '8px 10px 8px 0', verticalAlign: 'middle' }}>
            <img
              src="/assets/cdmp-logo.png"
              alt="Moveify Health Solutions"
              style={{ height: '52px', objectFit: 'contain', display: 'block' }}
            />
          </td>
          <td style={{ width: '36%', background: NAVY, padding: '10px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
            <div style={{ color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.06em', lineHeight: '1.4' }}>
              INITIAL CONSULTATION REPORT
            </div>
            <div style={{ color: TEAL, fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 500, fontSize: '0.72rem', letterSpacing: '0.04em', marginTop: '2px' }}>
              Exercise Physiology &nbsp;·&nbsp; Allied Health
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );

  // Teal divider bar
  const TealBar = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
      <tbody><tr><td style={{ background: TEAL, height: '5px', padding: 0 }} /></tr></tbody>
    </table>
  );

  // Footer bar
  const FooterBar = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
      <tbody>
        <tr>
          <td style={{ background: NAVY, color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontSize: '0.7rem', padding: '7px 12px', textAlign: 'center', letterSpacing: '0.02em' }}>
            Moveify Health Solutions &nbsp;·&nbsp; Exercise Physiology &nbsp;·&nbsp; Allied Health<br />
            <span style={{ fontSize: '0.66rem', opacity: 0.85 }}>
              Ryan Heath &nbsp;|&nbsp; AEP &nbsp;|&nbsp; ryan@moveifyhealth.com &nbsp;|&nbsp; ABN: 52 263 141 529
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2"
    >
      <div className="w-full max-w-[210mm]">

        {/* Toolbar — hidden on print */}
        <div
          data-no-print
          className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 rounded-t-xl sticky top-4 z-10 shadow-sm"
        >
          <h2 className="font-display font-bold text-secondary-700 text-base">CDMP Report Preview</h2>
          <div className="flex items-center gap-2">
            <button onClick={onRegenerate} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition"
              style={{ background: TEAL }}
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─────────── PRINTABLE CONTENT ─────────── */}
        <div id="report-print-root" className="bg-white" style={{ fontFamily: "'DM Sans', Arial, sans-serif" }}>

          {/* ══ PAGE 1: Cover Letter ══ */}
          <div className="report-page-break" style={{ padding: '18mm 0 10mm' }}>
            <Letterhead />
            <TealBar />

            {/* GP address block */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px' }}>
              <tbody>
                <tr>
                  <td style={{ ...bodyTd, padding: '4px 0', lineHeight: '2' }}>
                    <div>Dr&nbsp;<span contentEditable suppressContentEditableWarning style={editableInline}>Doctor Name</span></div>
                    <div><span contentEditable suppressContentEditableWarning style={{ ...editableInline, minWidth: '200px' }}>Practice Name</span></div>
                    <div><span contentEditable suppressContentEditableWarning style={{ ...editableInline, minWidth: '260px' }}>Address</span></div>
                    <div style={{ marginTop: '4px' }}>{sessionDate}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Salutation */}
            <p style={{ ...bodyTd, padding: '0 0 10px', margin: 0 }}>
              Dear Dr <span contentEditable suppressContentEditableWarning style={{ ...editableInline, minWidth: '100px' }}>Surname</span>,
            </p>

            {/* Cover paragraphs */}
            <p style={{ ...bodyTd, padding: '0 0 10px', margin: 0 }}>
              Thank you sincerely for referring <strong>{patientName}</strong> to Moveify Health Solutions for Exercise Physiology services under the Chronic Disease Management (CDM) Plan. Please find below the report and recommendations following their Initial Consultation on {sessionDate}.
            </p>
            <p style={{ ...bodyTd, padding: '0 0 30px', margin: 0 }}>
              Should you have any questions or queries, please do not hesitate to contact me.
            </p>

            {/* Closing */}
            <p style={{ ...bodyTd, padding: '0 0 6px', margin: 0 }}>Yours sincerely,</p>
            <p style={{ ...bodyTd, padding: '0 0 4px', margin: 0 }}><strong>Ryan Heath</strong></p>
            <p style={{ ...bodyTd, padding: '0 0 2px', margin: 0 }}>AEP &nbsp;|&nbsp; Exercise Physiologist</p>
            <p style={{ ...bodyTd, padding: '0 0 2px', margin: 0 }}>Moveify Health Solutions</p>
            <p style={{ ...bodyTd, padding: '0 0 16px', margin: 0 }}>ryan@moveifyhealth.com</p>

            {/* Signature box */}
            <table style={{ width: '50%', borderCollapse: 'collapse', marginBottom: '0' }}>
              <tbody>
                <tr>
                  <td style={{ background: XLIGHT, padding: '16px 14px', color: '#64748b', fontFamily: "'DM Sans', Arial, sans-serif", fontSize: '0.75rem', textAlign: 'center', minHeight: '60px' }}>
                    [ Clinician Signature ]
                  </td>
                </tr>
              </tbody>
            </table>

            <FooterBar />
          </div>

          {/* ══ PAGE 2: Clinical Report ══ */}
          <div style={{ padding: '18mm 0 10mm' }}>
            <Letterhead />
            <TealBar />

            {/* PATIENT DETAILS heading */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
              <tbody><tr><td style={sectionHeadingTd}>PATIENT DETAILS</td></tr></tbody>
            </table>

            {/* Patient details 4-column grid */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
              <tbody>
                {([
                  ['Patient Name', patientName, 'Date of Birth', ''],
                  ['Referring GP', '', 'Practice', ''],
                  ['Referral Date', '', 'CDM Sessions', ''],
                ] as [string, string, string, string][]).map(([l1, v1, l2, v2], i) => (
                  <tr key={i}>
                    <td style={{ width: '14.3%', background: NAVY2, color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 700, fontSize: '0.76rem', padding: '6px 10px' }}>{l1}</td>
                    <td style={{ width: '35.7%', background: i % 2 === 0 ? LIGHT : LIGHT2, ...bodyTd }}>
                      <span contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block', minHeight: '16px' }}>{v1}</span>
                    </td>
                    <td style={{ width: '14.3%', background: NAVY2, color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 700, fontSize: '0.76rem', padding: '6px 10px' }}>{l2}</td>
                    <td style={{ width: '35.7%', background: i % 2 === 0 ? LIGHT : LIGHT2, ...bodyTd }}>
                      <span contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block', minHeight: '16px' }}>{v2}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* EXECUTIVE SUMMARY */}
            <div className="report-section">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody><tr><td style={sectionHeadingTd}>EXECUTIVE SUMMARY</td></tr></tbody>
              </table>
              <div ref={summaryRef} contentEditable suppressContentEditableWarning style={{ ...editableBlock, marginBottom: '8px' }} />
            </div>

            {/* OBJECTIVE ASSESSMENT */}
            <div className="report-section">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody><tr><td style={sectionHeadingTd}>OBJECTIVE ASSESSMENT</td></tr></tbody>
              </table>
              {objectiveRows.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
                  <thead>
                    <tr>
                      {['Test', 'Result', 'Interpretation'].map(h => (
                        <th key={h} style={{ background: NAVY2, color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 700, fontSize: '0.76rem', padding: '7px 10px', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {objectiveRows.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : LIGHT }}>
                        <td style={{ ...bodyTd, fontWeight: 600, width: '28%' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.test}</span>
                        </td>
                        <td style={{ ...bodyTd, width: '18%' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.result}</span>
                        </td>
                        <td style={bodyTd}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.interpretation}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div contentEditable suppressContentEditableWarning style={{ ...editableBlock, marginBottom: '8px' }}>
                  {cleanText(sections.objectiveAssessment)}
                </div>
              )}
            </div>

            {/* GOALS */}
            <div className="report-section">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody><tr><td style={sectionHeadingTd}>GOALS</td></tr></tbody>
              </table>
              <div ref={goalsRef} contentEditable suppressContentEditableWarning style={{ ...editableBlock, marginBottom: '8px' }} />
            </div>

            {/* MANAGEMENT PLAN */}
            <div className="report-section">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody><tr><td style={sectionHeadingTd}>MANAGEMENT PLAN</td></tr></tbody>
              </table>
              <div ref={planRef} contentEditable suppressContentEditableWarning style={{ ...editableBlock, marginBottom: '8px' }} />
            </div>

            <FooterBar />
          </div>

        </div>{/* end report-print-root */}
      </div>
    </div>
  );
}
