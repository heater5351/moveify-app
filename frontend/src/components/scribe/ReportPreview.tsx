import { useEffect, useRef } from 'react';
import { X, Printer, RefreshCw, Pencil } from 'lucide-react';
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
const LABEL = '#D0EEEE';

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
  const summaryRef  = useRef<HTMLDivElement>(null);
  const goalsRef    = useRef<HTMLDivElement>(null);
  const planRef     = useRef<HTMLDivElement>(null);
  const coverBodyRef = useRef<HTMLDivElement>(null);
  const coverBody2Ref = useRef<HTMLDivElement>(null);

  const firstName = patientName.split(' ')[0];

  useEffect(() => {
    if (summaryRef.current)   summaryRef.current.innerText   = cleanText(sections.executiveSummary);
    if (goalsRef.current)     goalsRef.current.innerText     = cleanText(sections.goals);
    if (planRef.current)      planRef.current.innerText      = cleanText(sections.managementPlan);
    if (coverBodyRef.current) coverBodyRef.current.innerText =
      `Thank you sincerely for referring ${patientName} to Moveify Health Solutions for Exercise Physiology services under the MBS GP Chronic Condition Management Plan. Please find below the report and recommendations following ${firstName}'s Initial Consultation on ${sessionDate}.`;
    if (coverBody2Ref.current) coverBody2Ref.current.innerText =
      `Should you have any questions or queries, please do not hesitate to contact me on 0435 524 991 or ryan@moveifyhealth.com`;
  }, [sections, patientName, sessionDate, firstName]);

  function handlePrint() {
    const root = document.getElementById('report-print-root');
    if (!root) return;

    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-no-print]').forEach(el => el.remove());
    clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    clone.querySelectorAll('img').forEach(img => {
      const attr = img.getAttribute('src') || '';
      if (attr.startsWith('/')) img.setAttribute('src', `${window.location.origin}${attr}`);
    });
    clone.style.cssText = 'width:100%;max-width:none;border-radius:0;box-shadow:none;background:white;';

    const printWin = window.open('', '_blank', 'width=900,height=1200');
    if (!printWin) { alert('Please allow pop-ups to print.'); return; }

    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>GP Report — ${patientName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body { margin: 0; padding: 0; background: white; font-family: 'DM Sans', Arial, sans-serif; }
    table { border-collapse: collapse; }
    .rpt-page-break { page-break-after: always; }
    .rpt-avoid-break { break-inside: avoid; }
  </style>
</head>
<body>${clone.outerHTML}</body>
</html>`);
    printWin.document.close();
    setTimeout(() => {
      printWin.focus();
      printWin.print();
      printWin.addEventListener('afterprint', () => printWin.close(), { once: true });
      setTimeout(() => { if (!printWin.closed) printWin.close(); }, 5000);
    }, 700);
  }

  const font: React.CSSProperties = { fontFamily: "'DM Sans', Arial, sans-serif" };

  const bodyText: React.CSSProperties = {
    ...font, fontSize: '0.84rem', color: NAVY, lineHeight: '1.65',
  };

  // Shared editable style — same look across all sections
  const editable: React.CSSProperties = {
    ...bodyText, whiteSpace: 'pre-wrap', minHeight: '40px',
    padding: '8px 10px', outline: 'none',
  };

  const editableInline: React.CSSProperties = {
    ...bodyText, display: 'inline-block',
    borderBottom: '1px dashed #94a3b8',
    minWidth: '120px', outline: 'none', padding: '1px 4px',
  };

  // Dark navy full-width centered banner — matches template exactly
  const banner: React.CSSProperties = {
    ...font, background: NAVY, color: 'white',
    fontWeight: 700, fontSize: '0.8rem',
    letterSpacing: '0.09em', textTransform: 'uppercase',
    textAlign: 'center', padding: '7px 12px',
  };

  const Header = () => (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <tbody>
          <tr>
            <td style={{ width: '38%', padding: '4px 0', verticalAlign: 'middle' }}>
              <img
                src="/assets/gp-report-logo.png"
                alt="Moveify Health Solutions"
                style={{ height: '38mm', maxHeight: '38mm', objectFit: 'contain', display: 'block' }}
              />
            </td>
            {/* Vertical divider */}
            <td style={{ width: '1px', padding: '0 12px', verticalAlign: 'middle' }}>
              <div style={{ width: '1px', height: '38mm', background: '#c8d0d8', margin: '0 auto' }} />
            </td>
            {/* Title */}
            <td style={{ padding: '4px 0 4px 10px', verticalAlign: 'middle', textAlign: 'right' }}>
              <div style={{ ...font, fontWeight: 800, fontSize: '1.05rem', color: NAVY, letterSpacing: '0.04em' }}>
                INITIAL CONSULTATION REPORT
              </div>
              <div style={{ ...font, fontSize: '0.8rem', color: TEAL, marginTop: '4px', fontWeight: 500 }}>
                Exercise Physiology
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <hr style={{ border: 'none', borderTop: '1.5px solid #c8d0d8', margin: '0 0 16px 0' }} />
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2">
      <div className="w-full max-w-[210mm]">

        {/* Toolbar */}
        <div data-no-print className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 rounded-t-xl sticky top-4 z-10 shadow-sm">
          <div>
            <h2 className="font-display font-bold text-secondary-700 text-base">GP Report Preview</h2>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Click any text to edit before printing
            </p>
          </div>
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
          <div className="rpt-page-break" style={{ padding: '12mm 14mm 10mm' }}>
            <Header />

            {/* GP address block — all fields editable */}
            <div style={{ ...bodyText, lineHeight: '1.85', marginBottom: '18px' }}>
              <div>
                <strong>Dr&nbsp;</strong>
                <span contentEditable suppressContentEditableWarning
                  style={{ ...editableInline, fontWeight: 700, minWidth: '160px' }}>
                  Doctor Name
                </span>
              </div>
              <div>
                <span contentEditable suppressContentEditableWarning
                  style={{ ...editableInline, minWidth: '220px' }}>
                  Practice Name
                </span>
              </div>
              <div>
                <span contentEditable suppressContentEditableWarning
                  style={{ ...editableInline, minWidth: '200px' }}>
                  Address
                </span>
              </div>
              <div>
                <span contentEditable suppressContentEditableWarning
                  style={{ ...editableInline, minWidth: '160px' }}>
                  Town Postcode
                </span>
              </div>
            </div>

            <div style={{ ...bodyText, marginBottom: '18px' }}>
              <span contentEditable suppressContentEditableWarning
                style={{ ...editableInline, minWidth: '120px' }}>
                {sessionDate}
              </span>
            </div>

            <p style={{ ...bodyText, fontWeight: 700, marginBottom: '14px' }}>
              Dear Dr{' '}
              <span contentEditable suppressContentEditableWarning
                style={{ ...editableInline, minWidth: '110px', fontWeight: 400 }}>
                Surname
              </span>
              ,
            </p>

            {/* Cover letter body — fully editable */}
            <div
              ref={coverBodyRef}
              contentEditable
              suppressContentEditableWarning
              style={{ ...editable, marginBottom: '14px' }}
            />

            <div
              ref={coverBody2Ref}
              contentEditable
              suppressContentEditableWarning
              style={{ ...editable, marginBottom: '40px' }}
            />

            <p style={{ ...bodyText, marginBottom: '56px' }}>Yours sincerely,</p>

            <div style={{ ...bodyText }}>
              <div style={{ fontWeight: 700 }}>Ryan Heath</div>
              <div style={{ fontWeight: 700 }}>Accredited Exercise Physiologist</div>
              <div>BclinExPhys (Hons)</div>
            </div>

            <Footer />
          </div>

          {/* ══ PAGE 2+: Clinical Report ══ */}
          <div style={{ padding: '12mm 14mm 10mm' }}>
            <Header />

            {/* PATIENT DETAILS — 2-column, 5 rows, label background matches template */}
            <div style={{ marginBottom: '16px' }}>
              <div style={banner}>PATIENT DETAILS</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #b0bec5' }}>
                <tbody>
                  {([
                    ['Patient Name', patientName],
                    ['Referring GP', ''],
                    ['Date of Birth', ''],
                    ['Medicare No', ''],
                    ['Referral Date', ''],
                  ] as [string, string][]).map(([label, value], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #b0bec5' }}>
                      <td style={{
                        background: LABEL, color: NAVY, fontFamily: "'DM Sans', Arial, sans-serif",
                        fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px',
                        width: '35%', borderRight: '1px solid #b0bec5',
                      }}>
                        {label}
                      </td>
                      <td style={{ background: 'white', padding: '8px 12px', ...bodyText }}>
                        <span
                          contentEditable suppressContentEditableWarning
                          style={{ outline: 'none', display: 'block', minHeight: '18px' }}
                        >
                          {value}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* EXECUTIVE SUMMARY */}
            <div className="rpt-avoid-break" style={{ marginBottom: '14px' }}>
              <div style={banner}>EXECUTIVE SUMMARY</div>
              <div ref={summaryRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* OBJECTIVE ASSESSMENT */}
            <div className="rpt-avoid-break" style={{ marginBottom: '14px' }}>
              <div style={banner}>OBJECTIVE ASSESSMENT</div>
              {objectiveRows.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #b0bec5' }}>
                  <thead>
                    <tr>
                      <th style={{ background: TEAL, color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', textAlign: 'left', width: '30%' }}>Test</th>
                      <th style={{ background: TEAL, color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', textAlign: 'left', width: '18%', borderLeft: '1px solid rgba(255,255,255,0.3)' }}>Result</th>
                      <th style={{ background: TEAL, color: 'white', fontFamily: "'DM Sans', Arial, sans-serif", fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', textAlign: 'left', borderLeft: '1px solid rgba(255,255,255,0.3)' }}>Interpretation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objectiveRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #b0bec5', background: 'white' }}>
                        <td style={{ ...bodyText, padding: '8px 12px', fontWeight: 700, borderRight: '1px solid #b0bec5' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.test}</span>
                        </td>
                        <td style={{ ...bodyText, padding: '8px 12px', borderRight: '1px solid #b0bec5' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{row.result}</span>
                        </td>
                        <td style={{ ...bodyText, padding: '8px 12px' }}>
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
              <div style={banner}>GOALS</div>
              <div ref={goalsRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* RECOMMENDATIONS */}
            <div className="rpt-avoid-break" style={{ marginBottom: '14px' }}>
              <div style={banner}>RECOMMENDATIONS</div>
              <div ref={planRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            <Footer />
          </div>

        </div>{/* end report-print-root */}
      </div>
    </div>
  );
}
