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

export default function ReportPreview({ sections, patientName, sessionDate, onClose, onRegenerate }: ReportPreviewProps) {
  const gpSurnameRef = useRef<HTMLSpanElement>(null);
  const practiceRef = useRef<HTMLSpanElement>(null);
  const addressRef = useRef<HTMLSpanElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const objectiveRef = useRef<HTMLDivElement>(null);
  const goalsRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    if (summaryRef.current) summaryRef.current.innerText = cleanText(sections.executiveSummary);
    if (objectiveRef.current) objectiveRef.current.innerText = cleanText(sections.objectiveAssessment);
    if (goalsRef.current) goalsRef.current.innerText = cleanText(sections.goals);
  }, [sections]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'report-print-css';
    style.textContent = `
      @page { size: A4; margin: 18mm 15mm; }
      @media print {
        html, body { overflow: visible !important; height: auto !important; }
        body * { visibility: hidden !important; }
        #report-modal-backdrop { position: static !important; overflow: visible !important; height: auto !important; background: none !important; display: block !important; padding: 0 !important; }
        #report-print-root, #report-print-root * { visibility: visible !important; }
        #report-print-root { position: static !important; width: 100% !important; max-width: none !important; height: auto !important; overflow: visible !important; background: white !important; box-shadow: none !important; border-radius: 0 !important; }
        #report-print-root [data-no-print] { display: none !important; }
        #report-print-root [contenteditable] { outline: none !important; border: none !important; }
        #report-print-root .print-break-inside { break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById('report-print-css')?.remove(); };
  }, []);

  function cleanText(text: string): string {
    return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\n\s*\n/g, '\n').trim();
  }

  const bodyStyle: React.CSSProperties = { color: NAVY, fontSize: '0.85rem', lineHeight: '1.65' };
  const sectionHeadingStyle: React.CSSProperties = { color: NAVY, fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', marginTop: '16px', borderBottom: `2px solid ${TEAL}`, paddingBottom: '3px' };

  return (
    <div id="report-modal-backdrop" className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2">
      <div id="report-print-root" className="bg-white w-full max-w-[210mm]">

        {/* Modal header */}
        <div data-no-print className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-display font-bold text-secondary-700 text-base">CDMP Report Preview</h2>
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

        {/* Letter content */}
        <div className="px-10 py-8" style={{ color: NAVY, fontFamily: 'DM Sans, sans-serif' }}>

          {/* Letterhead */}
          <div className="mb-6" style={{ paddingBottom: '10px', borderBottom: `3px solid ${TEAL}` }}>
            <div style={{ color: TEAL, fontWeight: 900, fontSize: '1.15rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              MOVEIFY HEALTH SOLUTIONS
            </div>
            <div style={{ color: NAVY, fontSize: '0.78rem', marginTop: '2px' }}>
              Ryan Heath — Accredited Exercise Physiologist &nbsp;·&nbsp; ryan@moveifyhealth.com &nbsp;·&nbsp; 4 George St, Williamstown SA
            </div>
          </div>

          {/* GP address block — all editable */}
          <div style={{ ...bodyStyle, marginBottom: '16px' }}>
            <div>
              Dr&nbsp;
              <span
                ref={gpSurnameRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="[GP Surname]"
                className="outline-none border-b border-dashed border-gray-400 min-w-[80px] inline-block focus:border-primary-400"
              />
            </div>
            <div>
              <span
                ref={practiceRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="[Practice Name]"
                className="outline-none border-b border-dashed border-gray-400 min-w-[160px] inline-block focus:border-primary-400"
              />
            </div>
            <div>
              <span
                ref={addressRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="[Address]"
                className="outline-none border-b border-dashed border-gray-400 min-w-[200px] inline-block focus:border-primary-400"
              />
            </div>
          </div>

          {/* Date */}
          <div style={{ ...bodyStyle, marginBottom: '16px' }}>{today}</div>

          {/* Salutation */}
          <div style={{ ...bodyStyle, marginBottom: '12px' }}>
            Dear Dr&nbsp;
            <span
              contentEditable
              suppressContentEditableWarning
              className="outline-none border-b border-dashed border-gray-400 min-w-[80px] inline-block focus:border-primary-400"
              style={{ minWidth: '80px' }}
            />,
          </div>

          {/* Cover paragraph */}
          <div style={{ ...bodyStyle, marginBottom: '16px' }}>
            I am writing to provide you with a summary of the exercise physiology consultation I conducted with your patient,{' '}
            <strong>{patientName}</strong>, on {sessionDate}. This report outlines the key findings, objective assessment results, and agreed-upon goals from today's session as part of their Chronic Disease Management Plan.
          </div>

          {/* Patient Details */}
          <div style={sectionHeadingStyle}>Patient Details</div>
          <div style={{ ...bodyStyle, marginBottom: '4px' }}>
            <strong>Name:</strong> {patientName}<br />
            <strong>Session Date:</strong> {sessionDate}<br />
            <strong>Referral:</strong> Chronic Disease Management Plan (GP Management Plan + Team Care Arrangement)
          </div>

          {/* Executive Summary */}
          <div style={sectionHeadingStyle}>Executive Summary</div>
          <div
            ref={summaryRef}
            contentEditable
            suppressContentEditableWarning
            className="outline-none focus:ring-1 focus:ring-primary-300 rounded px-1"
            style={{ ...bodyStyle, whiteSpace: 'pre-wrap', minHeight: '60px' }}
          />

          {/* Objective Assessment */}
          <div style={sectionHeadingStyle}>Objective Assessment</div>
          <div
            ref={objectiveRef}
            contentEditable
            suppressContentEditableWarning
            className="outline-none focus:ring-1 focus:ring-primary-300 rounded px-1"
            style={{ ...bodyStyle, whiteSpace: 'pre-wrap', minHeight: '80px' }}
          />

          {/* Goals */}
          <div style={sectionHeadingStyle}>Goals</div>
          <div
            ref={goalsRef}
            contentEditable
            suppressContentEditableWarning
            className="outline-none focus:ring-1 focus:ring-primary-300 rounded px-1"
            style={{ ...bodyStyle, whiteSpace: 'pre-wrap', minHeight: '80px' }}
          />

          {/* Closing */}
          <div style={{ ...bodyStyle, marginTop: '24px' }}>
            Please do not hesitate to contact me should you have any questions regarding this report or your patient's progress.
          </div>
          <div style={{ ...bodyStyle, marginTop: '20px' }}>
            Yours sincerely,<br /><br />
            <strong>Ryan Heath</strong><br />
            Accredited Exercise Physiologist<br />
            Moveify Health Solutions<br />
            ryan@moveifyhealth.com
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.7rem', marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
            Moveify Health Solutions · ABN 52 263 141 529 · 4 George St, Williamstown SA · ryan@moveifyhealth.com
          </div>
        </div>
      </div>
    </div>
  );
}
