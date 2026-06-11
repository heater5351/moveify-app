import { ArrowLeft } from 'lucide-react';

export const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/assets/moveify-logo.png"
            alt="Moveify Logo"
            className="h-14 w-auto mx-auto mb-6"
          />
          <h1 className="text-2xl font-semibold font-display text-secondary-500 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-500 mt-2">Last updated: 9 June 2026</p>
        </div>

        {/* Policy Content */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8 sm:p-10 space-y-8">

          {/* 1. About this policy */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">1. About this policy</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Moveify is operated by Ryan Douglas Heath, trading as <strong>Moveify Health Solutions</strong> (ABN 52 263 141 529). This policy explains how we collect, use, store, and disclose your personal information under the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs). It applies to <strong>Moveify's clinical exercise physiology services and the Moveify app/platform</strong>, and to everyone who uses them, including patients and clinicians.
            </p>
          </section>

          {/* 2. Information we collect */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">2. Information we collect</h2>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Account &amp; contact information:</strong> name, email, date of birth, phone, address, and emergency contact details.</li>
              <li><strong>Identifiers &amp; funding information:</strong> Medicare number/IRN; DVA, NDIS, or ReturnToWorkSA participant/claim numbers; private health insurer details; and your GP or referrer's details — where relevant to your care or claiming.</li>
              <li><strong>Health &amp; clinical data (sensitive information):</strong> medical conditions, medications, injury/surgery/falls history, pre-exercise screening responses, assessment and functional-testing results, exercise program details, exercise completion records (sets/reps/weight), RPE and pain scores, daily wellness check-ins (mood, pain, energy, sleep), and clinical notes.</li>
              <li><strong>Consultation audio &amp; AI-generated notes:</strong> where you consent, audio of your consultation is briefly recorded <strong>solely to generate a written clinical note</strong> — see section 6.</li>
              <li><strong>Payment &amp; billing information:</strong> the bank account or card details you provide for direct debit, and your transaction history. Card and bank details are handled by our payment providers (section 7); we do not store full card numbers.</li>
              <li><strong>Usage data:</strong> audit logs recording logins, data access, and program modifications, for security and compliance.</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              Health and clinical data is <strong>sensitive information</strong> under the Privacy Act and receives the highest level of protection.
            </p>
          </section>

          {/* 3. How we collect it */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">3. How we collect information</h2>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Directly from you</strong> — at intake (the Consent &amp; Pre-Exercise Questionnaire), when you create your account, log exercise completions, complete wellness check-ins, or update your profile.</li>
              <li><strong>From your clinician</strong> — when they create your record, assign programs, or update clinical details.</li>
              <li><strong>From session recordings</strong> — where you have consented (section 6).</li>
              <li><strong>From third parties you authorise</strong> — e.g. your GP or referrer, or your funding scheme.</li>
              <li><strong>Automatically</strong> — audit logs generated as you use the platform.</li>
            </ul>
          </section>

          {/* 4. Why we collect it */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">4. Why we collect your information</h2>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>To deliver clinical exercise prescription and rehabilitation, and to monitor and adjust your program.</li>
              <li>To generate and maintain your clinical documentation (including the AI-assisted note in section 6).</li>
              <li>To coordinate your care with your GP and other healthcare providers (with your consent).</li>
              <li>To bill and claim for your care, including from funded schemes where applicable.</li>
              <li>To let you track your exercise and wellness over time.</li>
              <li>To authenticate your identity and secure your account, send transactional emails, and maintain audit trails for security, compliance, and dispute resolution.</li>
            </ul>
          </section>

          {/* 5. Sensitive health information & consent */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">5. Sensitive health information and consent</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Under APP 3 we obtain your <strong>explicit consent</strong> before collecting sensitive health information. Consent is captured at intake (the Consent &amp; Pre-Exercise Questionnaire) and at account setup, with <strong>separate, optional consents</strong> for GP communication, app data collection, and session recording. You may withdraw any consent at any time by contacting us (section 15); withdrawing some consents may affect our ability to provide parts of the service.
            </p>
          </section>

          {/* 6. Session recording & AI clinical documentation */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">6. Session recording and AI clinical documentation</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              With your consent, your treating clinician may record the audio of your consultation <strong>only to produce a written clinical note</strong>. The process is:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>Audio is recorded during the consultation and transmitted securely (encrypted in transit).</li>
              <li>It is transcribed using <strong>AWS Transcribe</strong>, and a structured clinical note is drafted using <strong>AWS Bedrock</strong>.</li>
              <li>All processing occurs in <strong>AWS's Sydney, Australia region</strong> — your audio and its transcript <strong>never leave Australia</strong>.</li>
              <li>Your clinician <strong>reviews and approves</strong> the note before it is saved.</li>
              <li><strong>The audio is permanently deleted immediately after transcription. It is never stored.</strong></li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              This processing is covered by a contractual data-protection agreement with AWS (a Business Associate Addendum). You can decline session recording without affecting your treatment.
            </p>
          </section>

          {/* 7. Third-party service providers */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">7. Third-party service providers</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              We use the following providers to operate our services:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Google Cloud Platform (Cloud SQL):</strong> primary database hosting in Sydney, Australia (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">australia-southeast1</code>). All health data is stored here.</li>
              <li><strong>Amazon Web Services (Sydney):</strong> powers our AI features — the session-recording note pipeline (section 6) and the optional AI Exercise Assistant used by clinicians. <strong>All AWS AI processing occurs in Australia (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">ap-southeast-2</code>).</strong> No health data is sent overseas.</li>
              <li><strong>Stripe:</strong> processes direct debit and card payments for clinical service fees. Stripe handles your name, contact, and bank/card details; <strong>it does not receive any health data</strong>.</li>
              <li><strong>Tyro:</strong> processes in-clinic EFTPOS and HICAPS card payments. Tyro is an Australian provider.</li>
              <li><strong>Vercel:</strong> hosts our front-end application (HTML/CSS/JavaScript). <strong>No personal or health data is stored on or transmitted through Vercel.</strong></li>
              <li><strong>Gmail API:</strong> sends transactional emails (account setup, password resets). <strong>Only email addresses are processed — never health data.</strong></li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              We do not sell, rent, or trade your personal information.
            </p>
          </section>

          {/* 8. Cross-border disclosure */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">8. Cross-border disclosure</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              In accordance with APP 8, <strong>all of your health and clinical data — including the AI session-note and AI Exercise Assistant processing — is stored and processed exclusively in Australia</strong> (Google Cloud and AWS, Sydney). No health data is disclosed or transferred overseas.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Limited <strong>non-health</strong> data involves overseas processing:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Vercel</strong> hosts our front-end from infrastructure that includes the United States, but <strong>no personal or health data</strong> passes through it.</li>
              <li><strong>Gmail API</strong> processes <strong>email addresses only</strong> for transactional emails.</li>
              <li><strong>Stripe</strong> may process your <strong>payment and contact details</strong> (not health data) in the United States under its Data Processing Agreement, which includes Standard Contractual Clauses for cross-border transfers.</li>
            </ul>
          </section>

          {/* 9. Who we share your information with */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">9. Who we share your information with</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Access and disclosure are limited to:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Your treating clinician(s)</strong> and our <strong>system administrator</strong> (for technical support, security, and compliance).</li>
              <li><strong>Your GP and other healthcare providers</strong> — with your consent, to coordinate your care and support Medicare Chronic Disease Management claims.</li>
              <li><strong>Funded schemes</strong> — Medicare/Services Australia, the Department of Veterans' Affairs, the NDIA/NDIS, ReturnToWorkSA, and private health insurers — only as needed to bill or claim for your care, and only the scheme(s) relevant to you.</li>
              <li><strong>Our service providers</strong> (section 7), under contract.</li>
              <li><strong>As required or authorised by law.</strong></li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              We do not sell, rent, or trade your personal information.
            </p>
          </section>

          {/* 10. Data security */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">10. Data security</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              We take reasonable steps to protect your information from misuse, loss, and unauthorised access, modification, or disclosure:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>Encryption in transit (TLS/HTTPS) and at rest.</li>
              <li>Consultation audio encrypted in transit and <strong>deleted immediately after transcription</strong> (never stored).</li>
              <li>Password hashing (bcrypt); JWT authentication with role-based access control.</li>
              <li>Rate limiting on authentication; security headers (CSP, X-Frame-Options).</li>
              <li>Audit logging of key operations; automated daily database backups (7-day retention).</li>
              <li>No public signup — accounts are created only via clinician invitation.</li>
            </ul>
          </section>

          {/* 11. Data retention */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">11. Data retention</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              In accordance with APP 11, we retain your clinical records for <strong>7 years after your last service, or until you reach 25 years of age, whichever is longer</strong>, as required for clinical record-keeping. After that period your data is securely destroyed. If your account is deleted earlier, your clinical records are still retained for that period. <strong>Consultation audio is not retained</strong> — it is deleted immediately after transcription (section 6).
            </p>
          </section>

          {/* 12. Your rights */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">12. Your rights</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Under the APPs you may:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Access (APP 12)</strong> — request a copy of the information we hold about you.</li>
              <li><strong>Correct (APP 13)</strong> — request correction of inaccurate, out-of-date, incomplete, or misleading information.</li>
              <li><strong>Withdraw consent</strong> — including for GP communication or session recording, without necessarily ending your treatment.</li>
              <li><strong>Complain</strong> — see section 13.</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              Contact{' '}
              <a href="mailto:ryan@moveifyhealth.com" className="text-primary-500 hover:text-primary-600 font-medium">
                ryan@moveifyhealth.com
              </a>; we respond within 30 days.
            </p>
          </section>

          {/* 13. Complaints */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">13. Complaints</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              If you believe your privacy has been breached, contact{' '}
              <a href="mailto:ryan@moveifyhealth.com" className="text-primary-500 hover:text-primary-600 font-medium">
                ryan@moveifyhealth.com
              </a>{' '}
              — we investigate and respond within 30 days. If unsatisfied, you may complain to the Office of the Australian Information Commissioner (OAIC):{' '}
              <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-600 font-medium">www.oaic.gov.au</a>{' '}
              · 1300 363 992 · GPO Box 5218, Sydney NSW 2001.
            </p>
          </section>

          {/* 14. Changes to this policy */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">14. Changes to this policy</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              We may update this policy from time to time. The "last updated" date shows the latest revision; we notify affected users by email of material changes.
            </p>
          </section>

          {/* 15. Contact */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">15. Contact</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              If you have any questions about this privacy policy or how we handle your personal information, please contact:
            </p>
            <div className="mt-3 bg-slate-50 rounded-lg px-4 py-3">
              <p className="text-sm text-slate-700 font-medium">Ryan Douglas Heath, trading as Moveify Health Solutions</p>
              <p className="text-sm text-slate-600">ABN 52 263 141 529</p>
              <p className="text-sm text-slate-600">
                Email:{' '}
                <a href="mailto:ryan@moveifyhealth.com" className="text-primary-500 hover:text-primary-600 font-medium">
                  ryan@moveifyhealth.com
                </a>
              </p>
            </div>
          </section>
        </div>

        {/* Back to sign in */}
        <div className="mt-6 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors"
          >
            <ArrowLeft size={14} />
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
};
