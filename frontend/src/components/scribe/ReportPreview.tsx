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

// Exact colours from GP_Report_Template.docx
const NAVY   = '#132232';
const TEAL   = '#46C1C0';
const LABEL  = '#D0EEEE'; // patient details label cells
const ROW_BG = '#E8F7F7'; // objective assessment rows

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
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          background: white !important;
          padding: 0 !important;
        }
        [data-no-print] { display: none !important; }
        [contenteditable] { outline: none !important; border: none !important; border-bottom: none !important; }
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

    // Temporarily remove overflow/fixed so content flows across pages
    const savedCss = bd.style.cssText;
    bd.style.cssText = 'position:static;overflow:visible;height:auto;background:transparent;padding:8px 0;display:block;';
    document.body.style.overflow = 'visible';

    // Double rAF ensures browser repaints with new layout before print dialog opens
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      const restore = () => {
        bd.style.cssText = savedCss;
        document.body.style.overflow = '';
      };
      window.addEventListener('afterprint', restore, { once: true });
      setTimeout(restore, 3000); // fallback
    }));
  }

  const objectiveRows = parseObjectiveRows(sections.objectiveAssessment);

  const font: React.CSSProperties = { fontFamily: "'DM Sans', Arial, sans-serif" };

  const bodyText: React.CSSProperties = {
    ...font,
    fontSize: '0.84rem',
    color: NAVY,
    lineHeight: '1.65',
  };

  const editable: React.CSSProperties = {
    ...bodyText,
    whiteSpace: 'pre-wrap',
    minHeight: '56px',
    padding: '8px 10px',
    outline: 'none',
  };

  const editableField: React.CSSProperties = {
    ...bodyText,
    display: 'inline-block',
    borderBottom: '1px dashed #94a3b8',
    minWidth: '160px',
    outline: 'none',
    padding: '1px 4px',
  };

  const sectionHeading: React.CSSProperties = {
    ...font,
    background: NAVY,
    color: 'white',
    fontWeight: 700,
    fontSize: '0.8rem',
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    padding: '7px 12px',
    marginBottom: '0',
  };

  // Header: logo left (38%), title right (62%), both white
  const Header = () => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
      <tbody>
        <tr>
          <td style={{ width: '38%', padding: '6px 12px 6px 0', verticalAlign: 'middle' }}>
            <img src="/assets/gp-report-logo.png" alt="Moveify Health Solutions" style={{ height: '45mm', maxHeight: '45mm', objectFit: 'contain', display: 'block' }} />
          </td>
          <td style={{ width: '62%', padding: '6px 0 6px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
            <div style={{ ...font, fontWeight: 800, fontSize: '1rem', color: NAVY, letterSpacing: '0.05em' }}>
              INITIAL CONSULTATION REPORT
            </div>
            <div style={{ ...font, fontSize: '0.78rem', color: '#555555', marginTop: '3px' }}>
              Exercise Physiology &nbsp;·&nbsp; Allied Health
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );

  const Footer = () => (
    <div style={{ ...font, fontSize: '0.7rem', color: '#666666', textAlign: 'center', marginTop: '24px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }}>
      Moveify Health Solutions &nbsp;·&nbsp; Exercise Physiology &nbsp;·&nbsp; Allied Health &nbsp;&nbsp;|&nbsp;&nbsp;
      Ryan Heath &nbsp;·&nbsp; AEP &nbsp;·&nbsp; 0435 524 991 &nbsp;·&nbsp; ryan@moveifyhealth.com &nbsp;·&nbsp; ABN: 52 263 141 529
    </div>
  );

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

        {/* ─────── PRINTABLE CONTENT ─────── */}
        <div id="report-print-root" className="bg-white" style={font}>

          {/* ══ PAGE 1: Cover Letter ══ */}
          <div className="rpt-page-break" style={{ padding: '14mm 16mm 10mm' }}>
            <Header />

            {/* GP address */}
            <div style={{ ...bodyText, lineHeight: '1.9', marginBottom: '18px' }}>
              <div>Dr&nbsp;<span contentEditable suppressContentEditableWarning style={editableField}>Doctor Name</span></div>
              <div><span contentEditable suppressContentEditableWarning style={{ ...editableField, minWidth: '220px' }}>Practice Name</span></div>
              <div><span contentEditable suppressContentEditableWarning style={{ ...editableField, minWidth: '280px' }}>Address</span></div>
              <div style={{ marginTop: '6px' }}>{sessionDate}</div>
            </div>

            <p style={{ ...bodyText, marginBottom: '12px' }}>
              Dear Dr <span contentEditable suppressContentEditableWarning style={{ ...editableField, minWidth: '110px' }}>Surname</span>,
            </p>

            <p style={{ ...bodyText, marginBottom: '12px' }}>
              Thank you sincerely for referring <strong>{patientName}</strong> to Moveify Health Solutions for Exercise Physiology services under the GPMP/CDM Plan. Please find below the report and recommendations following their Initial Consultation on {sessionDate}.
            </p>

            <p style={{ ...bodyText, marginBottom: '36px' }}>
              Should you have any questions or queries, please do not hesitate to contact me on 0435 524 991 or ryan@moveifyhealth.com
            </p>

            <p style={{ ...bodyText, marginBottom: '4px' }}>Yours sincerely,</p>
            <p style={{ ...bodyText, marginBottom: '2px' }}><strong>Ryan Heath</strong></p>
            <p style={{ ...bodyText, marginBottom: '2px' }}>Accredited Exercise Physiologist</p>
            <p style={{ ...bodyText }}>BclinExPhys (Hons)</p>

            <Footer />
          </div>

          {/* ══ PAGE 2: Clinical Report ══ */}
          <div style={{ padding: '14mm 16mm 10mm' }}>
            <Header />

            {/* PATIENT DETAILS */}
            <div style={sectionHeading}>PATIENT DETAILS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
              <tbody>
                {([
                  ['Patient Name', patientName, 'Date of Birth', ''],
                  ['Referring GP', '',           'Practice',      ''],
                  ['Referral Date', '',           'CDM Sessions',  ''],
                ] as [string, string, string, string][]).map(([l1, v1, l2, v2], i) => (
                  <tr key={i}>
                    <td style={{ background: LABEL, color: NAVY, ...font, fontWeight: 700, fontSize: '0.76rem', padding: '6px 10px', width: '18%' }}>{l1}</td>
                    <td style={{ background: 'white', ...bodyText, padding: '6px 10px', width: '32%' }}>
                      <span contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block', minHeight: '16px' }}>{v1}</span>
                    </td>
                    <td style={{ background: LABEL, color: NAVY, ...font, fontWeight: 700, fontSize: '0.76rem', padding: '6px 10px', width: '18%' }}>{l2}</td>
                    <td style={{ background: 'white', ...bodyText, padding: '6px 10px', width: '32%' }}>
                      <span contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block', minHeight: '16px' }}>{v2}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* EXECUTIVE SUMMARY */}
            <div className="rpt-avoid-break">
              <div style={sectionHeading}>EXECUTIVE SUMMARY</div>
              <div ref={summaryRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* OBJECTIVE ASSESSMENT */}
            <div className="rpt-avoid-break">
              <div style={sectionHeading}>OBJECTIVE ASSESSMENT</div>
              {objectiveRows.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
                  <thead>
                    <tr>
                      <th style={{ background: TEAL, color: 'white', ...font, fontWeight: 700, fontSize: '0.76rem', padding: '7px 10px', textAlign: 'left', width: '26%' }}>Test</th>
                      <th style={{ background: TEAL, color: 'white', ...font, fontWeight: 700, fontSize: '0.76rem', padding: '7px 10px', textAlign: 'left', width: '18%' }}>Result</th>
                      <th style={{ background: TEAL, color: 'white', ...font, fontWeight: 700, fontSize: '0.76rem', padding: '7px 10px', textAlign: 'left' }}>Interpretation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objectiveRows.map((row, i) => (
                      <tr key={i} style={{ background: ROW_BG }}>
                        <td style={{ ...bodyText, padding: '6px 10px', fontWeight: 600 }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.test}</span>
                        </td>
                        <td style={{ ...bodyText, padding: '6px 10px' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.result}</span>
                        </td>
                        <td style={{ ...bodyText, padding: '6px 10px' }}>
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
            <div className="rpt-avoid-break">
              <div style={sectionHeading}>GOALS</div>
              <div ref={goalsRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* PLAN */}
            <div className="rpt-avoid-break">
              <div style={sectionHeading}>PLAN</div>
              <div ref={planRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            <Footer />
          </div>

        </div>{/* end report-print-root */}
      </div>
    </div>
  );
}
