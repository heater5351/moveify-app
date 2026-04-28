"""
build_gp_report.py — run ONCE to produce gp_report_template.docx

The output is a docxtpl-compatible Word template.  Every {{ variable }} and
{%tr for %} tag is written as plain text by python-docx into a single run, so
docxtpl can find and replace them reliably at fill-time.

Two-step workflow:
  1. python scripts/build_gp_report.py   →  produces gp_report_template.docx
  2. python scripts/fill_gp_report.py    →  fills template with patient data + AI content
"""

from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

LOGO_PATH   = r"C:\Users\dilig\Documents\moveify-app\frontend\public\assets\moveify-logo.png"
OUT_PATH    = r"C:\Users\dilig\Documents\moveify-app\gp_report_template.docx"

doc = Document()

# ── Margins ────────────────────────────────────────────────────────────────────
sec = doc.sections[0]
sec.top_margin    = Cm(0)
sec.bottom_margin = Cm(1.8)
sec.left_margin   = Cm(0)
sec.right_margin  = Cm(0)

INNER_L = Cm(2.0)
INNER_R = Cm(2.0)

# ── Colours ────────────────────────────────────────────────────────────────────
NAVY   = RGBColor(0x13, 0x22, 0x32)
TEAL   = RGBColor(0x46, 0xC1, 0xC0)
DKGREY = RGBColor(0x3A, 0x44, 0x52)
GREY   = RGBColor(0x9C, 0xA3, 0xAF)
WHITE  = RGBColor(0xFF, 0xFF, 0xFF)

# ── Low-level helpers ──────────────────────────────────────────────────────────
def cell_bg(cell, hex6):
    tcPr = cell._tc.get_or_add_tcPr()
    shd  = OxmlElement('w:shd')
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  hex6)
    tcPr.append(shd)

def no_borders(table):
    tbl   = table._tbl
    tblPr = tbl.find(qn('w:tblPr'))
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)
    b = OxmlElement('w:tblBorders')
    for side in ('top','left','bottom','right','insideH','insideV'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'),   'none')
        el.set(qn('w:sz'),    '0')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), 'auto')
        b.append(el)
    tblPr.append(b)

def light_inner_borders(table, color='CBE9E9'):
    tbl   = table._tbl
    tblPr = tbl.find(qn('w:tblPr'))
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)
    b = OxmlElement('w:tblBorders')
    for side in ('top','left','bottom','right'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'),   'none')
        el.set(qn('w:sz'),    '0')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), 'auto')
        b.append(el)
    for side in ('insideH','insideV'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'),   'single')
        el.set(qn('w:sz'),    '4')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), color)
        b.append(el)
    tblPr.append(b)

def pad(cell, top=100, bot=100, left=160, right=160):
    tcPr  = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for side, v in [('top',top),('bottom',bot),('left',left),('right',right)]:
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:w'),    str(v))
        el.set(qn('w:type'), 'dxa')
        tcMar.append(el)
    tcPr.append(tcMar)

def vcenter(cell):
    tcPr   = cell._tc.get_or_add_tcPr()
    vAlign = OxmlElement('w:vAlign')
    vAlign.set(qn('w:val'), 'center')
    tcPr.append(vAlign)

def sp(p, before=0, after=5):
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after  = Pt(after)

def rn(p, text, size=12, bold=False, italic=False, color=None):
    """Add a single run — all text in one run so docxtpl placeholders are never split."""
    r = p.add_run(text)
    r.font.name   = 'Calibri'
    r.font.size   = Pt(size)
    r.font.bold   = bold
    r.font.italic = italic
    if color:
        r.font.color.rgb = color
    return r

def blank(doc, pts=8):
    p = doc.add_paragraph()
    sp(p, 0, pts)

def indented(doc, text, size=12, italic=False, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent  = INNER_L
    p.paragraph_format.right_indent = INNER_R
    p.paragraph_format.line_spacing = Pt(17)
    rn(p, text, size=size, italic=italic, color=color or DKGREY)
    sp(p, 0, 6)
    return p

def section_band(doc, title):
    t = doc.add_table(rows=1, cols=1)
    no_borders(t)
    c = t.cell(0, 0)
    cell_bg(c, '132232')
    pad(c, top=200, bot=200, left=560, right=560)
    p = c.paragraphs[0]
    p.clear()
    rn(p, title.upper(), size=11, bold=True, color=WHITE)
    sp(p, 0, 0)

def page_header(doc, subtitle='INITIAL CONSULTATION REPORT'):
    hdr = doc.add_table(rows=1, cols=2)
    no_borders(hdr)
    lc = hdr.cell(0, 0)
    rc = hdr.cell(0, 1)
    lc.width = Cm(13.5)
    rc.width = Cm(7.5)
    cell_bg(lc, 'FFFFFF')
    cell_bg(rc, '132232')
    pad(lc, top=200, bot=120, left=480, right=200)
    pad(rc, top=200, bot=120, left=300, right=400)
    vcenter(lc)
    vcenter(rc)

    lp = lc.paragraphs[0]
    lp.clear()
    run = lp.add_run()
    run.add_picture(LOGO_PATH, width=Cm(7.0))
    sp(lp, 0, 0)

    rp = rc.paragraphs[0]
    rp.clear()
    rp.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rn(rp, subtitle, size=11, bold=True, color=WHITE)
    sp(rp, 0, 6)

    rp2 = rc.add_paragraph()
    rp2.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rn(rp2, 'Exercise Physiology  ·  Allied Health', size=9, color=TEAL)
    sp(rp2, 0, 0)

    acc = doc.add_table(rows=1, cols=1)
    no_borders(acc)
    ac = acc.cell(0, 0)
    cell_bg(ac, '46C1C0')
    pad(ac, top=60, bot=60, left=0, right=0)
    ac.paragraphs[0].clear()
    sp(ac.paragraphs[0], 0, 0)

def footer_band(doc):
    ft = doc.add_table(rows=1, cols=1)
    no_borders(ft)
    fc = ft.cell(0, 0)
    cell_bg(fc, '132232')
    pad(fc, top=160, bot=160, left=560, right=560)
    p = fc.paragraphs[0]
    p.clear()
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rn(p, 'Moveify Health Solutions  ·  Exercise Physiology  ·  Allied Health', size=9, color=TEAL)
    sp(p, 0, 3)
    p2 = fc.add_paragraph()
    p2.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rn(p2, '{{ clinician_full_name }}  |  {{ clinician_qualifications }}  |  {{ clinician_phone }}  |  {{ clinician_email }}  |  ABN: {{ clinician_abn }}',
       size=9, color=GREY)
    sp(p2, 0, 0)


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 1 — COVER LETTER
# ══════════════════════════════════════════════════════════════════════════════
page_header(doc)
blank(doc, 14)

# GP address block
for txt, bold in [
    ('{{ gp_name }}',        True),
    ('{{ practice_name }}',  False),
    ('{{ practice_address }}', False),
    ('{{ report_date }}',    False),
]:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = INNER_L
    rn(p, txt, size=12, bold=bold, color=NAVY if bold else DKGREY)
    sp(p, 0, 2)

blank(doc, 10)

p = doc.add_paragraph()
p.paragraph_format.left_indent = INNER_L
rn(p, 'Dear Dr {{ gp_surname }},', size=12, bold=True, color=NAVY)
sp(p, 0, 10)

indented(doc,
    'Thank you sincerely for referring {{ patient_full_name }} to Moveify Health Solutions for '
    'Exercise Physiology services under the Chronic Disease Management (CDM) Plan. Please find '
    'below the report and recommendations following {{ patient_pronoun }} Initial Consultation '
    'on {{ appointment_date }}.')

indented(doc,
    'Should you have any questions or queries, please do not hesitate to contact me on '
    '{{ clinician_phone }}.')

blank(doc, 10)

p = doc.add_paragraph()
p.paragraph_format.left_indent = INNER_L
rn(p, 'Yours sincerely,', size=12, color=DKGREY)
sp(p, 0, 38)

for txt, bold in [
    ('{{ clinician_full_name }}',                             True),
    ('{{ clinician_qualifications }}  |  {{ clinician_profession }}', False),
    ('{{ clinician_phone }}  |  {{ clinician_email }}',       False),
]:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = INNER_L
    rn(p, txt, size=12, bold=bold, color=NAVY if bold else DKGREY)
    sp(p, 0, 2)

blank(doc, 12)

# Signature box — teal left border
sig_t = doc.add_table(rows=1, cols=1)
no_borders(sig_t)
tblPr = sig_t._tbl.find(qn('w:tblPr'))
if tblPr is None:
    tblPr = OxmlElement('w:tblPr')
    sig_t._tbl.insert(0, tblPr)
ind_el = OxmlElement('w:tblInd')
ind_el.set(qn('w:w'), '1134')
ind_el.set(qn('w:type'), 'dxa')
tblPr.append(ind_el)

sc = sig_t.cell(0, 0)
sc.width = Cm(7)
cell_bg(sc, 'EBF8F8')
pad(sc, top=320, bot=320, left=300, right=300)

tcPr = sc._tc.get_or_add_tcPr()
tcb  = OxmlElement('w:tcBorders')
lbrd = OxmlElement('w:left')
lbrd.set(qn('w:val'),   'single')
lbrd.set(qn('w:sz'),    '20')
lbrd.set(qn('w:space'), '0')
lbrd.set(qn('w:color'), '46C1C0')
tcb.append(lbrd)
tcPr.append(tcb)

p = sc.paragraphs[0]
p.clear()
rn(p, '[ Clinician Signature ]', size=11, italic=True, color=GREY)
sp(p, 0, 0)

blank(doc, 16)
footer_band(doc)
doc.add_page_break()


# ══════════════════════════════════════════════════════════════════════════════
#  PAGE 2 — REPORT
# ══════════════════════════════════════════════════════════════════════════════
page_header(doc)
blank(doc, 10)


# ─── PATIENT DETAILS ──────────────────────────────────────────────────────────
section_band(doc, 'Patient Details')
blank(doc, 4)

det = doc.add_table(rows=3, cols=4)
light_inner_borders(det)
det.alignment = WD_TABLE_ALIGNMENT.CENTER
DW = [Cm(3.0), Cm(7.2), Cm(3.0), Cm(7.2)]

det_data = [
    ('Patient Name',  '{{ patient_full_name }}', 'Date of Birth',  '{{ patient_dob }}'),
    ('Referring GP',  '{{ referring_gp }}',       'Practice',       '{{ practice_name }}'),
    ('Referral Date', '{{ referral_date }}',       'CDM Sessions',   '{{ cdm_sessions }}'),
]
for ri, (l1, v1, l2, v2) in enumerate(det_data):
    row = det.rows[ri]
    bg  = 'F0FAFA' if ri % 2 == 0 else 'FAFEFE'
    for ci, (txt, is_lbl) in enumerate([(l1,True),(v1,False),(l2,True),(v2,False)]):
        c = row.cells[ci]
        c.width = DW[ci]
        cell_bg(c, '1C2E3D' if is_lbl else bg)
        pad(c, top=150, bot=150, left=220, right=160)
        vcenter(c)
        p = c.paragraphs[0]
        p.clear()
        rn(p, txt, size=11, bold=is_lbl, color=WHITE if is_lbl else DKGREY)
        sp(p, 0, 0)

blank(doc, 12)


# ─── EXECUTIVE SUMMARY ────────────────────────────────────────────────────────
section_band(doc, 'Executive Summary')
blank(doc, 5)
indented(doc, '{{ executive_summary }}')
blank(doc, 10)


# ─── OBJECTIVE ASSESSMENT ─────────────────────────────────────────────────────
section_band(doc, 'Objective Assessment')
blank(doc, 4)

OA_W = [Cm(5.4), Cm(3.0), Cm(12.0)]
oa = doc.add_table(rows=2, cols=3)
light_inner_borders(oa, color='C5E5E5')
oa.alignment = WD_TABLE_ALIGNMENT.CENTER

# Header row
for ci, (h, w) in enumerate(zip(['Test', 'Result', 'Interpretation'], OA_W)):
    c = oa.rows[0].cells[ci]
    c.width = w
    cell_bg(c, '1C2E3D')
    pad(c, top=160, bot=160, left=220, right=220)
    p = c.paragraphs[0]
    p.clear()
    rn(p, h, size=11, bold=True, color=WHITE)
    sp(p, 0, 0)

# Template row — docxtpl loops over oa_rows and repeats this row for each item.
# {%tr for row in oa_rows %} opens the loop in cell 0;
# {%tr endfor %}            closes it in cell 2.
loop_row = oa.rows[1]
loop_cells = [
    ('{%tr for row in oa_rows %}{{ row.test }}', False, NAVY),
    ('{{ row.result }}',                          False, DKGREY),
    ('{{ row.interpretation }}{%tr endfor %}',    True,  GREY),
]
for ci, (txt, italic, color) in enumerate(loop_cells):
    c = loop_row.cells[ci]
    c.width = OA_W[ci]
    cell_bg(c, 'FFFFFF')
    pad(c, top=140, bot=140, left=220, right=220)
    vcenter(c)
    p = c.paragraphs[0]
    p.clear()
    rn(p, txt, size=11, bold=(ci == 0), italic=italic, color=color)
    sp(p, 0, 0)

blank(doc, 12)


# ─── GOALS ────────────────────────────────────────────────────────────────────
section_band(doc, 'Goals')
blank(doc, 5)
indented(doc, '{{ goals }}')
blank(doc, 12)


# ─── MANAGEMENT PLAN ──────────────────────────────────────────────────────────
section_band(doc, 'Management Plan')
blank(doc, 5)
indented(doc, '{{ management_plan }}')
blank(doc, 20)


# ─── FOOTER ───────────────────────────────────────────────────────────────────
footer_band(doc)


# ── Save ───────────────────────────────────────────────────────────────────────
doc.save(OUT_PATH)
print(f"Template saved: {OUT_PATH}")
print()
print("Next step: run  python scripts/fill_gp_report.py  to generate a filled report.")
