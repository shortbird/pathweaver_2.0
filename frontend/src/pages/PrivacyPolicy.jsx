import React from 'react'
import { Link } from 'react-router-dom'

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
          
          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: January 1, 2025</p>
            
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
              <p className="mb-4">
                Optio Quest Platform ("we," "our," or "us") is committed to protecting your privacy. This 
                Privacy Policy explains how we collect, use, disclose, and safeguard your information when 
                you use our educational platform.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-semibold mb-3">Personal Information</h3>
              <p className="mb-4">When you register for an account, we collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Name (first and last name)</li>
                <li>Email address</li>
                <li>Password (encrypted)</li>
                <li>Date of account creation</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Educational Content</h3>
              <p className="mb-4">As you use our platform, we collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Quest completion data</li>
                <li>Learning logs and reflections</li>
                <li>Evidence of learning (images, documents, videos)</li>
                <li>Portfolio content</li>
                <li>XP and achievement data</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Usage Information</h3>
              <p className="mb-4">We automatically collect:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Log data (IP address, browser type, access times)</li>
                <li>Device information</li>
                <li>Pages viewed and features used</li>
                <li>Referring website addresses</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3">Advertising and Analytics</h3>
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
                For paid subscriptions, payment processing is handled by Stripe. We do not store credit 
                card numbers or banking information directly.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
              <p className="mb-4">We use your information to:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Provide and maintain our Service</li>
                <li>Create and manage your account</li>
                <li>Process quest completions and generate diplomas</li>
                <li>Enable collaboration features with other users</li>
                <li>Send important service updates and notifications</li>
                <li>Respond to your comments and questions</li>
                <li>Monitor and analyze usage patterns to improve the Service</li>
                <li>Detect and prevent fraud or abuse</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Information Sharing and Disclosure</h2>
              
              <h3 className="text-xl font-semibold mb-3">Public Information</h3>
              <p className="mb-4">
                Your diploma page and portfolio may be publicly visible if you choose to share them. 
                You control the visibility settings for your portfolio.
              </p>

              <h3 className="text-xl font-semibold mb-3">We do not sell your personal information</h3>
              <p className="mb-4">We may share your information only in the following situations:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>With your consent or at your direction</li>
                <li>With service providers who assist in operating our platform</li>
                <li>For legal reasons (comply with laws, respond to legal requests)</li>
                <li>To protect rights and safety (prevent fraud, abuse, or illegal activities)</li>
                <li>In connection with a business transfer (merger, acquisition, or sale of assets)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
              <p className="mb-4">
                We retain your personal information for as long as your account is active or as needed to 
                provide you services. You may request account deletion at any time.
              </p>
              <p className="mb-4">
                After account deletion, we may retain certain information as required by law or for 
                legitimate business purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Data Security</h2>
              <p className="mb-4">
                We implement appropriate technical and organizational measures to protect your personal 
                information against unauthorized access, alteration, disclosure, or destruction.
              </p>
              <p className="mb-4">Security measures include:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security assessments</li>
                <li>Access controls and authentication</li>
                <li>Secure hosting infrastructure</li>
              </ul>
              <p className="mb-4">
                However, no method of electronic transmission or storage is 100% secure, and we cannot 
                guarantee absolute security.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Children's Privacy</h2>
              <p className="mb-4">
                Our Service is intended for users aged 13 and older. We do not knowingly collect personal 
                information from children under 13.
              </p>
              <p className="mb-4">
                Users between 13 and 18 years old must have parental consent to use the Service. Parents 
                or guardians may contact us to review, update, or delete their child's information.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Your Rights and Choices</h2>
              <p className="mb-4">You have the right to:</p>
              <ul className="list-disc ml-6 mb-4">
                <li>Access and receive a copy of your personal information</li>
                <li>Update or correct inaccurate information</li>
                <li>Delete your account and personal information</li>
                <li>Object to or restrict certain processing of your information</li>
                <li>Withdraw consent where we rely on consent for processing</li>
                <li>Opt-out of marketing communications</li>
              </ul>
              <p className="mb-4">
                To exercise these rights, please contact us at support@optioed.org.
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
                <li>Essential cookies: Required for the Service to function</li>
                <li>Analytics cookies: Help us understand how users interact with our Service</li>
                <li>Preference cookies: Remember your settings and preferences</li>
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
                <li>Supabase (database and authentication)</li>
                <li>Stripe (payment processing)</li>
                <li>OpenAI/Google Gemini (AI features)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. International Data Transfers</h2>
              <p className="mb-4">
                Your information may be transferred to and maintained on servers located outside of your 
                state, province, country, or other governmental jurisdiction where data protection laws may 
                differ from those in your jurisdiction.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. California Privacy Rights</h2>
              <p className="mb-4">
                If you are a California resident, you have additional rights under the California Consumer 
                Privacy Act (CCPA), including the right to know what personal information we collect, the 
                right to delete your information, and the right to opt-out of the sale of your information 
                (which we do not do).
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Changes to This Privacy Policy</h2>
              <p className="mb-4">
                We may update our Privacy Policy from time to time. We will notify you of any changes by 
                posting the new Privacy Policy on this page and updating the "Effective Date" at the top.
              </p>
              <p className="mb-4">
                You are advised to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
              <p className="mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <p className="mb-4">
                Email: support@optioed.org<br />
                Website: https://www.optioed.org
              </p>
              <p className="mb-4">
                For data protection inquiries, you may also contact our Data Protection Officer at 
                privacy@optioed.org.
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