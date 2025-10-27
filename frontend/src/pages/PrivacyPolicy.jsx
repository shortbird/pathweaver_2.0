import React from 'react'
import { Link } from 'react-router-dom'

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: January 27, 2025</p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
              <p className="mb-4">
                Optio, LLC ("we," "our," or "us") is committed to protecting the privacy of students,
                parents, and all users of our educational platform. This Privacy Policy explains how we
                collect, use, disclose, and safeguard your information when you use the Optio platform
                and, for some users, participate in the Optio Academy in-person program.
              </p>
              <p className="mb-4">
                We are committed to complying with the Children's Online Privacy Protection Act (COPPA),
                the Family Educational Rights and Privacy Act (FERPA), and all applicable privacy laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold mb-3">Personal Information</h3>
              <p className="mb-4">When you register for an account, we collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Name (first and last name)</li>
                <li>Email address</li>
                <li>Password (encrypted and securely stored)</li>
                <li>Date of birth (for age verification and COPPA compliance)</li>
                <li>Phone number (optional)</li>
                <li>Address information (optional)</li>
                <li>Parent/guardian information (for users under 13)</li>
                <li>Role (student, parent, advisor, admin)</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Educational and Learning Data</h3>
              <p className="mb-4">As you use our platform, we collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Quest enrollment and completion data</li>
                <li>Task progress and completion status</li>
                <li>Evidence of learning (images, documents, videos, text submissions)</li>
                <li>Portfolio and diploma content</li>
                <li>XP (experience points) and achievement data</li>
                <li>Badge progress and earned badges</li>
                <li>Skill pillar data (STEM, Wellness, Communication, Civics, Art)</li>
                <li>Learning calendar and scheduled tasks</li>
                <li>Academic transcript data</li>
                <li>Custom quest submissions</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">AI Tutor Data</h3>
              <p className="mb-4">When using the AI Tutor feature, we collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Conversation messages between students and AI Tutor</li>
                <li>Tutor mode preferences (study buddy, teacher, discovery, etc.)</li>
                <li>Token usage and conversation length</li>
                <li>Safety ratings and flagged content</li>
                <li>Parent oversight settings</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Parent Dashboard Data</h3>
              <p className="mb-4">For parents monitoring their students, we collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Parent-student linking relationships</li>
                <li>Dashboard access logs</li>
                <li>Evidence uploaded by parents on behalf of students</li>
                <li>Parent communication preferences</li>
                <li>Learning rhythm feedback provided by parents</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Community and Social Features</h3>
              <p className="mb-4">When you use community features, we collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Connection/friendship requests and relationships</li>
                <li>Activity feed data shared with connections</li>
                <li>Public profile information</li>
                <li>Portfolio sharing settings</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Optio Academy In-Person Program Data</h3>
              <p className="mb-4">For students participating in Optio Academy at our physical location, we additionally collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Emergency contact information</li>
                <li>Health and medical information (as needed for safety)</li>
                <li>Transportation arrangements</li>
                <li>Program enrollment and attendance records</li>
                <li>Showcase Night participation and presentations</li>
                <li>Business venture details (for students launching businesses)</li>
                <li>Sponsor sourcing activities</li>
                <li>Photo and video recordings from in-person sessions</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Usage Information</h3>
              <p className="mb-4">We automatically collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Log data (IP address, browser type, access times)</li>
                <li>Device information (device type, operating system)</li>
                <li>Pages viewed and features used</li>
                <li>Referring website addresses</li>
                <li>Session duration and interaction patterns</li>
                <li>Error logs and diagnostic data</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Marketing and Analytics</h3>
              <p className="mb-4">
                We use Meta Pixel (Facebook Pixel) to track website interactions, measure advertising
                effectiveness, and optimize our marketing campaigns. This technology:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Tracks page visits, form submissions, and user actions on our website</li>
                <li>Enables us to measure the effectiveness of our advertisements</li>
                <li>Helps us create custom audiences for targeted advertising</li>
                <li>May share your information with Meta (Facebook) for advertising purposes</li>
              </ul>
              <p className="mb-4">
                You can opt out of Meta Pixel tracking by adjusting your Facebook ad preferences or
                using browser extensions that block tracking pixels. For more information, visit{' '}
                <a
                  href="https://www.facebook.com/help/568137493302217"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Facebook's Cookie Policy
                </a>.
              </p>

              <h3 className="text-xl font-semibold mb-3">Payment Information</h3>
              <p className="mb-4">
                For paid subscriptions and Optio Academy enrollment, payment processing is handled by Stripe.
                We do not store credit card numbers or banking information directly. We do retain:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Subscription tier and status</li>
                <li>Payment history and invoices</li>
                <li>Stripe customer ID (for linking to payment processor)</li>
                <li>Utah Education Fits All (UEFA) scholarship status (if applicable)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
              <p className="mb-4">We use your information to:</p>

              <h3 className="text-xl font-semibold mb-3">Provide and Improve Our Service</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Create and manage your account</li>
                <li>Process quest enrollments and track progress</li>
                <li>Generate diplomas, portfolios, and transcripts</li>
                <li>Award badges and calculate XP across skill pillars</li>
                <li>Provide AI Tutor assistance with safety monitoring</li>
                <li>Enable parent dashboard access and monitoring</li>
                <li>Facilitate connections between students</li>
                <li>Manage Optio Academy in-person program operations</li>
                <li>Monitor and analyze usage patterns to improve the Service</li>
                <li>Personalize learning experiences and recommendations</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Communication and Support</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Send important service updates and notifications</li>
                <li>Respond to your questions and provide customer support</li>
                <li>Send learning progress reports to parents</li>
                <li>Provide safety alerts and flagged content notifications</li>
                <li>Share Optio Academy program updates and event information</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Safety and Compliance</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Monitor AI Tutor conversations for safety concerns</li>
                <li>Detect and prevent fraud, abuse, or inappropriate behavior</li>
                <li>Comply with legal obligations and respond to legal requests</li>
                <li>Enforce our Terms of Service and community standards</li>
                <li>Protect the rights and safety of our users</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Research and Development</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Analyze learning patterns to improve educational outcomes</li>
                <li>Develop new features and improve existing ones</li>
                <li>Create anonymized aggregate reports on platform usage</li>
                <li>Research best practices in K-12 education</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Information Sharing and Disclosure</h2>

              <h3 className="text-xl font-semibold mb-3">We Do Not Sell Your Personal Information</h3>
              <p className="mb-4">
                We will never sell student data or personal information to third parties. We are committed
                to protecting the privacy and security of our K-12 users.
              </p>

              <h3 className="text-xl font-semibold mb-3">Public Information You Control</h3>
              <p className="mb-4">
                Your diploma page and portfolio may be publicly visible if you choose to share them.
                You control the visibility settings for your portfolio. Activity shared with connections
                is visible only to those specific users.
              </p>

              <h3 className="text-xl font-semibold mb-3">Parents and Guardians</h3>
              <p className="mb-4">
                Parents with linked student accounts can access their student's learning data, progress,
                evidence, and AI Tutor conversations through the Parent Dashboard. Parents of children
                under 13 have full access to manage their child's account.
              </p>

              <h3 className="text-xl font-semibold mb-3">We May Share Information In These Situations:</h3>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>With your consent or at your direction</strong> - When you explicitly authorize sharing</li>
                <li><strong>With service providers</strong> - Third parties who assist in operating our platform (see Section 10)</li>
                <li><strong>For legal reasons</strong> - To comply with laws, respond to legal requests, or protect rights</li>
                <li><strong>To protect safety</strong> - To prevent fraud, abuse, illegal activities, or immediate harm</li>
                <li><strong>Business transfers</strong> - In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>Anonymized data</strong> - Aggregate, de-identified data for research and improvement</li>
                <li><strong>Showcase and Promotion</strong> - Student work, images, and projects for educational/promotional purposes (with consent)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Children's Privacy (COPPA Compliance)</h2>
              <p className="mb-4">
                Optio is designed for K-12 students (ages 5-18), which includes children under 13. We take
                children's privacy seriously and comply with the Children's Online Privacy Protection Act (COPPA).
              </p>

              <h3 className="text-xl font-semibold mb-3">For Children Under 13:</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Parents or legal guardians must create and manage accounts on behalf of children under 13</li>
                <li>We collect only information necessary to provide the educational service</li>
                <li>Parents have the right to review, update, or delete their child's information at any time</li>
                <li>Parents can disable specific features (like AI Tutor or community features) for their child</li>
                <li>We do not require children to provide more information than necessary to participate</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">For Students Ages 13-18:</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Students may create their own accounts with parental consent</li>
                <li>Parents may request linking to monitor their teen's learning</li>
                <li>Parents have access to review content and progress through the Parent Dashboard</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Parental Rights:</h3>
              <p className="mb-4">
                Parents or guardians may contact us at support@optioeducation.com to:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Review what personal information we have collected from their child</li>
                <li>Request deletion of their child's personal information</li>
                <li>Refuse to allow further collection or use of their child's information</li>
                <li>Request changes to privacy settings or feature access</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>
              <p className="mb-4">
                We retain your personal information for as long as your account is active or as needed to
                provide you services.
              </p>

              <h3 className="text-xl font-semibold mb-3">Account Deletion:</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>You may request account deletion at any time by contacting support@optioeducation.com</li>
                <li>Upon deletion, we will remove your personal information within 30 days</li>
                <li>Some information may be retained for legal compliance, dispute resolution, or as required by law</li>
                <li>Anonymized aggregate data may be retained for research purposes</li>
                <li>Evidence and portfolio content may be retained if made publicly shareable</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Inactive Accounts:</h3>
              <p className="mb-4">
                Accounts inactive for more than 3 years may be archived or deleted after notice to the
                account email address.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Data Security</h2>
              <p className="mb-4">
                We implement appropriate technical and organizational measures to protect your personal
                information against unauthorized access, alteration, disclosure, or destruction.
              </p>
              <p className="mb-4">Security measures include:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Encryption of data in transit (HTTPS/TLS) and at rest</li>
                <li>Secure password hashing (bcrypt with salt)</li>
                <li>httpOnly cookies for authentication (XSS protection)</li>
                <li>CSRF (Cross-Site Request Forgery) protection</li>
                <li>Regular security assessments and penetration testing</li>
                <li>Access controls and role-based permissions</li>
                <li>Secure hosting infrastructure (Supabase, Render)</li>
                <li>AI Tutor safety monitoring and content filtering</li>
                <li>Audit logging of sensitive operations</li>
                <li>Employee training on data protection</li>
              </ul>
              <p className="mb-4">
                However, no method of electronic transmission or storage is 100% secure. While we strive
                to protect your personal information, we cannot guarantee absolute security.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Your Rights and Choices</h2>
              <p className="mb-4">You have the right to:</p>

              <h3 className="text-xl font-semibold mb-3">Access and Control</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Access and receive a copy of your personal information</li>
                <li>Update or correct inaccurate information</li>
                <li>Delete your account and personal information</li>
                <li>Export your data in a portable format</li>
                <li>Control portfolio and diploma visibility settings</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Communication Preferences</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Opt out of marketing communications</li>
                <li>Control notification settings</li>
                <li>Manage email preferences</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Feature Controls</h3>
              <ul className="list-disc ml-6 mb-4">
                <li>Disable AI Tutor access</li>
                <li>Opt out of community/connection features</li>
                <li>Control parent dashboard access (for students 13+)</li>
                <li>Opt out of media release for promotional materials</li>
              </ul>

              <p className="mb-4">
                To exercise these rights, please contact us at support@optioeducation.com.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Cookies and Tracking Technologies</h2>
              <p className="mb-4">
                We use cookies and similar tracking technologies to track activity on our Service and hold
                certain information.
              </p>
              <p className="mb-4">Types of cookies we use:</p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Essential cookies:</strong> Required for authentication and core Service functionality</li>
                <li><strong>Analytics cookies:</strong> Help us understand how users interact with our Service (Meta Pixel)</li>
                <li><strong>Preference cookies:</strong> Remember your settings and preferences</li>
                <li><strong>Security cookies:</strong> CSRF tokens and security measures</li>
              </ul>
              <p className="mb-4">
                You can instruct your browser to refuse all cookies or to indicate when a cookie is being
                sent. However, some features of our Service may not function properly without cookies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Third-Party Services</h2>
              <p className="mb-4">
                Our Service may contain links to third-party websites or services that are not operated by us.
                We have no control over and assume no responsibility for the content, privacy policies, or
                practices of any third-party sites or services.
              </p>
              <p className="mb-4">Third-party services we use include:</p>
              <ul className="list-disc ml-6 mb-4">
                <li><strong>Supabase</strong> - Database, authentication, and storage (GDPR compliant)</li>
                <li><strong>Stripe</strong> - Payment processing (PCI DSS compliant)</li>
                <li><strong>Google Gemini</strong> - AI Tutor features with safety monitoring</li>
                <li><strong>Pexels</strong> - Quest and badge imagery (licensed stock photos)</li>
                <li><strong>Meta (Facebook) Pixel</strong> - Marketing analytics and advertising</li>
                <li><strong>Render</strong> - Web hosting and application infrastructure</li>
              </ul>
              <p className="mb-4">
                We carefully select partners who respect user privacy and comply with applicable privacy laws.
                Each service has its own privacy policy governing their data practices.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Educational Records (FERPA Compliance)</h2>
              <p className="mb-4">
                For students enrolled in Optio Academy's accredited program, certain educational records
                may be protected under the Family Educational Rights and Privacy Act (FERPA). We comply
                with FERPA requirements for the protection of student education records.
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Educational records are disclosed only with parent consent or as permitted by law</li>
                <li>Parents and eligible students have the right to inspect and review education records</li>
                <li>Parents have the right to request amendments to inaccurate records</li>
                <li>We maintain a record of disclosures of education records</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. International Data Transfers</h2>
              <p className="mb-4">
                Your information may be transferred to and maintained on servers located outside of your
                state, province, country, or other governmental jurisdiction where data protection laws may
                differ from those in your jurisdiction.
              </p>
              <p className="mb-4">
                Our servers are located in the United States. If you access our Service from outside the
                United States, please be aware that your information may be transferred to, stored, and
                processed in the United States.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. State-Specific Privacy Rights</h2>

              <h3 className="text-xl font-semibold mb-3">California Privacy Rights (CCPA/CPRA)</h3>
              <p className="mb-4">
                If you are a California resident, you have additional rights under the California Consumer
                Privacy Act (CCPA) and California Privacy Rights Act (CPRA):
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Right to know what personal information we collect, use, and disclose</li>
                <li>Right to request deletion of your personal information</li>
                <li>Right to opt-out of the sale of your information (we do not sell personal information)</li>
                <li>Right to non-discrimination for exercising your privacy rights</li>
                <li>Right to correct inaccurate personal information</li>
                <li>Right to limit use of sensitive personal information</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Utah Privacy Rights</h3>
              <p className="mb-4">
                Optio is based in Utah and serves many Utah students through the Utah Education Fits All
                (UEFA) scholarship program. Utah residents have rights under the Utah Consumer Privacy Act.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Changes to This Privacy Policy</h2>
              <p className="mb-4">
                We may update our Privacy Policy from time to time. We will notify you of any material
                changes by:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Posting the new Privacy Policy on this page</li>
                <li>Updating the "Effective Date" at the top</li>
                <li>Sending an email to the primary account email address</li>
                <li>Displaying a prominent notice in the Service</li>
              </ul>
              <p className="mb-4">
                You are advised to review this Privacy Policy periodically for any changes. For material
                changes that affect the privacy of children under 13, we will obtain verifiable parental
                consent before implementing the changes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">15. Contact Us</h2>
              <p className="mb-4">
                If you have any questions about this Privacy Policy, our data practices, or want to
                exercise your privacy rights, please contact us at:
              </p>
              <p className="mb-4">
                <strong>Optio, LLC</strong><br />
                1555 Freedom Blvd 200 W<br />
                Provo, UT 84604<br />
                <br />
                <strong>Email:</strong> support@optioeducation.com<br />
                <strong>Privacy Inquiries:</strong> privacy@optioeducation.com<br />
                <strong>Website:</strong> https://optioeducation.com
              </p>
              <p className="mb-4">
                For COPPA-related inquiries regarding children under 13, please email privacy@optioeducation.com
                with "COPPA Request" in the subject line.
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

export default PrivacyPolicy
