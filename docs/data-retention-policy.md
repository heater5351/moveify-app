# Moveify Data Retention Policy

**Version:** 1.0
**Last reviewed:** 2026-03-07
**Owner:** Moveify Health Solutions
**Review frequency:** Annually or when relevant legislation changes

This policy addresses obligations under **Australian Privacy Principle 11.2** (Privacy Act 1988) and applicable state/territory health records legislation. APP 11.2 requires organisations to take reasonable steps to destroy or de-identify personal information when it is no longer needed for any purpose for which it may be used or disclosed.

> **Disclaimer:** This policy reflects a conservative interpretation of current Australian law. It is not legal advice. Consult a privacy lawyer to confirm obligations specific to your circumstances.

---

## 1. Scope

This policy applies to all personal information and health information held by Moveify, including:

- Patient records (demographics, conditions, contact details)
- Health data (exercise programs, completions, pain scores, RPE ratings, daily check-ins)
- Clinician records (name, email, credentials)
- Authentication data (hashed passwords, JWT tokens, invitation tokens)
- Audit logs (access records, IP addresses, timestamps)
- Education module completion records

---

## 2. Legal Framework

### 2.1 Federal

| Law | Requirement |
|-----|-------------|
| **Privacy Act 1988, APP 11.2** | Destroy or de-identify personal information when no longer needed for any permitted purpose. No fixed retention period — principle-based. |
| **Privacy Act 1988, APP 11.1** | Take reasonable steps to protect personal information from misuse, interference, loss, and unauthorised access during retention. |

### 2.2 State and territory health records legislation

Moveify operates nationally. The most prescriptive state requirements set the floor:

| Jurisdiction | Law | Minimum retention |
|-------------|-----|-------------------|
| **NSW** | Health Records and Information Privacy Act 2002 + PD2012_069 | Adults: 7 years from last entry. Minors: until age 25 or 7 years from last entry, whichever is longer. |
| **VIC** | Health Records Act 2001, HPP 4 | Adults: 7 years from last entry. Minors: until age 25 or 7 years, whichever is longer. |
| **QLD, WA, SA, TAS, NT, ACT** | No specific health records retention statute — governed by Privacy Act + professional guidelines | Follow federal APP 11.2 + AHPRA guidelines (7-year standard). |

### 2.3 Professional obligations

| Source | Requirement |
|--------|-------------|
| **AHPRA / Physiotherapy Board of Australia Code of Conduct** | Health practitioners must maintain adequate records. Aligns with the 7-year / age-25 standard. |
| **Professional indemnity (limitation periods)** | Negligence claims: generally 6 years from the act or 3 years from discovery. For minors, limitation does not commence until age 18 — so records should be retained until at least age 24-25 to cover potential claims. |

### 2.4 Other

| Requirement | Retention |
|-------------|-----------|
| **ATO business records** | 5 years for financial/tax records |
| **Notifiable Data Breaches (NDB) scheme** | Breach investigation records should be retained for at least 5 years |

---

## 3. Retention Periods

Moveify adopts the **most conservative** position across all applicable laws to ensure compliance nationally.

| Data category | Retention period | Basis |
|--------------|-----------------|-------|
| **Patient health data** (programs, exercise completions, pain scores, check-ins, conditions) | **7 years** from last clinical interaction, OR until the patient turns **25 years old**, whichever is **longer** | NSW HRIP Act, VIC Health Records Act, AHPRA guidelines, limitation periods |
| **Patient demographics** (name, DOB, email, phone, address) | Same as health data — retained together as part of the clinical record | Cannot separate identifying information from the health record during the retention period |
| **Clinician records** (name, email, role) | **Duration of employment + 7 years** | Professional record-keeping; limitation periods |
| **Authentication data** (hashed passwords, invitation tokens) | **Duration of active account + 90 days** after account deactivation | No clinical value; APP 11.2 — destroy when no longer needed. 90-day grace period for account reactivation. |
| **Expired invitation tokens** | **90 days** after expiry | No purpose once expired |
| **Audit logs** | **7 years** from creation | Supports breach investigation, legal compliance, and professional accountability |
| **Education module records** (completion/viewed status) | Same as patient health data | Part of the clinical record |
| **Breach investigation records** | **7 years** from resolution of the breach | NDB scheme obligations; potential regulatory action |
| **Backup data** | **7-day rolling retention** (current setting) | Operational — not a long-term archive. Backups older than 7 days are automatically deleted by Cloud SQL. |

### 3.1 "Last clinical interaction" defined

The retention clock starts from the **most recent** of:
- Last exercise completion logged by the patient
- Last daily check-in submitted
- Last program assigned or modified by a clinician
- Last login by the patient
- Last data access request or profile update

If a patient account is inactive (no interaction) for 7 years, the retention period has been met and data becomes eligible for destruction or de-identification.

### 3.2 Minor patients

For patients whose date of birth indicates they were under 18 at the time of their last clinical interaction:
- Retain all records until the patient turns **25 years old**
- If 7 years from the last interaction is longer than age 25, use the 7-year period instead
- **Always use whichever period is longer**

Example: A 10-year-old patient's last interaction is in 2026. Age 25 = 2041. Seven years from last interaction = 2033. Retain until **2041**.

---

## 4. Data Destruction and De-identification

### 4.1 When data becomes eligible

Data becomes eligible for destruction when the applicable retention period in Section 3 has expired **and** the data is not:
- Subject to an active legal hold or dispute
- Required for an ongoing investigation (breach, complaint, audit)
- Needed for any other permitted purpose under the APPs

### 4.2 Destruction methods

| Data type | Method |
|-----------|--------|
| Database records (Cloud SQL) | Permanent deletion via SQL `DELETE` statements, followed by `VACUUM` to reclaim space |
| Backup data | Automatic expiry via Cloud SQL 7-day retention policy |
| Local copies (if any) | Secure deletion from all devices |
| Exported data (CSV/JSON sent to patients) | Moveify's responsibility ends at delivery — patients are advised to manage their own copies |

### 4.3 De-identification as alternative

Where data has research or operational value (e.g., aggregate analytics), de-identification may be used instead of destruction. De-identified data must:
- Have all direct identifiers removed (name, email, phone, DOB, address)
- Have indirect identifiers generalised (e.g., age bands instead of exact DOB, condition categories instead of specific diagnoses)
- Not be reasonably capable of re-identification when combined with other available data
- Comply with the OAIC's guidance on de-identification (2018)

---

## 5. Patient Data Requests

### 5.1 Access (APP 12)

Patients can request access to their data via the "My Data" page in the patient portal. This is already implemented.

### 5.2 Deletion (APP 13 / right to erasure considerations)

Patients may request deletion of their data. However:
- **Moveify may refuse deletion during the mandatory retention period** — health records legislation requires retention for the minimum periods specified in Section 3
- If the retention period has not expired, Moveify will acknowledge the request and schedule deletion for when the retention period ends
- If the retention period has expired, Moveify will process the deletion within 30 days
- All deletion requests and outcomes are logged in the audit trail

### 5.3 Correction (APP 13)

Patients may request corrections to their personal information at any time, regardless of the retention period. Corrections must be processed promptly.

---

## 6. Implementation

### 6.1 Current state

Moveify does not currently implement automated data destruction. All data is retained indefinitely in Cloud SQL with:
- Encryption at rest (Cloud SQL default)
- 7-day automated backup retention
- Access controls (JWT auth, role-based access, audit logging)

### 6.2 Future implementation (recommended)

When the platform matures and data volumes warrant it, implement:

1. **Automated retention review** — periodic job that flags records past their retention date
2. **Admin review workflow** — admin reviews flagged records before destruction (no fully automated deletion of health records)
3. **Legal hold capability** — ability to exempt specific records from destruction
4. **Destruction audit trail** — log what was destroyed, when, by whom, and under what authority

> **Note:** Given Moveify launched in 2026, the earliest any data will reach the 7-year retention threshold is 2033. Automated destruction tooling is not urgent but should be built before that date.

---

## 7. Responsibilities

| Role | Responsibility |
|------|---------------|
| **Ryan Heath (Data Owner)** | Approves retention periods, authorises destruction, handles patient disputes |
| **Technical Lead** | Implements retention controls, manages backups, executes destruction |
| **All clinicians** | Follow data minimisation principles — do not collect information beyond what is clinically necessary |

---

## 8. Review and Updates

This policy must be reviewed:
- **Annually** as part of the privacy compliance review
- When relevant legislation changes (federal or state/territory)
- After any data breach or OAIC investigation
- When expanding to new jurisdictions or data categories

---

## 9. Document History

| Date | Version | Change |
|------|---------|--------|
| 2026-03-07 | 1.0 | Initial data retention policy |
