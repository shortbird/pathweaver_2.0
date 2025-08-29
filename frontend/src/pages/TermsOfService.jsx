import React from 'react'
import { Link } from 'react-router-dom'

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
          
          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: January 1, 2025</p>
            
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="mb-4">
                By accessing or using the Optio Quest Platform ("Service"), you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, please do not use our Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
              <p className="mb-4">
                Optio Quest is an educational platform that allows students to create self-validated diplomas through 
                completing quests and documenting their learning journey. The Service includes quest completion, 
                evidence submission, portfolio creation, and diploma generation features.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
              <p className="mb-4">You must provide accurate and complete information when creating an account.</p>
              <p className="mb-4">You are responsible for maintaining the confidentiality of your account credentials.</p>
              <p className="mb-4">You must notify us immediately of any unauthorized use of your account.</p>
              <p className="mb-4">You must be at least 13 years old to use this Service. Users under 18 require parental consent.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. User Content</h2>
              <p className="mb-4">
                You retain ownership of all content you submit to the Service ("User Content").
              </p>
              <p className="mb-4">
                By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, 
                display, and distribute your content as part of the Service.
              </p>
              <p className="mb-4">
                You are responsible for ensuring your User Content does not violate any laws or third-party rights.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Acceptable Use</h2>
              <p className="mb-4">You agree not to:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Submit false or misleading information or evidence</li>
                <li>Impersonate another person or entity</li>
                <li>Upload content that is offensive, harmful, or illegal</li>
                <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Violate any applicable laws or regulations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Educational Integrity</h2>
              <p className="mb-4">
                The diplomas and achievements generated through our Service are self-validated and reflect 
                the effort and documentation provided by the user. We do not guarantee that these diplomas 
                will be recognized by educational institutions or employers.
              </p>
              <p className="mb-4">
                Users are responsible for accurately representing their achievements and maintaining the 
                integrity of their learning documentation.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Subscription and Payments</h2>
              <p className="mb-4">
                Some features of the Service require a paid subscription. Subscription fees are billed in 
                advance on a recurring basis.
              </p>
              <p className="mb-4">
                You may cancel your subscription at any time. Cancellations will take effect at the end of 
                the current billing period.
              </p>
              <p className="mb-4">
                All fees are non-refundable unless otherwise stated or required by law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Intellectual Property</h2>
              <p className="mb-4">
                The Service and its original content (excluding User Content) are owned by Optio and are 
                protected by copyright, trademark, and other intellectual property laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Privacy</h2>
              <p className="mb-4">
                Your use of the Service is also governed by our{' '}
                <Link to="/privacy" className="text-primary hover:text-purple-600 underline">
                  Privacy Policy
                </Link>
                , which is incorporated into these Terms by reference.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Disclaimers and Limitations of Liability</h2>
              <p className="mb-4">
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
              </p>
              <p className="mb-4">
                We do not guarantee that the Service will be uninterrupted, secure, or error-free.
              </p>
              <p className="mb-4">
                To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, 
                special, consequential, or punitive damages arising from your use of the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Indemnification</h2>
              <p className="mb-4">
                You agree to indemnify and hold harmless Optio and its affiliates from any claims, damages, 
                losses, and expenses arising from your use of the Service or violation of these Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Termination</h2>
              <p className="mb-4">
                We may terminate or suspend your account immediately, without prior notice, for any reason, 
                including breach of these Terms.
              </p>
              <p className="mb-4">
                Upon termination, your right to use the Service will cease immediately. Your User Content 
                may be deleted or retained in accordance with our data retention policies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Changes to Terms</h2>
              <p className="mb-4">
                We reserve the right to modify these Terms at any time. We will notify users of material 
                changes via email or through the Service.
              </p>
              <p className="mb-4">
                Your continued use of the Service after changes constitutes acceptance of the modified Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Governing Law</h2>
              <p className="mb-4">
                These Terms shall be governed by and construed in accordance with the laws of the United 
                States, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">15. Contact Information</h2>
              <p className="mb-4">
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <p className="mb-4">
                Email: support@optioed.org<br />
                Website: https://www.optioed.org
              </p>
            </section>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <Link to="/register" className="text-primary hover:text-purple-600 font-medium">
              ← Back to Registration
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TermsOfService