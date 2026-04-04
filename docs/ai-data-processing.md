# AI Assistant — Data Processing Arrangement

**Last updated:** 4 April 2026

## Summary

Moveify's AI Exercise Assistant feature uses Anthropic's Claude API to generate exercise program suggestions for clinicians. This document records the data processing arrangement for compliance purposes under the Australian Privacy Act 1988 (APP 8).

## What is sent to Anthropic

Only de-identified clinical descriptions are transmitted. Examples:
- Injury type and stage ("post-ACL reconstruction, week 6–8")
- Rehabilitation goal ("return to sport")
- Current program exercises (names, sets, reps — no patient identity)

**Never sent to Anthropic:**
- Patient names, dates of birth, phone numbers, or email addresses
- Patient IDs or database record identifiers
- Exercise completion history or check-in responses
- Clinician identity (only used for rate limiting server-side)

## PHI Stripping

Before any message is transmitted to Anthropic, an automated process (`backend/services/phi-stripper.js`) removes:
- Patient names (matched against all patient names in the database)
- Phone numbers (Australian formats: 04xx, landlines, +61)
- Email addresses
- Dates in numeric format (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY)
- Dates in written format (e.g., "3 March 1990", "March 3rd, 1990")
- Medicare numbers
- Street addresses

A UI warning is displayed above the input: "Do not include patient names, dates of birth, or contact details."

## Anthropic's Commitments

| Commitment | Detail |
|------------|--------|
| **No training on API data** | Anthropic explicitly commits that API inputs/outputs are never used to train models |
| **Data deletion** | API data is deleted within 7 days by default |
| **DPA** | Anthropic's Data Processing Addendum is automatically incorporated into their Commercial Terms of Service, establishing Anthropic as data processor and Moveify as data controller |
| **Cross-border transfers** | Standard Contractual Clauses (SCCs) are included in the DPA for cross-border transfers |

Sources:
- [Anthropic API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention)
- [Is my data used for model training?](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
- [Anthropic DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa)

## APP 8 Position

APP 8 requires that overseas recipients handle personal information consistently with Australian privacy standards.

**Position:** The information transmitted to Anthropic is de-identified clinical context that cannot reasonably identify any individual. It does not constitute "personal information" under the Privacy Act, and APP 8's cross-border disclosure obligations therefore do not apply to this transmission. The PHI stripping layer and the UI warning together form the control that maintains this position.

**If PHI stripping fails:** In the event that identifying information is inadvertently transmitted (e.g., a clinician ignores the warning and the stripper misses an unusual name format), Anthropic's DPA, no-training commitment, and 7-day deletion provide secondary protection. This would not constitute a Notifiable Data Breach under the NDB scheme unless the information was accessed by an unauthorised party — Anthropic as a contracted processor is an authorised recipient under the DPA.

## Rate Limits & Usage Logging

- **Daily limit:** 50 requests per clinician per day
- **Usage logged:** clinician ID, token counts, model name, timestamp — no message content
- **Rate limit:** 10 requests per minute per IP (backend enforced)
