import { ArrowLeft } from 'lucide-react';

export const TermsPage = () => {
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
            Terms and Conditions
          </h1>
          <p className="text-sm text-slate-500 mt-2">Last updated: 7 March 2026</p>
        </div>

        {/* Terms Content */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8 sm:p-10 space-y-8">

          {/* 1. About these terms */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">1. About these terms</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              These terms and conditions govern your use of the Moveify platform, operated by Ryan Douglas Heath trading as Moveify Health Solutions (ABN 52 263 141 529). By accessing or using Moveify, you agree to be bound by these terms. If you do not agree, you must not use the platform.
            </p>
          </section>

          {/* 2. The service */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">2. The service</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Moveify is a clinical exercise prescription and patient management platform. It enables:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li><strong>Clinicians</strong> to build exercise programs, assign them to patients, track progress, and manage education content.</li>
              <li><strong>Patients</strong> to view assigned exercise programs, log exercise completions, complete daily wellness check-ins, and access educational materials.</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              Moveify is provided to patients at no charge as part of their clinical care. Access to the platform is by invitation only — accounts are created by your treating clinician.
            </p>
          </section>

          {/* 3. Not medical advice */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">3. Not medical advice</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Moveify is a tool used by qualified health professionals to deliver exercise programs. <strong>The platform itself does not provide medical advice, diagnosis, or treatment.</strong> All exercise programs are prescribed by your treating clinician, who is solely responsible for the clinical appropriateness of your program. If you experience pain, discomfort, or worsening symptoms during any exercise, stop immediately and contact your clinician or seek medical attention.
            </p>
          </section>

          {/* 4. Eligibility and accounts */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">4. Eligibility and accounts</h2>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>You must be at least 16 years of age to create an account. Patients under 16 must have a parent or guardian manage their account.</li>
              <li>Accounts are created via clinician invitation only. There is no public registration.</li>
              <li>You are responsible for maintaining the confidentiality of your login credentials. You must not share your account with any other person.</li>
              <li>You must provide accurate and current information when setting up your account. If your contact details change, you should update your profile or notify your clinician.</li>
            </ul>
          </section>

          {/* 5. Acceptable use */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">5. Acceptable use</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              You agree not to:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>Use the platform for any purpose other than its intended clinical use.</li>
              <li>Attempt to access another user's account or data.</li>
              <li>Attempt to circumvent security measures, authentication controls, or rate limits.</li>
              <li>Upload malicious content, scripts, or any material that could compromise the platform.</li>
              <li>Use automated tools, bots, or scrapers to access the platform.</li>
              <li>Copy, reproduce, or redistribute any content from the platform without permission.</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              We reserve the right to suspend or terminate your account if you breach these terms.
            </p>
          </section>

          {/* 6. Clinician responsibilities */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">6. Clinician responsibilities</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Clinicians who use Moveify acknowledge and agree that:
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>They are solely responsible for the clinical appropriateness and safety of any exercise program they prescribe through the platform.</li>
              <li>They hold current and valid registration or accreditation with the relevant professional body for their profession (e.g., AHPRA for physiotherapists, ESSA for exercise physiologists).</li>
              <li>They will only invite patients who are under their active clinical care.</li>
              <li>They will comply with their professional code of conduct and all applicable laws when using the platform, including obligations under the <em>Privacy Act 1988</em> (Cth).</li>
              <li>They are responsible for obtaining any patient consent required by their professional obligations, beyond the health data consent obtained by Moveify during account setup.</li>
            </ul>
          </section>

          {/* 7. Intellectual property */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">7. Intellectual property</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              All intellectual property in the Moveify platform — including the software, design, branding, logos, and built-in exercise library — is owned by or licensed to Moveify Health Solutions. You are granted a limited, non-exclusive, non-transferable licence to use the platform for its intended purpose. Custom exercises created by clinicians remain accessible to all clinicians on the platform as part of the shared exercise library.
            </p>
          </section>

          {/* 8. Privacy */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">8. Privacy</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your use of Moveify is also governed by our{' '}
              <a href="/privacy-policy" className="text-primary-500 hover:text-primary-600 font-medium">
                Privacy Policy
              </a>
              , which explains how we collect, use, and protect your personal and health information. By using the platform, you acknowledge that you have read and understood the Privacy Policy.
            </p>
          </section>

          {/* 9. Availability and changes */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">9. Availability and changes</h2>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>We aim to keep the platform available at all times but do not guarantee uninterrupted access. Planned maintenance, updates, or unforeseen technical issues may cause temporary downtime.</li>
              <li>We may update, modify, or discontinue features of the platform at any time. Where changes materially affect your use, we will provide reasonable notice.</li>
              <li>We reserve the right to update these terms. The "last updated" date at the top of this page indicates when the terms were last revised. Continued use of the platform after changes constitutes acceptance of the updated terms.</li>
            </ul>
          </section>

          {/* 10. Limitation of liability */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">10. Limitation of liability</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              To the maximum extent permitted by law, including the <em>Australian Consumer Law</em> (Schedule 2 of the <em>Competition and Consumer Act 2010</em>):
            </p>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>Moveify Health Solutions is not liable for any injury, loss, or damage arising from your performance of exercises prescribed through the platform. Exercise programs are the clinical responsibility of your treating clinician.</li>
              <li>Moveify Health Solutions is not liable for any indirect, incidental, or consequential loss arising from your use of or inability to use the platform.</li>
              <li>Our total liability to you for any claim arising from these terms or your use of the platform is limited to the amount you have paid for the service (which, for patients, is nil).</li>
            </ul>
            <p className="text-sm text-slate-600 leading-relaxed mt-3">
              Nothing in these terms excludes or limits liability that cannot be excluded under Australian law, including liability for fraud, personal injury caused by negligence, or guarantees under the Australian Consumer Law that cannot be excluded.
            </p>
          </section>

          {/* 11. Indemnity */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">11. Indemnity</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              You agree to indemnify and hold harmless Moveify Health Solutions from any claims, losses, or damages arising from your breach of these terms, your misuse of the platform, or (for clinicians) the exercise programs you prescribe through the platform.
            </p>
          </section>

          {/* 12. Termination */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">12. Termination</h2>
            <ul className="text-sm text-slate-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>You may stop using the platform at any time. To request account deletion, use the "My Data" page in your account or contact us.</li>
              <li>We may suspend or terminate your account if you breach these terms, or if your treating clinician requests removal.</li>
              <li>On termination, your data will be retained in accordance with our data retention obligations (minimum 7 years for health records, as outlined in our Privacy Policy).</li>
            </ul>
          </section>

          {/* 13. Governing law */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">13. Governing law</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              These terms are governed by the laws of the State of South Australia. You submit to the non-exclusive jurisdiction of the courts of South Australia and any courts entitled to hear appeals from those courts.
            </p>
          </section>

          {/* 14. Contact */}
          <section>
            <h2 className="text-base font-semibold font-display text-secondary-500 mb-2">14. Contact</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              If you have any questions about these terms, please contact:
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
