import { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, Pencil } from 'lucide-react';
import type { ReportSections } from '../../types';
import { downloadReportDocx } from '../../utils/scribe-api';

interface ReportPreviewProps {
  type: 'cdmp';
  sections: ReportSections;
  patientName: string;
  sessionDate: string;
  sessionId: number;
  onClose: () => void;
  onRegenerate: () => void;
}

const NAVY  = '#132232';
const TEAL  = '#46C1C0';
const LABEL = '#D0EEEE';

function cleanText(t: string) { return t.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s*/gm, '').trim(); }

function parseObjectiveRows(raw: string) {
  return raw.split('\n').filter(l => l.trim() && l.includes('|')).map(l => {
    const p = l.split('|').map(s => s.trim());
    return { test: p[0] || '', result: p[1] || '', interpretation: p[2] || '' };
  });
}

export default function ReportPreview({ sections, patientName, sessionDate, sessionId, onClose, onRegenerate }: ReportPreviewProps) {
  const firstName = patientName.split(' ')[0];

  // Editable text section refs
  const summaryRef    = useRef<HTMLDivElement>(null);
  const goalsRef      = useRef<HTMLDivElement>(null);
  const planRef       = useRef<HTMLDivElement>(null);
  const coverBody1Ref = useRef<HTMLDivElement>(null);
  const coverBody2Ref = useRef<HTMLDivElement>(null);

  // Cover letter field refs
  const doctorNameRef    = useRef<HTMLSpanElement>(null);
  const doctorSurnameRef = useRef<HTMLSpanElement>(null);
  const practiceNameRef  = useRef<HTMLSpanElement>(null);
  const addressRef       = useRef<HTMLSpanElement>(null);
  const townPostcodeRef  = useRef<HTMLSpanElement>(null);
  const practiceEmailRef = useRef<HTMLSpanElement>(null);
  const sessionDateRef   = useRef<HTMLSpanElement>(null);

  // Patient details refs
  const referringGPRef  = useRef<HTMLSpanElement>(null);
  const dobRef          = useRef<HTMLSpanElement>(null);
  const medicareNoRef   = useRef<HTMLSpanElement>(null);
  const referralDateRef = useRef<HTMLSpanElement>(null);
  const cdmSessionsRef  = useRef<HTMLSpanElement>(null);

  // Pronoun for template substitution
  const [patientPronoun, setPatientPronoun] = useState<'his' | 'her' | 'their'>('their');

  // Objective rows in state so edits are captured
  const [objRows, setObjRows] = useState(() => parseObjectiveRows(sections.objectiveAssessment));

  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState('');

  useEffect(() => {
    if (summaryRef.current)    summaryRef.current.innerText    = cleanText(sections.executiveSummary);
    if (goalsRef.current)      goalsRef.current.innerText      = cleanText(sections.goals);
    if (planRef.current)       planRef.current.innerText       = cleanText(sections.managementPlan);
    if (coverBody1Ref.current) coverBody1Ref.current.innerText =
      `Thank you sincerely for referring ${patientName} to Moveify Health Solutions for Exercise Physiology services under the MBS GP Chronic Condition Management Plan. Please find below the report and recommendations following ${firstName}'s Initial Consultation on ${sessionDate}.`;
    if (coverBody2Ref.current) coverBody2Ref.current.innerText =
      `Should you have any questions or queries, please do not hesitate to contact me on 0435 524 991 or ryan@moveifyhealth.com`;
  }, [sections, patientName, sessionDate, firstName]);

  async function handleDownload() {
    setDownloading(true);
    setDlError('');
    try {
      await downloadReportDocx(sessionId, {
        // Cover letter
        doctorName:    doctorNameRef.current?.innerText    || '',
        doctorSurname: doctorSurnameRef.current?.innerText || '',
        practiceName:  practiceNameRef.current?.innerText  || '',
        address:       addressRef.current?.innerText       || '',
        townPostcode:  townPostcodeRef.current?.innerText  || '',
        practiceEmail: practiceEmailRef.current?.innerText || '',
        sessionDate:   sessionDateRef.current?.innerText   || sessionDate,
        // Patient details
        patientName,
        patientPronoun,
        referringGP:  referringGPRef.current?.innerText  || '',
        dob:          dobRef.current?.innerText          || '',
        medicareNo:   medicareNoRef.current?.innerText   || '',
        referralDate: referralDateRef.current?.innerText || '',
        cdmSessions:  cdmSessionsRef.current?.innerText || '',
        // AI sections
        executiveSummary:    summaryRef.current?.innerText || '',
        objectiveAssessment: objRows.map(r => `${r.test} | ${r.result} | ${r.interpretation}`).join('\n'),
        goals:           goalsRef.current?.innerText || '',
        recommendations: planRef.current?.innerText  || '',
      });
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  const font: React.CSSProperties = { fontFamily: "'DM Sans', Arial, sans-serif" };
  const body: React.CSSProperties = { ...font, fontSize: '0.84rem', color: NAVY, lineHeight: '1.65' };
  const editable: React.CSSProperties = { ...body, whiteSpace: 'pre-wrap', minHeight: '40px', padding: '8px 10px', outline: 'none' };
  const inlineField: React.CSSProperties = { ...body, display: 'inline-block', borderBottom: '1px dashed #94a3b8', minWidth: '120px', outline: 'none', padding: '1px 4px' };
  const banner: React.CSSProperties = { ...font, background: NAVY, color: 'white', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.09em', textTransform: 'uppercase', textAlign: 'center', padding: '7px 12px' };

  const Header = () => (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
        <tbody><tr>
          <td style={{ width: '38%', padding: '4px 0', verticalAlign: 'middle' }}>
            <img src="/assets/gp-report-logo.png" alt="Moveify" style={{ height: '38mm', objectFit: 'contain', display: 'block' }} />
          </td>
          <td style={{ width: '1px', padding: '0 12px', verticalAlign: 'middle' }}>
            <div style={{ width: '1px', height: '38mm', background: '#c8d0d8', margin: '0 auto' }} />
          </td>
          <td style={{ padding: '4px 0 4px 10px', verticalAlign: 'middle', textAlign: 'right' }}>
            <div style={{ ...font, fontWeight: 800, fontSize: '1.05rem', color: NAVY }}>INITIAL CONSULTATION REPORT</div>
            <div style={{ ...font, fontSize: '0.8rem', color: TEAL, marginTop: '4px' }}>Exercise Physiology</div>
          </td>
        </tr></tbody>
      </table>
      <hr style={{ border: 'none', borderTop: '1.5px solid #c8d0d8', margin: '0 0 14px 0' }} />
    </>
  );

  const Footer = () => (
    <div style={{ ...font, fontSize: '0.7rem', color: '#666', textAlign: 'center', marginTop: '18px', paddingTop: '6px', borderTop: '1px solid #e5e7eb' }}>
      Moveify Health Solutions · Exercise Physiology | 0435 524 991 · ryan@moveifyhealth.com · ABN: 52 263 141 529
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 px-2">
      <div className="w-full max-w-[210mm]">

        {/* Toolbar */}
        <div data-no-print className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 rounded-t-xl sticky top-4 z-10 shadow-sm">
          <div>
            <h2 className="font-display font-bold text-secondary-700 text-base">GP Report Preview</h2>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Pencil className="w-3 h-3" /> Click any text to edit, then Download DOCX</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onRegenerate} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">Regenerate</button>
            {dlError && <span className="text-xs text-red-500">{dlError}</span>}
            <button onClick={handleDownload} disabled={downloading}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white font-semibold transition disabled:opacity-50"
              style={{ background: TEAL }}>
              {downloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><Download className="w-3.5 h-3.5" /> Download DOCX</>}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Document preview */}
        <div className="bg-white" style={font}>

          {/* PAGE 1 — Cover Letter */}
          <div style={{ padding: '12mm 14mm 10mm', borderBottom: '3px dashed #e5e7eb' }}>
            <Header />
            <div style={{ ...body, lineHeight: '1.85', marginBottom: '18px' }}>
              <div><strong>Dr </strong><span ref={doctorNameRef} contentEditable suppressContentEditableWarning style={{ ...inlineField, fontWeight: 700, minWidth: '160px' }}>Doctor Name</span></div>
              <div><span ref={practiceNameRef} contentEditable suppressContentEditableWarning style={{ ...inlineField, minWidth: '220px' }}>Practice Name</span></div>
              <div><span ref={addressRef} contentEditable suppressContentEditableWarning style={{ ...inlineField, minWidth: '200px' }}>Address</span></div>
              <div><span ref={townPostcodeRef} contentEditable suppressContentEditableWarning style={{ ...inlineField, minWidth: '160px' }}>Town Postcode</span></div>
              <div><span ref={practiceEmailRef} contentEditable suppressContentEditableWarning style={{ ...inlineField, minWidth: '200px' }}>practice@email.com.au</span></div>
            </div>
            <div style={{ ...body, marginBottom: '18px' }}><span ref={sessionDateRef} contentEditable suppressContentEditableWarning style={{ ...inlineField, minWidth: '120px' }}>{sessionDate}</span></div>
            <p style={{ ...body, fontWeight: 700, marginBottom: '14px' }}>Dear Dr <span ref={doctorSurnameRef} contentEditable suppressContentEditableWarning style={{ ...inlineField, minWidth: '110px', fontWeight: 400 }}>Surname</span>,</p>
            <div ref={coverBody1Ref} contentEditable suppressContentEditableWarning style={{ ...editable, marginBottom: '12px' }} />
            <div ref={coverBody2Ref} contentEditable suppressContentEditableWarning style={{ ...editable, marginBottom: '40px' }} />
            <p style={{ ...body, marginBottom: '56px' }}>Yours sincerely,</p>
            <div style={body}><div style={{ fontWeight: 700 }}>Ryan Heath</div><div style={{ fontWeight: 700 }}>Accredited Exercise Physiologist</div><div>BclinExPhys (Hons)</div></div>
            <Footer />
          </div>

          {/* PAGE 2 — Clinical Report */}
          <div style={{ padding: '12mm 14mm 10mm' }}>
            <Header />

            {/* Patient details */}
            <div style={{ marginBottom: '14px' }}>
              <div style={banner}>PATIENT DETAILS</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #b0bec5' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #b0bec5' }}>
                    <td style={{ background: LABEL, fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', width: '35%', borderRight: '1px solid #b0bec5', ...font, color: NAVY }}>Patient Name</td>
                    <td style={{ background: 'white', padding: '8px 12px', ...body }}><span contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block' }}>{patientName}</span></td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #b0bec5' }}>
                    <td style={{ background: LABEL, fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', width: '35%', borderRight: '1px solid #b0bec5', ...font, color: NAVY }}>Pronoun</td>
                    <td style={{ background: 'white', padding: '6px 12px', ...body }}>
                      <select value={patientPronoun} onChange={e => setPatientPronoun(e.target.value as 'his' | 'her' | 'their')}
                        style={{ font: 'inherit', fontSize: '0.84rem', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 6px', color: NAVY, background: 'white' }}>
                        <option value="his">his</option>
                        <option value="her">her</option>
                        <option value="their">their</option>
                      </select>
                    </td>
                  </tr>
                  {[
                    ['Referring GP',  referringGPRef,  ''],
                    ['Date of Birth', dobRef,          ''],
                    ['Medicare No',   medicareNoRef,   ''],
                    ['Referral Date', referralDateRef, ''],
                    ['CDM Sessions',  cdmSessionsRef,  ''],
                  ].map(([label, ref, val]) => (
                    <tr key={label as string} style={{ borderBottom: '1px solid #b0bec5' }}>
                      <td style={{ background: LABEL, fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', borderRight: '1px solid #b0bec5', ...font, color: NAVY }}>{label as string}</td>
                      <td style={{ background: 'white', padding: '8px 12px', ...body }}>
                        <span ref={ref as React.RefObject<HTMLSpanElement>} contentEditable suppressContentEditableWarning style={{ outline: 'none', display: 'block', minHeight: '18px' }}>{val as string}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Executive Summary */}
            <div style={{ marginBottom: '14px' }}>
              <div style={banner}>EXECUTIVE SUMMARY</div>
              <div ref={summaryRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* Objective Assessment */}
            <div style={{ marginBottom: '14px' }}>
              <div style={banner}>OBJECTIVE ASSESSMENT</div>
              {objRows.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #b0bec5' }}>
                  <thead>
                    <tr>
                      {['Test', 'Result', 'Interpretation'].map((h, i) => (
                        <th key={h} style={{ background: TEAL, color: 'white', ...font, fontWeight: 700, fontSize: '0.78rem', padding: '8px 12px', textAlign: 'left', width: i === 0 ? '30%' : i === 1 ? '18%' : undefined, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.3)' : undefined }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {objRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #b0bec5', background: 'white' }}>
                        <td style={{ ...body, padding: '8px 12px', fontWeight: 700, borderRight: '1px solid #b0bec5' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}
                            onBlur={e => setObjRows(r => r.map((x, j) => j === i ? { ...x, test: e.currentTarget.innerText } : x))}>{row.test}</span>
                        </td>
                        <td style={{ ...body, padding: '8px 12px', borderRight: '1px solid #b0bec5' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}
                            onBlur={e => setObjRows(r => r.map((x, j) => j === i ? { ...x, result: e.currentTarget.innerText } : x))}>{row.result}</span>
                        </td>
                        <td style={{ ...body, padding: '8px 12px' }}>
                          <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}
                            onBlur={e => setObjRows(r => r.map((x, j) => j === i ? { ...x, interpretation: e.currentTarget.innerText } : x))}>{row.interpretation}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div contentEditable suppressContentEditableWarning style={editable}>{cleanText(sections.objectiveAssessment)}</div>
              )}
            </div>

            {/* Goals */}
            <div style={{ marginBottom: '14px' }}>
              <div style={banner}>GOALS</div>
              <div ref={goalsRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            {/* Recommendations */}
            <div style={{ marginBottom: '14px' }}>
              <div style={banner}>RECOMMENDATIONS</div>
              <div ref={planRef} contentEditable suppressContentEditableWarning style={editable} />
            </div>

            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
