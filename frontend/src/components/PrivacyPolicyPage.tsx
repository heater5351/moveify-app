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
          <p className="text-sm text-slate-500 mt-2">Last updated: 4 April 2026</p>
        </div>

        {/* Policy Content */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8 sm:p-10 space-y-8">

          {/* 1. About this policy */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">1. About this policy</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Moveify is operated by Ryan Douglas Heath (ABN 52 263 141 529). This privacy policy explains how we collect, use, store, and disclose your personal information in accordance with the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs). It applies to all users of the Moveify platform, including clinicians and patients.
            </p>
          </section>

          {/* 2. Information we collect */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">2. Information we collect</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              We collect the following categories of personal information:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Account information:</strong> name, email address, date of birth, phone number, and address.</li>
              <li><strong>Health and clinical data:</strong> medical conditions, exercise program details, exercise completion records, sets/reps/weight performed, RPE (Rate of Perceived Exertion) ratings, pain scores, and daily wellness check-in responses (mood, pain level, energy, sleep quality).</li>
              <li><strong>Usage data:</strong> audit logs recording login events, data access, and program modifications (used for security and compliance purposes).</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              Health and clinical data is classified as <strong>sensitive information</strong> under the Privacy Act and receives the highest level of protection.
            </p>
          </section>

          {/* 3. How we collect it */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">3. How we collect information</h2>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Directly from you:</strong> when you create your account, log exercise completions, complete daily wellness check-ins, or update your profile.</li>
              <li><strong>From your clinician:</strong> when they create your patient record, assign exercise programs, or update your clinical details.</li>
              <li><strong>Automatically:</strong> audit logs are generated when you use the platform for security and compliance purposes.</li>
            </ul>
          </section>

          {/* 4. Why we collect it */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">4. Why we collect your information</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              We collect your personal information for the following purposes:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>To provide clinical exercise prescription and rehabilitation program management.</li>
              <li>To enable clinicians to monitor your exercise progress and adjust programs.</li>
              <li>To allow you to track your exercise completions and wellness over time.</li>
              <li>To authenticate your identity and secure your account.</li>
              <li>To send transactional emails (account setup, password resets).</li>
              <li>To maintain audit trails for security, compliance, and dispute resolution.</li>
            </ul>
          </section>

          {/* 5. Sensitive health information & consent */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">5. Sensitive health information and consent</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Under APP 3, we are required to obtain your explicit consent before collecting sensitive health information. When you set up your account, you are asked to provide consent to the collection and storage of your health data. You may withdraw your consent at any time by contacting us (see section 14), however this may affect our ability to provide the service.
            </p>
          </section>

          {/* 6. Who can access your data */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">6. Who can access your data</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Access to your personal information is restricted to:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Clinicians:</strong> all clinicians registered within your clinic can view your patient record, assigned programs, exercise completions, and wellness check-ins to deliver your care.</li>
              <li><strong>You:</strong> you can view your own assigned programs, exercise history, and check-in data.</li>
              <li><strong>System administrator:</strong> the system administrator may access data for technical support, security monitoring, and compliance purposes.</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              We do not sell, rent, or trade your personal information to any third party.
            </p>
          </section>

          {/* 7. Third-party service providers */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">7. Third-party service providers</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              We use the following third-party services to operate the platform:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Google Cloud Platform (Cloud SQL):</strong> database hosting in the Sydney, Australia region (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">australia-southeast1</code>). All health data is stored here.</li>
              <li><strong>Vercel:</strong> hosts the static frontend application (HTML, CSS, JavaScript). No health data is stored on or transmitted through Vercel.</li>
              <li><strong>Gmail API:</strong> used to send transactional emails (account invitations, password resets). Only email addresses are processed — no health data is included in emails.</li>
              <li><strong>Anthropic (Claude API):</strong> powers the optional AI Exercise Assistant feature available to clinicians. When a clinician uses this feature, de-identified clinical descriptions (such as injury type or rehabilitation stage) may be transmitted to Anthropic's API to generate exercise program suggestions. Before transmission, an automated process removes patient names, dates of birth, contact details, and other identifying information. Anthropic does not use API data to train its models, and data is deleted from their systems within 7 days. Anthropic's Data Processing Addendum (incorporated into their Commercial Terms of Service) governs this processing. This feature is only available to clinicians — patient data is never sent to Anthropic directly.</li>
            </ul>
          </section>

          {/* 8. Cross-border disclosure */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">8. Cross-border disclosure</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              In accordance with APP 8, your health data is stored exclusively in Australia (Google Cloud Platform, Sydney region). The static frontend application is hosted on Vercel, which operates infrastructure in the United States, but no personal or health data is stored on or transmitted through Vercel servers. Transactional emails are processed by Google's Gmail API — only email addresses are included in these communications, never health data.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              The AI Exercise Assistant feature (available to clinicians only) transmits de-identified clinical descriptions to Anthropic's API, which is operated from the United States. Before any transmission, automated processing removes patient names, dates of birth, phone numbers, email addresses, and other identifying information. The information sent to Anthropic is limited to clinical context such as injury type and rehabilitation stage, and cannot reasonably identify any individual. Anthropic operates under a Data Processing Addendum that includes Standard Contractual Clauses for cross-border data transfers. Anthropic does not use this data for model training, and it is deleted within 7 days.
            </p>
          </section>

          {/* 9. Data security */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">9. Data security</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              We take reasonable steps to protect your personal information from misuse, interference, loss, and unauthorised access, modification, or disclosure. Our security measures include:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>Encryption of data in transit (TLS/HTTPS) and at rest (Google Cloud SQL default encryption).</li>
              <li>Password hashing using bcrypt (passwords are never stored in plain text).</li>
              <li>JWT-based authentication with role-based access controls.</li>
              <li>Rate limiting on authentication endpoints to prevent brute-force attacks.</li>
              <li>Security headers (Content Security Policy, X-Frame-Options) via helmet middleware.</li>
              <li>Audit logging of key operations for security monitoring.</li>
              <li>Automated daily database backups with 7-day retention.</li>
              <li>No public signup — accounts are created only via clinician invitation.</li>
            </ul>
          </section>

          {/* 10. Data retention */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">10. Data retention</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              In accordance with APP 11, we retain your personal information for 7 years after the date of last service delivery. After this period, your data will be securely deleted. If your account is deleted before this period, your health data will be retained for the full 7-year period as required for clinical record-keeping obligations, after which it will be securely destroyed.
            </p>
          </section>

          {/* 11. Your rights */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">11. Your rights</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Under the Australian Privacy Principles, you have the right to:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Access (APP 12):</strong> request a copy of the personal information we hold about you.</li>
              <li><strong>Correction (APP 13):</strong> request that we correct any inaccurate, out-of-date, incomplete, or misleading information.</li>
              <li><strong>Withdraw consent:</strong> withdraw your consent to the collection and use of your health data at any time. Note that this may affect our ability to provide the service.</li>
              <li><strong>Complain:</strong> lodge a complaint if you believe your privacy has been breached (see section 12).</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:ryan@moveifyhealth.com" className="text-primary-500 hover:text-primary-600 font-medium">
                ryan@moveifyhealth.com
              </a>.
              We will respond to your request within 30 days.
            </p>
          </section>

          {/* 12. Complaints */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">12. Complaints</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              If you believe your privacy has been breached or you are unsatisfied with how we have handled your personal information, you can:
            </p>
            <ol className="text-sm text-slate-600 leading-relaxed space-y-2 list-decimal pl-5">
              <li>
                Contact us at{' '}
                <a href="mailto:ryan@moveifyhealth.com" className="text-primary-500 hover:text-primary-600 font-medium">
                  ryan@moveifyhealth.com
                </a>{' '}
                — we will investigate and respond within 30 days.
              </li>
              <li>
                If you are not satisfied with our response, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC):
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li>Website: <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-600 font-medium">www.oaic.gov.au</a></li>
                  <li>Phone: 1300 363 992</li>
                  <li>Post: GPO Box 5218, Sydney NSW 2001</li>
                </ul>
              </li>
            </ol>
          </section>

          {/* 13. Changes to this policy */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">13. Changes to this policy</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              We may update this privacy policy from time to time. The "last updated" date at the top of this page indicates when the policy was last revised. If we make material changes, we will notify affected users via email. We encourage you to review this policy periodically.
            </p>
          </section>

          {/* 14. Contact */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">14. Contact</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              If you have any questions about this privacy policy or how we handle your personal information, please contact:
            </p>
            <div className="mt-3 bg-slate-50 rounded-lg px-4 py-3">
              <p className="text-sm text-slate-700 font-medium">Ryan Douglas Heath</p>
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
