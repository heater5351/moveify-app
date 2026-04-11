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

const TEAL = '#46c1c0';
const NAVY = '#132232';

function parseObjectiveRows(raw: string): { test: string; result: string; interpretation: string }[] {
  return raw.split('\n')
    .filter(l => l.trim() && l.includes('|'))
    .map(l => {
      const parts = l.split('|').map(p => p.trim());
      return { test: parts[0] || '', result: parts[1] || '', interpretation: parts[2] || '' };
    });
}

export default function ReportPreview({ sections, patientName, sessionDate, onClose, onRegenerate }: ReportPreviewProps) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const goalsRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);

  function cleanText(text: string): string {
    return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/gm, '').trim();
  }

  useEffect(() => {
    if (summaryRef.current) summaryRef.current.innerText = cleanText(sections.executiveSummary);
    if (goalsRef.current) goalsRef.current.innerText = cleanText(sections.goals);
    if (planRef.current) planRef.current.innerText = cleanText(sections.managementPlan);
  }, [sections]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'report-print-css';
    style.textContent = `
      @page { size: A4; margin: 15mm 18mm; }
      @media print {
        html, body {
          overflow: visible !important;
          height: auto !important;
          width: auto !important;
        }
        body * { visibility: hidden !important; }
        #report-modal-backdrop {
          position: fixed !important;
          inset: 0 !important;
          overflow: visible !important;
          background: none !important;
          display: block !important;
          padding: 0 !important;
          height: auto !important;
        }
        #report-print-root, #report-print-root * {
          visibility: visible !important;
        }
        #report-print-root {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          max-width: none !important;
          height: auto !important;
          overflow: visible !important;
          background: white !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
        }
        #report-print-root [data-no-print] { display: none !important; }
        #report-print-root [contenteditable] { outline: none !important; border: none !important; border-bottom: none !important; }
        .report-page { page-break-after: always; }
        .report-page:last-child { page-break-after: avoid; }
        .report-section { break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('report-print-css')?.remove(); };
  }, []);

  const objectiveRows = parseObjectiveRows(sections.objectiveAssessment);

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    paddingBottom: '10px',
    borderBottom: `3px solid ${TEAL}`,
    marginBottom: '20px',
  };

  const bodyStyle: React.CSSProperties = { color: NAVY, fontSize: '0.84rem', lineHeight: '1.65' };

  const sectionHeadingStyle: React.CSSProperties = {
    color: 'white',
    background: NAVY,
    fontWeight: 700,
    fontSize: '0.78rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    marginBottom: '8px',
    marginTop: '16px',
  };

  const editableStyle: React.CSSProperties = {
    ...bodyStyle,
    whiteSpace: 'pre-wrap',
    minHeight: '60px',
    padding: '4px 2px',
    outline: 'none',
  };

  const editableFieldStyle: React.CSSProperties = {
    ...bodyStyle,
    display: 'inline-block',
    borderBottom: `1px dashed #94a3b8`,
    minWidth: '140px',
    outline: 'none',
    padding: '1px 2px',
  };

  const footerStyle: React.CSSProperties = {
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.7rem',
    borderTop: `1px solid ${TEAL}`,
    paddingTop: '6px',
    marginTop: '20px',
  };

  return (
    <div id="report-modal-backdrop" className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2">
      <div id="report-print-root" className="bg-white w-full max-w-[210mm]">

        {/* Modal toolbar — hidden on print */}
        <div data-no-print className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="font-display font-bold text-secondary-700 text-base">CDMP Report Preview</h2>
          <div className="flex items-center gap-2">
            <button onClick={onRegenerate} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition" style={{ background: TEAL }}>
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── PAGE 1: Cover Letter ── */}
        <div className="report-page px-10 py-8" style={{ fontFamily: 'DM Sans, sans-serif', minHeight: '257mm' }}>

          {/* Letterhead */}
          <div style={headerStyle}>
            <div style={{ color: NAVY, fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              INITIAL CONSULTATION REPORT
            </div>
            <div style={{ color: TEAL, fontWeight: 600, fontSize: '0.82rem', letterSpacing: '0.06em', marginTop: '2px' }}>
              Exercise Physiology &nbsp;·&nbsp; Allied Health
            </div>
          </div>

          {/* GP address block — all editable */}
          <div style={{ ...bodyStyle, lineHeight: '2', marginBottom: '20px' }}>
            <div contentEditable suppressContentEditableWarning style={editableFieldStyle} data-no-print-border>Dr </div>
            <span contentEditable suppressContentEditableWarning style={editableFieldStyle}>Doctor Name</span><br />
            <span contentEditable suppressContentEditableWarning style={{ ...editableFieldStyle, minWidth: '200px' }}>Practice Name</span><br />
            <span contentEditable suppressContentEditableWarning style={{ ...editableFieldStyle, minWidth: '250px' }}>Address</span><br />
            <span>{sessionDate}</span>
          </div>

          {/* Salutation */}
          <div style={{ ...bodyStyle, marginBottom: '14px' }}>
            Dear Dr <span contentEditable suppressContentEditableWarning style={{ ...editableFieldStyle, minWidth: '100px' }}>Surname</span>,
          </div>

          {/* Cover paragraph */}
          <div style={{ ...bodyStyle, marginBottom: '14px' }}>
            Thank you sincerely for referring{' '}
            <strong>{patientName}</strong>{' '}
            to Moveify Health Solutions for Exercise Physiology services under the Chronic Disease Management (CDM) Plan. Please find below the report and recommendations following their Initial Consultation on {sessionDate}.
          </div>
          <div style={{ ...bodyStyle, marginBottom: '40px' }}>
            Should you have any questions or queries, please do not hesitate to contact me.
          </div>

          {/* Closing */}
          <div style={bodyStyle}>
            Yours sincerely,<br /><br /><br />
            <strong>Ryan Heath</strong><br />
            Accredited Exercise Physiologist (AEP)<br />
            Moveify Health Solutions<br />
            ryan@moveifyhealth.com
          </div>

          {/* Page footer */}
          <div style={footerStyle}>
            Moveify Health Solutions &nbsp;·&nbsp; Exercise Physiology &nbsp;·&nbsp; Allied Health<br />
            Ryan Heath &nbsp;|&nbsp; AEP &nbsp;|&nbsp; ryan@moveifyhealth.com &nbsp;|&nbsp; ABN: 52 263 141 529
          </div>
        </div>

        {/* ── PAGE 2: Clinical Report ── */}
        <div className="report-page px-10 py-8" style={{ fontFamily: 'DM Sans, sans-serif' }}>

          {/* Letterhead repeated */}
          <div style={headerStyle}>
            <div style={{ color: NAVY, fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              INITIAL CONSULTATION REPORT
            </div>
            <div style={{ color: TEAL, fontWeight: 600, fontSize: '0.82rem', letterSpacing: '0.06em', marginTop: '2px' }}>
              Exercise Physiology &nbsp;·&nbsp; Allied Health
            </div>
          </div>

          {/* Patient Details */}
          <div style={sectionHeadingStyle}>Patient Details</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '4px' }}>
            <tbody>
              {[
                ['Patient Name', patientName],
                ['Date of Birth', ''],
                ['Referring GP', ''],
                ['Practice', ''],
                ['Referral Date', ''],
                ['CDM Sessions', ''],
              ].map(([label, value]) => (
                <tr key={label} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '5px 10px', fontWeight: 700, color: NAVY, width: '35%', background: '#f8fafc' }}>{label}</td>
                  <td style={{ padding: '5px 10px', color: NAVY }}>
                    <span contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block', minHeight: '18px' }}>
                      {value}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Executive Summary */}
          <div className="report-section">
            <div style={sectionHeadingStyle}>Executive Summary</div>
            <div
              ref={summaryRef}
              contentEditable
              suppressContentEditableWarning
              style={{ ...editableStyle, minHeight: '80px' }}
            />
          </div>

          {/* Objective Assessment */}
          <div className="report-section">
            <div style={sectionHeadingStyle}>Objective Assessment</div>
            {objectiveRows.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: TEAL }}>
                    <th style={{ textAlign: 'left', padding: '7px 10px', color: 'white', fontWeight: 700, width: '30%' }}>Test</th>
                    <th style={{ textAlign: 'left', padding: '7px 10px', color: 'white', fontWeight: 700, width: '20%' }}>Result</th>
                    <th style={{ textAlign: 'left', padding: '7px 10px', color: 'white', fontWeight: 700 }}>Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {objectiveRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#f8fafc' : 'white' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: NAVY }}>
                        <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.test}</span>
                      </td>
                      <td style={{ padding: '6px 10px', color: TEAL, fontWeight: 600 }}>
                        <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.result}</span>
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.interpretation}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div contentEditable suppressContentEditableWarning style={{ ...editableStyle, minHeight: '60px' }}>
                {cleanText(sections.objectiveAssessment)}
              </div>
            )}
          </div>

          {/* Goals */}
          <div className="report-section">
            <div style={sectionHeadingStyle}>Goals</div>
            <div
              ref={goalsRef}
              contentEditable
              suppressContentEditableWarning
              style={{ ...editableStyle, minHeight: '80px' }}
            />
          </div>

          {/* Management Plan */}
          <div className="report-section">
            <div style={sectionHeadingStyle}>Management Plan</div>
            <div
              ref={planRef}
              contentEditable
              suppressContentEditableWarning
              style={{ ...editableStyle, minHeight: '80px' }}
            />
          </div>

          {/* Page footer */}
          <div style={footerStyle}>
            Moveify Health Solutions &nbsp;·&nbsp; Exercise Physiology &nbsp;·&nbsp; Allied Health<br />
            Ryan Heath &nbsp;|&nbsp; AEP &nbsp;|&nbsp; ryan@moveifyhealth.com &nbsp;|&nbsp; ABN: 52 263 141 529
          </div>
        </div>

      </div>
    </div>
  );
}
