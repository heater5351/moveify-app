# Privacy & Compliance (Australian Privacy Act 1988)

Moveify stores **sensitive health information** (patient demographics, conditions, pain scores, exercise completions, daily wellness check-ins). This carries legal obligations under Australian law. When writing code that touches patient data, always consider these requirements.

## Key rules

- Moveify is fully covered by the Privacy Act and all 13 APPs (health data = sensitive information, no small business exemption for health service providers)
- **Do not move Cloud SQL to a non-Australian region** without legal review (data must stay in `australia-southeast1`)
- Compliance docs: `docs/breach-response-plan.md`, `docs/data-retention-policy.md`
- Privacy policy at `/privacy-policy`, data export/deletion feature exists, health data consent on signup

## Remaining compliance gap

- **IAM permissions not yet reviewed** for least-privilege

## Development guidelines

- **Never log patient health data** (pain scores, conditions, check-in responses) to console or files — use anonymized IDs only
- **Never expose health data in URLs** (query params, path segments)
- **Always validate authorization** before returning patient data — a patient must only see their own data; any clinician can access any patient
- **Treat all patient-facing endpoints as security-critical** — validate input, sanitize output, check roles
- **Do not add analytics, tracking, or third-party scripts** that could access patient health data without explicit legal review
