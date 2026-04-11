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

function cleanText(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/gm, '').trim();
}

export default function ReportPreview({ sections, patientName, sessionDate, onClose, onRegenerate }: ReportPreviewProps) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const goalsRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (summaryRef.current) summaryRef.current.innerText = cleanText(sections.executiveSummary);
    if (goalsRef.current) goalsRef.current.innerText = cleanText(sections.goals);
    if (planRef.current) planRef.current.innerText = cleanText(sections.managementPlan);
  }, [sections]);

  function handlePrint() {
    if (!containerRef.current) return;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    // Capture current DOM state (including any edits user made to contentEditable fields)
    const content = containerRef.current.innerHTML;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>CDMP Report — ${patientName}</title>
  <style>
    @page { size: A4; margin: 15mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: 'DM Sans', Arial, sans-serif; color: ${NAVY}; }
    .report-page { page-break-after: always; padding: 10mm 0; }
    .report-page:last-child { page-break-after: avoid; }
    .report-section { break-inside: avoid; }
    [contenteditable] { outline: none !important; border: none !important; border-bottom: none !important; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 6px 10px; }
  </style>
</head>
<body>${content}</body>
</html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  const objectiveRows = parseObjectiveRows(sections.objectiveAssessment);

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
    padding: '1px 4px',
  };

  const footerStyle: React.CSSProperties = {
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.7rem',
    borderTop: `1px solid ${TEAL}`,
    paddingTop: '6px',
    marginTop: '20px',
  };

  const letterheadBlock = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: `3px solid ${TEAL}`, marginBottom: '20px' }}>
      <img src="/assets/moveify-logo-dark.png" alt="Moveify Health Solutions" style={{ height: '38px', objectFit: 'contain' }} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: NAVY, fontWeight: 900, fontSize: '0.95rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          INITIAL CONSULTATION REPORT
        </div>
        <div style={{ color: TEAL, fontWeight: 600, fontSize: '0.76rem', letterSpacing: '0.06em', marginTop: '2px' }}>
          Exercise Physiology &nbsp;·&nbsp; Allied Health
        </div>
      </div>
    </div>
  );

  const pageFooter = (
    <div style={footerStyle}>
      Moveify Health Solutions &nbsp;·&nbsp; Exercise Physiology &nbsp;·&nbsp; Allied Health<br />
      Ryan Heath &nbsp;|&nbsp; AEP &nbsp;|&nbsp; ryan@moveifyhealth.com &nbsp;|&nbsp; ABN: 52 263 141 529
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2">

      {/* Modal toolbar */}
      <div className="w-full max-w-[210mm]">
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 rounded-t-xl sticky top-4 z-10">
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

        {/* Report content — preview only, print via new window */}
        <div ref={containerRef} className="bg-white" style={{ fontFamily: 'DM Sans, sans-serif' }}>

          {/* ── PAGE 1: Cover Letter ── */}
          <div className="report-page px-10 py-8" style={{ minHeight: '250mm', borderBottom: '2px dashed #e5e7eb' }}>
            {letterheadBlock}

            {/* GP address block */}
            <div style={{ ...bodyStyle, lineHeight: '2', marginBottom: '20px' }}>
              <div>
                Dr&nbsp;
                <span contentEditable suppressContentEditableWarning style={editableFieldStyle}>Doctor Name</span>
              </div>
              <div>
                <span contentEditable suppressContentEditableWarning style={{ ...editableFieldStyle, minWidth: '200px' }}>Practice Name</span>
              </div>
              <div>
                <span contentEditable suppressContentEditableWarning style={{ ...editableFieldStyle, minWidth: '250px' }}>Address</span>
              </div>
              <div>{sessionDate}</div>
            </div>

            {/* Salutation */}
            <div style={{ ...bodyStyle, marginBottom: '14px' }}>
              Dear Dr <span contentEditable suppressContentEditableWarning style={{ ...editableFieldStyle, minWidth: '100px' }}>Surname</span>,
            </div>

            {/* Cover paragraph */}
            <div style={{ ...bodyStyle, marginBottom: '14px' }}>
              Thank you sincerely for referring <strong>{patientName}</strong> to Moveify Health Solutions for Exercise Physiology services under the Chronic Disease Management (CDM) Plan. Please find below the report and recommendations following their Initial Consultation on {sessionDate}.
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

            {pageFooter}
          </div>

          {/* ── PAGE 2: Clinical Report ── */}
          <div className="report-page px-10 py-8">
            {letterheadBlock}

            {/* Patient Details */}
            <div style={sectionHeadingStyle}>Patient Details</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '4px' }}>
              <tbody>
                {([
                  ['Patient Name', patientName],
                  ['Date of Birth', ''],
                  ['Referring GP', ''],
                  ['Practice', ''],
                  ['Referral Date', ''],
                  ['CDM Sessions', ''],
                ] as [string, string][]).map(([label, value]) => (
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
              <div ref={summaryRef} contentEditable suppressContentEditableWarning style={{ ...editableStyle, minHeight: '80px' }} />
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
              <div ref={goalsRef} contentEditable suppressContentEditableWarning style={{ ...editableStyle, minHeight: '80px' }} />
            </div>

            {/* Management Plan */}
            <div className="report-section">
              <div style={sectionHeadingStyle}>Management Plan</div>
              <div ref={planRef} contentEditable suppressContentEditableWarning style={{ ...editableStyle, minHeight: '80px' }} />
            </div>

            {pageFooter}
          </div>

        </div>
      </div>
    </div>
  );
}
