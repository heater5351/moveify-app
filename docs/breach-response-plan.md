# Moveify Data Breach Response Plan

**Version:** 1.0
**Last reviewed:** 2026-03-07
**Owner:** Moveify Health Pty Ltd
**Review frequency:** Annually or after any breach incident

This plan addresses obligations under the **Notifiable Data Breaches (NDB) scheme** (Part IIIC of the Privacy Act 1988) and the **Australian Privacy Principles (APP 11)**.

---

## 1. Definitions

**Data breach:** Unauthorised access to, disclosure of, or loss of personal information held by Moveify.

**Eligible data breach:** A breach that is likely to result in **serious harm** to any individual whose personal information is involved, and the organisation has not been able to prevent the likely risk of serious harm through remedial action.

**Personal information held by Moveify:**
- Patient demographics (name, email, phone, DOB, address)
- Health information (conditions, pain scores, exercise completions, daily check-in data, program prescriptions)
- Clinician details (name, email, credentials)
- Authentication data (hashed passwords, JWT tokens)
- Audit logs (access records, IP addresses)

> **Note:** All patient health data is classified as **sensitive information** under the Privacy Act and carries the highest protection tier. Any breach involving health data is more likely to meet the "serious harm" threshold.

---

## 2. Breach Response Team

| Role | Responsibility |
|------|---------------|
| **Breach Lead** | Coordinates the response, makes notification decisions, communicates with OAIC |
| **Technical Lead** | Investigates the breach, contains it, assesses scope, implements fixes |
| **Communications Lead** | Drafts notifications to affected individuals and stakeholders |

For a small team, one person may fill multiple roles. The key requirement is that someone is clearly designated as Breach Lead before an incident occurs.

**Current assignments:**
- Breach Lead: _[Assign name]_
- Technical Lead: _[Assign name]_
- Communications Lead: _[Assign name]_

---

## 3. Response Phases

### Phase 1: Contain (Immediate — within hours)

**Goal:** Stop the breach and limit further exposure.

Actions:
1. Isolate affected systems (e.g., revoke compromised credentials, block suspicious IPs, disable affected API endpoints)
2. If a user account is compromised, invalidate their JWT tokens by rotating `JWT_SECRET` (note: this invalidates ALL sessions — use only if breach scope is unclear)
3. If database credentials are compromised, rotate Cloud SQL passwords immediately
4. Preserve evidence — do NOT delete logs, affected records, or system state
5. Record the time the breach was discovered (this starts the 30-day assessment clock)

**Evidence to preserve:**
- Audit logs (`audit_logs` table)
- Cloud Run access logs (GCP Cloud Logging)
- Cloud SQL query logs (if enabled)
- Any error reports or alerts that indicated the breach

### Phase 2: Assess (Within 30 calendar days of awareness)

**Goal:** Determine if the breach is an "eligible data breach" requiring notification.

> **Legal deadline:** You must complete a reasonable assessment within **30 calendar days** of becoming aware of grounds to suspect a breach (s26WH). If at any point during assessment you form a reasonable belief the breach is eligible, you must notify immediately — do not wait for the 30 days to expire.

Assessment checklist:

- [ ] **What data was involved?** (names, emails, health data, passwords, etc.)
- [ ] **How many individuals are affected?**
- [ ] **What was the cause?** (external attack, insider access, misconfiguration, lost device, etc.)
- [ ] **What is the scope?** (single patient, all patients, clinicians, both?)
- [ ] **Were passwords compromised?** (bcrypt-hashed — low risk of plaintext exposure, but credential stuffing risk remains)
- [ ] **Was health data accessed?** (if yes, serious harm threshold is almost certainly met)
- [ ] **Can remedial action prevent serious harm?** (e.g., forcing password resets before any misuse occurs)
- [ ] **Is there evidence of actual misuse?**

**Serious harm factors** (s26WG):
- The kind of information (health data = high sensitivity)
- Whether the information is protected by security measures (encryption, hashing)
- The persons who have obtained the information
- The nature of the harm that could result

**Decision:**
- If health data was accessed by an unauthorised party → **almost certainly an eligible data breach** → proceed to Phase 3
- If only hashed passwords were exposed and passwords are reset before misuse → may not be eligible, but document reasoning
- If in doubt, **notify** — the consequences of failing to notify are far worse than over-notifying

### Phase 3: Notify (As soon as practicable after forming reasonable belief)

> **Legal requirement:** Notify both the **OAIC** and all **affected individuals** "as soon as practicable" after forming a reasonable belief the breach is eligible (s26WK, s26WL). There is no fixed day count — the OAIC enforces this strictly.

#### 3a. Notify the OAIC

Submit via the [Notifiable Data Breach form](https://www.oaic.gov.au/privacy/notifiable-data-breaches/report-a-data-breach) on the OAIC website.

Required information:
- Organisation name and contact details
- Description of the breach
- Kind(s) of information involved
- Recommended steps for affected individuals

#### 3b. Notify affected individuals

Notification must include (s26WN):
1. Organisation name and contact details
2. Description of the data breach
3. The kinds of information involved
4. Recommended steps the individual should take (e.g., change passwords, monitor for suspicious activity)

**Notification methods (in order of preference):**
1. Direct email to each affected individual (use the Gmail API integration)
2. If email addresses are compromised or unavailable, publish a notice on the Moveify website and notify via any other available contact method

**Template:**

> Subject: Important: Data Breach Notification — Moveify Health
>
> Dear [Name],
>
> We are writing to inform you of a data breach that may have affected your personal information held by Moveify Health.
>
> **What happened:** [Brief description of the breach]
>
> **What information was involved:** [List the specific types — e.g., name, email, health condition, exercise data]
>
> **What we are doing:** [Actions taken to contain and remediate]
>
> **What you should do:**
> - Change your Moveify password immediately
> - [If health data: Be alert to any unsolicited contact referencing your health information]
> - [If email compromised: Monitor for phishing attempts]
>
> **Contact us:** If you have questions, contact [breach lead email/phone].
>
> You may also contact the Office of the Australian Information Commissioner (OAIC) at [oaic.gov.au](https://www.oaic.gov.au) or 1300 363 992.

### Phase 4: Remediate and Review (Post-notification)

1. Implement permanent technical fixes for the vulnerability that caused the breach
2. Review and update access controls, monitoring, and security configurations
3. Conduct a post-incident review documenting:
   - Root cause analysis
   - Timeline of events
   - Effectiveness of the response
   - Changes to prevent recurrence
4. Update this breach response plan based on lessons learned
5. Brief all team members on changes

---

## 4. Breach Scenarios and Playbooks

### Scenario A: Compromised database credentials

1. Immediately rotate Cloud SQL password via GCP Console
2. Update `DB_PASSWORD` in Cloud Run environment variables and redeploy
3. Review Cloud SQL audit logs for unauthorised queries
4. Assess what data was accessed

### Scenario B: Compromised JWT_SECRET

1. Rotate `JWT_SECRET` in Cloud Run environment (this invalidates ALL active sessions)
2. All users will need to log in again
3. Review audit logs for suspicious API access patterns
4. Check if any tokens were used from unusual IPs

### Scenario C: Unauthorised API access (broken access control)

1. Identify the vulnerable endpoint and deploy a fix or disable it
2. Review audit logs to determine which records were accessed
3. Identify all affected patients by cross-referencing accessed resource IDs
4. Assess whether health data was exposed

### Scenario D: Cloud infrastructure compromise

1. Contact GCP support immediately
2. Review Cloud Logging for unauthorised access
3. Rotate all credentials (database, JWT secret, Gmail API tokens)
4. Consider whether data at rest was accessed (Cloud SQL encryption provides baseline protection)

### Scenario E: Insider access (clinician accessing data beyond their role)

1. Currently all clinicians can access all patients (shared access model) — this is by design
2. If a clinician's account is compromised, disable their account and rotate their password
3. Review audit logs filtered by the clinician's user ID
4. Notify affected patients whose data was accessed during the compromise period

---

## 5. Preventive Measures (Current)

| Measure | Status |
|---------|--------|
| Encryption at rest (Cloud SQL default) | Active |
| Encryption in transit (HTTPS/TLS) | Active |
| Passwords hashed with bcrypt | Active |
| JWT authentication on all API routes | Active |
| Role-based access control | Active |
| Rate limiting on auth endpoints | Active |
| Security headers (helmet) | Active |
| CORS hardened (no wildcard in production) | Active |
| Audit logging of key operations | Active |
| No public signup (invitation-only) | Active |
| Data stored in australia-southeast1 | Active |
| Daily automated backups (7-day retention) | Active |

---

## 6. Contact Information

| Contact | Details |
|---------|---------|
| OAIC breach notification | [oaic.gov.au/privacy/notifiable-data-breaches](https://www.oaic.gov.au/privacy/notifiable-data-breaches) |
| OAIC enquiries line | 1300 363 992 |
| GCP support | Via GCP Console |

---

## 7. Document History

| Date | Version | Change |
|------|---------|--------|
| 2026-03-07 | 1.0 | Initial breach response plan |
