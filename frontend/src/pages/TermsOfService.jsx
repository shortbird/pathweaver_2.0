import React from 'react'
import { Link } from 'react-router-dom'

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>

          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: January 27, 2025</p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="mb-4">
                By accessing or using the Optio platform ("Service"), you agree to be bound by these Terms of Service.
                If you do not agree to these terms, please do not use our Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
              <p className="mb-4">
                Optio is an educational platform designed for K-12 students that combines project-based learning
                with digital achievement tracking. The Service includes:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Quest-based learning system with personalized tasks</li>
                <li>Badge achievements across five skill pillars (STEM, Wellness, Communication, Civics, Art)</li>
                <li>Digital diploma and portfolio creation</li>
                <li>Evidence submission and documentation tools</li>
                <li>XP (experience points) tracking and progression system</li>
                <li>AI Tutor for learning assistance</li>
                <li>Parent dashboard for monitoring and support</li>
                <li>Community features for connecting with other learners</li>
              </ul>
              <p className="mb-4">
                Optio is available as both a digital-only platform and as part of our in-person program,
                Optio Academy. In-person participants must also agree to the{' '}
                <Link to="/academy-agreement" className="text-primary hover:text-optio-purple underline">
                  Optio Academy Agreement
                </Link>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. User Accounts and Age Requirements</h2>
              <p className="mb-4 font-semibold">Age Requirements:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>This Service is intended for K-12 students (ages 5-18)</li>
                <li>Parents or legal guardians must create and manage accounts for children under 13 years old (COPPA compliance)</li>
                <li>Students aged 13 and older may create and manage their own accounts with parental consent</li>
                <li>Parents may monitor their student's activity through the Parent Dashboard</li>
              </ul>
              <p className="mb-4 font-semibold">Account Responsibilities:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>You must provide accurate and complete information when creating an account</li>
                <li>You are responsible for maintaining the confidentiality of your account credentials</li>
                <li>You must notify us immediately of any unauthorized use of your account</li>
                <li>Parent accounts are responsible for all activity conducted under student accounts they manage</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Educational Philosophy and Content</h2>
              <p className="mb-4">
                Optio operates on the philosophy that "The Process Is The Goal." Learning is valued for
                its intrinsic worth and the growth it creates in the present moment, not solely for future outcomes.
              </p>
              <p className="mb-4 font-semibold">User-Generated Content:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>You retain ownership of all content you submit to the Service ("User Content")</li>
                <li>By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use,
                display, and distribute your content as part of the Service for educational and promotional purposes</li>
                <li>You are responsible for ensuring your User Content does not violate any laws or third-party rights</li>
                <li>Students working on business ventures retain all intellectual property rights to their businesses</li>
              </ul>
              <p className="mb-4 font-semibold">Educational Credentials:</p>
              <p className="mb-4">
                Optio Academy participants may earn accredited credentials through our program. Digital diplomas
                and portfolios created through Optio are self-validated educational records that document learning
                achievements. We do not guarantee that these will be recognized by all educational institutions
                or employers, though they are designed to showcase meaningful learning outcomes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Acceptable Use</h2>
              <p className="mb-4">You agree not to:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Submit false, misleading, or plagiarized content or evidence</li>
                <li>Impersonate another person or entity</li>
                <li>Upload content that is offensive, harmful, illegal, or inappropriate for a K-12 educational environment</li>
                <li>Harass, bully, or discriminate against other users</li>
                <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Share account credentials with others</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Subscription, Payments, and Scholarship Programs</h2>

              <h3 className="text-xl font-semibold mb-3">Digital Platform Access</h3>
              <p className="mb-4">
                Access to certain features of the digital Optio platform may require a paid subscription.
                Subscription details and pricing are subject to change with notice.
              </p>

              <h3 className="text-xl font-semibold mb-3">Optio Academy In-Person Program</h3>
              <p className="mb-4">
                Optio Academy is our in-person program that runs on the Optio digital platform at our
                Provo, Utah location. The program costs $300 per month and provides one full day per week
                of in-person learning, mentorship, and facility access.
              </p>

              <h3 className="text-xl font-semibold mb-3">Utah Education Fits All (UEFA) Scholarship</h3>
              <p className="mb-4">
                Optio is an approved provider for the Utah Education Fits All scholarship program.
                Eligible Utah students may use their UEFA scholarship funds to pay for Optio Academy enrollment.
              </p>

              <h3 className="text-xl font-semibold mb-3">Payment Terms</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>All subscriptions are month-to-month with no long-term contract required</li>
                <li>Subscription fees are billed in advance on a recurring monthly basis</li>
                <li>You may cancel your subscription at any time with written notice</li>
                <li>Cancellations take effect at the end of the current billing period</li>
                <li>All fees are non-refundable unless otherwise stated or required by law</li>
                <li>We reserve the right to modify pricing with 30 days' advance notice</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Sponsor-Subsidized Model</h3>
              <p className="mb-4">
                Optio Academy operates through a combination of participant fees and sponsor support.
                Monthly fees are partially subsidized by generous sponsors who support our mission.
                Participants and families are encouraged to help identify potential sponsors for the program.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. AI Tutor and Safety</h2>
              <p className="mb-4">
                Our AI Tutor feature uses Google Gemini to provide personalized learning assistance.
                Safety measures include:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Content filtering for age-appropriate interactions</li>
                <li>Safety monitoring and logging of all conversations</li>
                <li>Parent dashboard access to view tutor conversations</li>
                <li>Immediate flagging of inappropriate content</li>
                <li>Human review of flagged interactions</li>
              </ul>
              <p className="mb-4">
                Parents may review, monitor, and disable AI Tutor access at any time through their
                Parent Dashboard.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Parent Dashboard and Monitoring Rights</h2>
              <p className="mb-4">
                Parents with linked student accounts have the following rights and capabilities:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>View student's active quests and progress</li>
                <li>Access learning calendar and scheduled tasks</li>
                <li>Review learning insights and time patterns</li>
                <li>Monitor AI Tutor conversations for safety</li>
                <li>Upload evidence on behalf of students (subject to student approval)</li>
                <li>Receive learning rhythm indicators (flow state vs. needs support)</li>
                <li>Access safety reports and flagged content</li>
              </ul>
              <p className="mb-4">
                Parent access is designed to support student learning while respecting student autonomy.
                Parents cannot start quests on behalf of students or modify student work without permission.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Media Release and Promotional Use</h2>
              <p className="mb-4">
                By using Optio, you grant us permission to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Use student images, voices, and work in promotional and educational materials</li>
                <li>Showcase student portfolios and diplomas as examples of learning outcomes</li>
                <li>Feature student projects in demonstrations and presentations</li>
                <li>Share anonymized learning data for research and improvement purposes</li>
              </ul>
              <p className="mb-4">
                All such use will be for non-commercial educational purposes and will respect student privacy.
                You may opt out of promotional use by contacting us at support@optioeducation.com.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Intellectual Property</h2>
              <p className="mb-4">
                The Service and its original content (excluding User Content) are owned by Optio, LLC and are
                protected by copyright, trademark, and other intellectual property laws.
              </p>
              <p className="mb-4">
                Students working on business ventures through Optio Academy retain all intellectual property
                rights to their business ideas, products, and creations. Students grant Optio a non-exclusive
                license to showcase their work for educational and promotional purposes only.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Privacy</h2>
              <p className="mb-4">
                Your use of the Service is also governed by our{' '}
                <Link to="/privacy" className="text-primary hover:text-optio-purple underline">
                  Privacy Policy
                </Link>
                , which is incorporated into these Terms by reference. We are committed to protecting
                student privacy and complying with COPPA, FERPA, and other applicable privacy laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Third-Party Services</h2>
              <p className="mb-4">
                Our Service uses third-party services including:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Supabase (database and authentication)</li>
                <li>Stripe (payment processing)</li>
                <li>Google Gemini (AI Tutor features)</li>
                <li>Pexels (quest and badge imagery)</li>
                <li>Meta Pixel (marketing analytics)</li>
              </ul>
              <p className="mb-4">
                These services have their own terms and privacy policies. We are not responsible for
                third-party service practices but carefully select partners who respect user privacy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Disclaimers and Limitations of Liability</h2>
              <p className="mb-4">
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
                INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                OR NON-INFRINGEMENT.
              </p>
              <p className="mb-4">
                We do not guarantee that the Service will be uninterrupted, secure, or error-free. We do not
                guarantee specific educational outcomes, business success, or acceptance of credentials by
                third parties.
              </p>
              <p className="mb-4">
                To the maximum extent permitted by law, we shall not be liable for any indirect, incidental,
                special, consequential, or punitive damages arising from your use of the Service, including
                but not limited to loss of data, loss of profits, or loss of educational opportunities.
              </p>
              <p className="mb-4">
                For Optio Academy in-person participants, additional liability limitations and assumptions
                of risk are outlined in the{' '}
                <Link to="/academy-agreement" className="text-primary hover:text-optio-purple underline">
                  Optio Academy Agreement
                </Link>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Indemnification</h2>
              <p className="mb-4">
                You agree to indemnify and hold harmless Optio, LLC and its officers, employees, and agents
                from any claims, damages, losses, and expenses (including attorney's fees) arising from:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Your use of the Service or violation of these Terms</li>
                <li>Your User Content or any content you submit</li>
                <li>Your violation of any rights of another party</li>
                <li>Your violation of any applicable laws or regulations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">15. Termination</h2>
              <p className="mb-4">
                We may terminate or suspend your account immediately, without prior notice, for any reason,
                including but not limited to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Breach of these Terms</li>
                <li>Fraudulent or illegal activity</li>
                <li>Disruptive or harmful behavior</li>
                <li>Non-payment of fees</li>
                <li>Lack of engagement or participation (Academy participants)</li>
                <li>Determination that the program is no longer a suitable fit</li>
              </ul>
              <p className="mb-4">
                Upon termination, your right to use the Service will cease immediately. Your User Content
                may be deleted or retained in accordance with our data retention policies and legal obligations.
              </p>
              <p className="mb-4">
                You may terminate your account at any time by contacting us at support@optioeducation.com.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">16. Dispute Resolution</h2>
              <p className="mb-4">
                Any dispute arising from these Terms will first be addressed through good-faith informal
                discussion between the parties. If the dispute cannot be resolved informally, it shall be
                submitted to mediation in Utah County, Utah.
              </p>
              <p className="mb-4">
                If mediation fails to resolve the dispute, it will be resolved through individual, final,
                and binding arbitration in Utah County, Utah, under the rules of the American Arbitration
                Association. By agreeing to these Terms, you waive the right to a jury trial and the right
                to participate in a class-action lawsuit.
              </p>
              <p className="mb-4">
                This dispute resolution provision does not limit any rights provided by law to parents or
                guardians of minor students.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">17. Changes to Terms</h2>
              <p className="mb-4">
                We reserve the right to modify these Terms at any time. We will notify users of material
                changes via email to the primary account email address or through prominent notice in the Service.
              </p>
              <p className="mb-4">
                Your continued use of the Service after changes are posted constitutes acceptance of the
                modified Terms. If you do not agree to the modified Terms, you must stop using the Service
                and may cancel your account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">18. Governing Law</h2>
              <p className="mb-4">
                These Terms shall be governed by and construed in accordance with the laws of the State
                of Utah and the United States, without regard to conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">19. Severability and Entire Agreement</h2>
              <p className="mb-4">
                If any provision of these Terms is found to be unenforceable or invalid, that provision
                will be limited or eliminated to the minimum extent necessary so that these Terms will
                otherwise remain in full force and effect.
              </p>
              <p className="mb-4">
                These Terms, together with the Privacy Policy and (for Academy participants) the Optio
                Academy Agreement, constitute the entire agreement between you and Optio, LLC regarding
                the Service and supersede all prior agreements and understandings.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">20. Contact Information</h2>
              <p className="mb-4">
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <p className="mb-4">
                <strong>Optio, LLC</strong><br />
                1555 Freedom Blvd 200 W<br />
                Provo, UT 84604<br />
                Email: support@optioeducation.com<br />
                Website: https://optioeducation.com
              </p>
            </section>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <Link to="/register" className="text-primary hover:text-optio-purple font-medium">
              ← Back to Registration
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TermsOfService
