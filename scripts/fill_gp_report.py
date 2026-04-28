"""
fill_gp_report.py — fill gp_report_template.docx with patient data + AI-generated content.

Usage:
  python scripts/fill_gp_report.py

Edit the PATIENT_DATA and OA_RESULTS dicts below for each patient, then run.
Outputs:
  - GP_Report_<PatientName>_<Date>.docx  (editable Word)
  - GP_Report_<PatientName>_<Date>.pdf   (print-ready PDF)
"""

import os
import json
from datetime import date
from docxtpl import DocxTemplate
from docx2pdf import convert
import boto3

# AWS Bedrock — ap-southeast-2 (Sydney). PHI stays in Australia.
BEDROCK = boto3.client('bedrock-runtime', region_name='ap-southeast-2')
MODEL_ID = 'amazon.nova-pro-v1:0'


def bedrock_converse(system_prompt: str, user_message: str, max_tokens: int = 1024) -> str:
    response = BEDROCK.converse(
        modelId=MODEL_ID,
        system=[{'text': system_prompt}],
        messages=[{'role': 'user', 'content': [{'text': user_message}]}],
        inferenceConfig={'maxTokens': max_tokens},
    )
    return response['output']['message']['content'][0]['text'].strip()

TEMPLATE_PATH = r"C:\Users\dilig\Documents\moveify-app\gp_report_template.docx"
OUTPUT_DIR    = r"C:\Users\dilig\Documents\moveify-app\reports"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── 1. Patient + clinician data ────────────────────────────────────────────────
# Fill these in for each patient before running.

CLINICIAN = {
    "clinician_full_name":       "Ryan [Surname]",
    "clinician_qualifications":  "BExSci (Hons)",
    "clinician_profession":      "Accredited Exercise Physiologist",
    "clinician_phone":           "04XX XXX XXX",
    "clinician_email":           "ryan@moveifyhealth.com",
    "clinician_abn":             "XX XXX XXX XXX",
}

PATIENT_DATA = {
    # GP / letter fields
    "gp_name":           "Dr Sarah Thompson",
    "gp_surname":        "Thompson",
    "practice_name":     "Eastside Medical Centre",
    "practice_address":  "123 Collins Street, Melbourne VIC 3000",
    "practice_email":    "admin@eastsidemedical.com.au",
    "report_date":       date.today().strftime("%-d %B %Y"),  # e.g. 27 April 2026
    "appointment_date":  "24 April 2026",
    "assessment_date":   "24 April 2026",
    # Patient
    "patient_full_name": "John Smith",
    "patient_first_name":"John",
    "patient_dob":       "15/03/1958",
    "patient_pronoun":   "his",   # his / her / their
    # Referral
    "referring_gp":      "Dr Sarah Thompson",
    "referral_date":     "10 April 2026",
    "cdm_sessions":      "1 of 5 used",
}

# Objective assessment results — one dict per row of the OA table.
# 'test' and 'result' are factual; 'interpretation' will be AI-generated if left blank.
OA_RESULTS = [
    {"test": "Age",                    "result": "68 years",        "interpretation": ""},
    {"test": "Height",                 "result": "174 cm",          "interpretation": ""},
    {"test": "Weight",                 "result": "98 kg",           "interpretation": ""},
    {"test": "BMI",                    "result": "32.4 kg/m²",      "interpretation": ""},
    {"test": "Blood Pressure",         "result": "148/92 mmHg",     "interpretation": ""},
    {"test": "Resting Heart Rate",     "result": "74 bpm",          "interpretation": ""},
    {"test": "30-Sec Sit to Stand",    "result": "8 reps",          "interpretation": ""},
    {"test": "Timed Up and Go (TUG)",  "result": "13.2 seconds",    "interpretation": ""},
    {"test": "Grip Strength (R / L)",  "result": "28 kg / 26 kg",   "interpretation": ""},
    {"test": "Pain (NRS 0–10)",        "result": "3/10 right knee", "interpretation": ""},
    {"test": "Physical Activity",      "result": "~40 min/week",    "interpretation": ""},
]

# Clinical context sent to Claude — NO patient name, DOB, or GP name included.
# Identifying fields stay on this machine and are filled in by docxtpl after Claude returns.
# Age (not DOB) and sex are included as they are clinically necessary for interpreting results.
CLINICAL_CONTEXT = """
Patient: 68-year-old male
Sex: Male
Referred conditions: Type 2 Diabetes, Osteoarthritis (bilateral knees), Hypertension, Obesity (Class I)
CDM Plan: 5 sessions

Objective Assessment Summary:
- BMI 32.4 — Obese Class I
- BP 148/92 — Stage 1 hypertension
- 30-sec sit to stand: 8 reps (below average for age)
- TUG: 13.2 sec (borderline — mild dynamic balance impairment)
- Grip strength reduced bilaterally
- Pain: 3/10 right knee at rest
- Physical activity: ~40 min/week (well below 150 min/week guideline)
- Sedentary occupation (retired, largely home-based)

Session goals discussed with patient:
1. Improve lower limb strength and balance to reduce fall risk
2. Improve glycaemic control through structured exercise
3. Reduce knee pain and improve functional mobility
4. Build to 150 minutes of moderate-intensity activity per week
"""


# ── 2. Call Claude to generate the narrative sections ─────────────────────────

def generate_report_content(context: str, patient_data: dict) -> dict:
    # No patient name, DOB, or GP details are sent.
    # Placeholders like {{ patient_full_name }} are written literally by the model
    # and substituted locally by docxtpl after the API call returns.
    system = (
        'You are an Accredited Exercise Physiologist writing a GP report under a '
        'Chronic Disease Management Plan. Write in professional clinical language '
        'appropriate for communication with a medical practitioner. Be concise and precise. '
        'Return only raw JSON — no markdown, no code fences, no extra text.'
    )
    user = f"""Generate report sections from the clinical context below.
Return a JSON object with exactly these keys:
executive_summary, goals_intro, goal_1, goal_2, goal_3, management_plan.

Clinical context:
{context}

Placeholder rule: wherever the patient full name is needed write exactly: {{{{ patient_full_name }}}}
Wherever the patient first name is needed write exactly: {{{{ patient_first_name }}}}
Wherever the appointment date is needed write exactly: {{{{ appointment_date }}}}
Do not invent or infer a real name or date — use only these placeholder strings.

Requirements:

executive_summary — exactly 3 sentences as one paragraph, no line breaks:
  Sentence 1: "{{{{ patient_full_name }}}} attended Moveify Health Solutions on {{{{ appointment_date }}}} for an initial Exercise Physiology assessment under a GP Chronic Disease Management Plan, referred for the management of [conditions from context]."
  Sentence 2: "{{{{ patient_full_name }}}} also reported [additional symptoms, functional limitations, or relevant history not listed as the primary referral reason]."
  Sentence 3: "Following assessment, an individualised exercise program was developed collaboratively with {{{{ patient_first_name }}}} to address [key deficits and clinical priorities]. The structured program will be delivered at the subsequent consultation, with regular progress reviews scheduled to monitor outcomes and refine the intervention as required."

goals_intro — Exactly this sentence, nothing else:
  "The following goals were created in collaboration with {{{{ patient_first_name }}}}."

goal_1, goal_2, goal_3 — Each is a single standalone sentence. No numbering, no bullets.
  Sentence structure: [Action verb] [specific clinical target] by/through [intervention method], [optional secondary component].
  Rules:
  - Start with an action verb: Improve / Manage / Build / Reduce / Develop / Increase
  - Be anatomically and clinically specific (name the body region, symptom, or system)
  - Name the intervention type (resistance training, mobility program, aerobic exercise, graded loading, education, etc.)
  - Optionally add a secondary component after a comma (e.g. "supported by education on load management")
  - Use {{{{ patient_first_name }}}}'s (possessive) if referencing the patient within the goal
  - No timeframes, no SMART language

management_plan — A single paragraph of exactly 3 sentences, no line breaks between them.
  Sentence 1: "Following assessment, it is recommended that {{{{ patient_first_name }}}} commence a structured exercise program addressing [the key deficits and clinical priorities from the context]."
  Sentence 2: "The program will incorporate [specific exercise modalities from the context — e.g. resistance training, aerobic conditioning, mobility work] and [any relevant education component — e.g. education on load management, pain neuroscience, lifestyle modification]."
  Sentence 3: "It is recommended that {{{{ patient_first_name }}}} continue with regular Exercise Physiology consultations to progress and monitor {{{{ patient_pronoun }}}} individualised program across all management areas."

Return JSON only."""

    raw = bedrock_converse(system, user, max_tokens=1200)
    return json.loads(raw)


def generate_oa_interpretations(oa_rows: list, context: str) -> list:
    """Fill in any blank 'interpretation' fields in the OA table.
    Only test names and numeric results are sent — no patient name, DOB, or GP details.
    """
    rows_needing_interp = [r for r in oa_rows if not r["interpretation"]]
    if not rows_needing_interp:
        return oa_rows

    rows_json = json.dumps(
        [{"test": r["test"], "result": r["result"]} for r in rows_needing_interp],
        indent=2
    )
    system = (
        'You are an Accredited Exercise Physiologist. '
        'Return only a raw JSON array — no markdown, no code fences, no extra text.'
    )
    user = f"""For each assessment test below, write a brief clinical interpretation
(1 sentence, max 20 words) suitable for a GP report.

Clinical context (no patient name or identifying information):
{context}

Tests (return as JSON array in the same order, each object with keys "test" and "interpretation" only):
{rows_json}

Return JSON array only."""

    raw = bedrock_converse(system, user, max_tokens=600)
    interpretations = json.loads(raw)
    interp_map = {item["test"]: item["interpretation"] for item in interpretations}

    return [
        {**row, "interpretation": interp_map.get(row["test"], row["interpretation"]) or row["interpretation"]}
        for row in oa_rows
    ]


# ── 3. Build the document ─────────────────────────────────────────────────────

def main():
    print("Generating AI content via AWS Bedrock (Nova Pro, ap-southeast-2)...")
    ai_content    = generate_report_content(CLINICAL_CONTEXT, PATIENT_DATA)
    filled_oa     = generate_oa_interpretations(OA_RESULTS, CLINICAL_CONTEXT)

    print("AI content generated. Filling template...")

    context = {
        **CLINICIAN,
        **PATIENT_DATA,
        "oa_rows":           filled_oa,
        "executive_summary": ai_content["executive_summary"],
        "goals_intro":       ai_content["goals_intro"],
        "goal_1":            ai_content["goal_1"],
        "goal_2":            ai_content["goal_2"],
        "goal_3":            ai_content["goal_3"],
        "management_plan":   ai_content["management_plan"],
    }

    tpl = DocxTemplate(TEMPLATE_PATH)
    tpl.render(context)

    safe_name = PATIENT_DATA["patient_full_name"].replace(" ", "_")
    today     = date.today().strftime("%Y-%m-%d")
    out_docx  = os.path.join(OUTPUT_DIR, f"GP_Report_{safe_name}_{today}.docx")
    out_pdf   = out_docx.replace(".docx", ".pdf")

    tpl.save(out_docx)
    print(f"Word document saved: {out_docx}")

    print("Converting to PDF...")
    convert(out_docx, out_pdf)
    print(f"PDF saved:           {out_pdf}")


if __name__ == "__main__":
    main()
