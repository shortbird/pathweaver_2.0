import type { LegalDocument } from './types';

/**
 * Privacy Policy — canonical content shared by v1 web and v2 mobile.
 *
 * v1.1 (2026-06-16): Added explicit disclosure that we may share contact
 * information (e.g. a hashed email address) with advertising platforms such as
 * Meta to build custom and lookalike audiences, the corresponding opt-out, the
 * CCPA/CPRA "sharing" opt-out, and a statement that children's and students'
 * data is never used for advertising audiences.
 */
export const privacyPolicy: LegalDocument = {
  title: 'Privacy Policy',
  effectiveDate: 'June 16, 2026',
  version: '1.1',
  sections: [
    {
      heading: '1. Introduction',
      blocks: [
        {
          type: 'paragraph',
          text: 'Optio, LLC ("we," "our," or "us") is committed to protecting the privacy of students, parents, and all users of our educational platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Optio platform and, for some users, enroll in our fully online private school, Optio Academy.',
        },
        {
          type: 'paragraph',
          text: 'We are committed to complying with the Children\'s Online Privacy Protection Act (COPPA), the Family Educational Rights and Privacy Act (FERPA), and all applicable privacy laws.',
        },
      ],
    },
    {
      heading: '2. Information We Collect',
      blocks: [
        { type: 'subheading', text: 'Personal Information' },
        { type: 'paragraph', text: 'When you register for an account, we collect:' },
        {
          type: 'list',
          items: [
            'Name (first and last name)',
            'Email address',
            'Password (encrypted and securely stored)',
            'Date of birth (for age verification and COPPA compliance)',
            'Phone number (optional)',
            'Address information (optional)',
            'Parent/guardian information (for users under 13)',
            'Role (student, parent, advisor, admin)',
          ],
        },
        { type: 'subheading', text: 'Educational and Learning Data' },
        { type: 'paragraph', text: 'As you use our platform, we collect:' },
        {
          type: 'list',
          items: [
            'Quest enrollment and completion data',
            'Task progress and completion status',
            'Evidence of learning (images, documents, videos, text submissions)',
            'Portfolio and diploma content',
            'XP (experience points) and achievement data',
            'Badge progress and earned badges',
            'Skill pillar data (STEM, Wellness, Communication, Civics, Art)',
            'Academic transcript data',
            'Custom quest submissions',
          ],
        },
        { type: 'subheading', text: 'AI Tutor Data' },
        { type: 'paragraph', text: 'When using the AI Tutor feature, we collect:' },
        {
          type: 'list',
          items: [
            'Conversation messages between students and AI Tutor',
            'Tutor mode preferences (study buddy, teacher, discovery, etc.)',
            'Token usage and conversation length',
            'Safety ratings and flagged content',
            'Parent oversight settings',
          ],
        },
        { type: 'subheading', text: 'Parent Dashboard Data' },
        { type: 'paragraph', text: 'For parents monitoring their students, we collect:' },
        {
          type: 'list',
          items: [
            'Parent-student linking relationships',
            'Dashboard access logs',
            'Evidence uploaded by parents on behalf of students',
            'Parent communication preferences',
            'Learning rhythm feedback provided by parents',
          ],
        },
        { type: 'subheading', text: 'Community and Social Features' },
        { type: 'paragraph', text: 'When you use community features, we collect:' },
        {
          type: 'list',
          items: [
            'Connection/friendship requests and relationships',
            'Activity feed data shared with connections',
            'Public profile information',
            'Portfolio sharing settings',
          ],
        },
        { type: 'subheading', text: 'Optio Academy Program Data' },
        { type: 'paragraph', text: 'For students enrolled in Optio Academy, we additionally collect:' },
        {
          type: 'list',
          items: [
            'Emergency contact information',
            'Program enrollment and attendance records',
            'Daily mentor session notes and progress reviews',
            'Showcase event participation and presentations',
            'Recordings of mentor sessions and online showcases (with consent)',
          ],
        },
        { type: 'subheading', text: 'Usage Information' },
        { type: 'paragraph', text: 'We automatically collect:' },
        {
          type: 'list',
          items: [
            'Log data (IP address, browser type, access times)',
            'Device information (device type, operating system)',
            'Pages viewed and features used',
            'Referring website addresses',
            'Session duration and interaction patterns',
            'Error logs and diagnostic data',
          ],
        },
        { type: 'subheading', text: 'Marketing and Advertising' },
        {
          type: 'paragraph',
          text: 'We use the Meta Pixel (Facebook Pixel) on our website to track website interactions, measure advertising effectiveness, and optimize our marketing campaigns. This technology:',
        },
        {
          type: 'list',
          items: [
            'Tracks page visits, form submissions, and user actions on our website',
            'Enables us to measure the effectiveness of our advertisements',
            'Helps us build audiences for marketing and advertising',
          ],
        },
        {
          type: 'paragraph',
          text: [
            'In addition to the pixel, we may share contact information that you provide to us — primarily your ',
            { bold: 'email address' },
            ' — directly with advertising platforms such as Meta (Facebook) in order to build "custom audiences" and similar "lookalike" audiences. This lets us show our ads to existing account holders and to other people whose interests resemble theirs. When we do this, the contact information is cryptographically hashed before it is sent to the advertising platform, and it is used only for audience matching.',
          ],
        },
        {
          type: 'callout',
          variant: 'success',
          blocks: [
            {
              type: 'paragraph',
              text: 'We do not include the personal information of children, or of students, in advertising audiences. Custom-audience and lookalike-audience sharing applies only to adult account holders (such as parents and other adult users) who have not opted out.',
            },
          ],
        },
        {
          type: 'paragraph',
          text: [
            'You can opt out of this advertising-audience sharing at any time by emailing ',
            { link: 'privacy@optioeducation.com', href: 'mailto:privacy@optioeducation.com' },
            ', by turning off marketing emails in your account settings, or by adjusting your Meta (Facebook) ad preferences. You can also opt out of Meta Pixel tracking using browser extensions that block tracking pixels. For more information, visit ',
            { link: 'Facebook\'s Cookie Policy', href: 'https://www.facebook.com/help/568137493302217' },
            '.',
          ],
        },
        { type: 'subheading', text: 'Payment Information' },
        {
          type: 'paragraph',
          text: 'For paid subscriptions and Optio Academy enrollment, payment processing is handled by Stripe. We do not store credit card numbers or banking information directly. We do retain:',
        },
        {
          type: 'list',
          items: [
            'Subscription tier and status',
            'Payment history and invoices',
            'Stripe customer ID (for linking to payment processor)',
          ],
        },
      ],
    },
    {
      heading: '3. How We Use Your Information',
      blocks: [
        { type: 'paragraph', text: 'We use your information to:' },
        { type: 'subheading', text: 'Provide and Improve Our Service' },
        {
          type: 'list',
          items: [
            'Create and manage your account',
            'Process quest enrollments and track progress',
            'Generate diplomas, portfolios, and transcripts',
            'Award badges and calculate XP across skill pillars',
            'Provide AI Tutor assistance with safety monitoring',
            'Enable parent dashboard access and monitoring',
            'Facilitate connections between students',
            'Manage Optio Academy enrollment and instruction',
            'Monitor and analyze usage patterns to improve the Service',
            'Personalize learning experiences and recommendations',
          ],
        },
        { type: 'subheading', text: 'Communication and Support' },
        {
          type: 'list',
          items: [
            'Send important service updates and notifications',
            'Respond to your questions and provide customer support',
            'Send learning progress reports to parents',
            'Provide safety alerts and flagged content notifications',
            'Share Optio Academy program updates and event information',
          ],
        },
        { type: 'subheading', text: 'Marketing and Advertising' },
        {
          type: 'list',
          items: [
            'Measure and improve the effectiveness of our marketing',
            'Build custom and lookalike advertising audiences from adult account holders\' contact information (hashed), as described in Section 2',
            'Show relevant ads to adult users and to people with similar interests',
          ],
        },
        { type: 'subheading', text: 'Safety and Compliance' },
        {
          type: 'list',
          items: [
            'Monitor AI Tutor conversations for safety concerns',
            'Detect and prevent fraud, abuse, or inappropriate behavior',
            'Comply with legal obligations and respond to legal requests',
            'Enforce our Terms of Service and community standards',
            'Protect the rights and safety of our users',
          ],
        },
        { type: 'subheading', text: 'Research and Development' },
        {
          type: 'list',
          items: [
            'Analyze learning patterns to improve educational outcomes',
            'Develop new features and improve existing ones',
            'Create anonymized aggregate reports on platform usage',
            'Research best practices in K-12 education',
          ],
        },
      ],
    },
    {
      heading: '4. Information Sharing and Disclosure',
      blocks: [
        {
          type: 'callout',
          variant: 'success',
          title: 'We Do Not Sell Your Personal Information',
          blocks: [
            {
              type: 'paragraph',
              text: 'We will never sell student data or personal information to third parties. We are committed to protecting the privacy and security of our K-12 users.',
            },
          ],
        },
        { type: 'subheading', text: 'Public Information You Control' },
        {
          type: 'paragraph',
          text: 'Your diploma page and portfolio may be publicly visible if you choose to share them. You control the visibility settings for your portfolio. Activity shared with connections is visible only to those specific users.',
        },
        { type: 'subheading', text: 'Parents and Guardians' },
        {
          type: 'paragraph',
          text: 'Parents with linked student accounts can access their student\'s learning data, progress, evidence, and AI Tutor conversations through the Parent Dashboard. Parents of children under 13 have full access to manage their child\'s account.',
        },
        { type: 'subheading', text: 'We May Share Information In These Situations:' },
        {
          type: 'list',
          items: [
            [{ bold: 'With your consent or at your direction' }, ' - When you explicitly authorize sharing'],
            [{ bold: 'With service providers' }, ' - Third parties who assist in operating our platform (see Section 10)'],
            [{ bold: 'With advertising partners' }, ' - We may share limited contact information of adult account holders (such as a hashed email address) with advertising platforms like Meta to operate custom and lookalike advertising audiences. We never include children\'s or students\' data, and you can opt out (see Sections 2 and 8)'],
            [{ bold: 'For legal reasons' }, ' - To comply with laws, respond to legal requests, or protect rights'],
            [{ bold: 'To protect safety' }, ' - To prevent fraud, abuse, illegal activities, or immediate harm'],
            [{ bold: 'Business transfers' }, ' - In connection with a merger, acquisition, or sale of assets'],
            [{ bold: 'Anonymized data' }, ' - Aggregate, de-identified data for research and improvement'],
            [{ bold: 'Showcase and Promotion' }, ' - Student work, images, and projects for educational/promotional purposes (with consent)'],
          ],
        },
      ],
    },
    {
      heading: '5. Children\'s Privacy (COPPA Compliance)',
      blocks: [
        {
          type: 'paragraph',
          text: 'Optio is designed for K-12 students (ages 5-18), which includes children under 13. We take children\'s privacy seriously and comply with the Children\'s Online Privacy Protection Act (COPPA).',
        },
        { type: 'subheading', text: 'For Children Under 13:' },
        {
          type: 'list',
          items: [
            'Parents or legal guardians must create and manage accounts on behalf of children under 13',
            'We collect only information necessary to provide the educational service',
            'Parents have the right to review, update, or delete their child\'s information at any time',
            'Parents can disable specific features (like AI Tutor or community features) for their child',
            'We do not require children to provide more information than necessary to participate',
            'We never use a child\'s personal information for advertising or to build advertising audiences',
          ],
        },
        { type: 'subheading', text: 'For Students Ages 13-18:' },
        {
          type: 'list',
          items: [
            'Students may create their own accounts with parental consent',
            'Parents may request linking to monitor their teen\'s learning',
            'Parents have access to review content and progress through the Parent Dashboard',
            'We never use a student\'s personal information for advertising or to build advertising audiences',
          ],
        },
        { type: 'subheading', text: 'Parental Rights:' },
        { type: 'paragraph', text: 'Parents or guardians may contact us at support@optioeducation.com to:' },
        {
          type: 'list',
          items: [
            'Review what personal information we have collected from their child',
            'Request deletion of their child\'s personal information',
            'Refuse to allow further collection or use of their child\'s information',
            'Request changes to privacy settings or feature access',
          ],
        },
      ],
    },
    {
      heading: '6. Data Retention',
      blocks: [
        {
          type: 'paragraph',
          text: 'We retain your personal information for as long as your account is active or as needed to provide you services.',
        },
        { type: 'subheading', text: 'Account Deletion:' },
        {
          type: 'list',
          items: [
            'You may request account deletion at any time by contacting support@optioeducation.com',
            'Upon deletion, we will remove your personal information within 30 days',
            'Some information may be retained for legal compliance, dispute resolution, or as required by law',
            'Anonymized aggregate data may be retained for research purposes',
            'Evidence and portfolio content may be retained if made publicly shareable',
          ],
        },
        { type: 'subheading', text: 'Inactive Accounts:' },
        {
          type: 'paragraph',
          text: 'Accounts inactive for more than 3 years may be archived or deleted after notice to the account email address.',
        },
      ],
    },
    {
      heading: '7. Data Security',
      blocks: [
        {
          type: 'paragraph',
          text: 'We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.',
        },
        { type: 'paragraph', text: 'Security measures include:' },
        {
          type: 'list',
          items: [
            'Encryption of data in transit (HTTPS/TLS) and at rest',
            'Secure password hashing (bcrypt with salt)',
            'httpOnly cookies for authentication (XSS protection)',
            'CSRF (Cross-Site Request Forgery) protection',
            'Regular security assessments and penetration testing',
            'Access controls and role-based permissions',
            'Secure hosting infrastructure (Supabase, Render)',
            'AI Tutor safety monitoring and content filtering',
            'Audit logging of sensitive operations',
            'Employee training on data protection',
          ],
        },
        {
          type: 'paragraph',
          text: 'However, no method of electronic transmission or storage is 100% secure. While we strive to protect your personal information, we cannot guarantee absolute security.',
        },
      ],
    },
    {
      heading: '8. Your Rights and Choices',
      blocks: [
        { type: 'paragraph', text: 'You have the right to:' },
        { type: 'subheading', text: 'Access and Control' },
        {
          type: 'list',
          items: [
            'Access and receive a copy of your personal information',
            'Update or correct inaccurate information',
            'Delete your account and personal information',
            'Export your data in a portable format',
            'Control portfolio and diploma visibility settings',
          ],
        },
        { type: 'subheading', text: 'Communication and Advertising Preferences' },
        {
          type: 'list',
          items: [
            'Opt out of marketing communications',
            'Opt out of having your contact information shared with advertising platforms for custom-audience or lookalike-audience targeting',
            'Control notification settings',
            'Manage email preferences',
          ],
        },
        { type: 'subheading', text: 'Feature Controls' },
        {
          type: 'list',
          items: [
            'Disable AI Tutor access',
            'Opt out of community/connection features',
            'Control parent dashboard access (for students 13+)',
            'Opt out of media release for promotional materials',
          ],
        },
        {
          type: 'paragraph',
          text: 'To exercise these rights, please contact us at support@optioeducation.com.',
        },
      ],
    },
    {
      heading: '9. Cookies and Tracking Technologies',
      blocks: [
        {
          type: 'paragraph',
          text: 'We use cookies and similar tracking technologies to track activity on our Service and hold certain information.',
        },
        { type: 'paragraph', text: 'Types of cookies we use:' },
        {
          type: 'list',
          items: [
            [{ bold: 'Essential cookies:' }, ' Required for authentication and core Service functionality'],
            [{ bold: 'Analytics cookies:' }, ' Help us understand how users interact with our Service (Meta Pixel)'],
            [{ bold: 'Preference cookies:' }, ' Remember your settings and preferences'],
            [{ bold: 'Security cookies:' }, ' CSRF tokens and security measures'],
          ],
        },
        {
          type: 'paragraph',
          text: 'You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, some features of our Service may not function properly without cookies.',
        },
      ],
    },
    {
      heading: '10. Third-Party Services',
      blocks: [
        {
          type: 'paragraph',
          text: 'Our Service may contain links to third-party websites or services that are not operated by us. We have no control over and assume no responsibility for the content, privacy policies, or practices of any third-party sites or services.',
        },
        { type: 'paragraph', text: 'Third-party services we use include:' },
        {
          type: 'list',
          items: [
            [{ bold: 'Supabase' }, ' - Database, authentication, and storage (GDPR compliant)'],
            [{ bold: 'Stripe' }, ' - Payment processing (PCI DSS compliant)'],
            [{ bold: 'Google Gemini' }, ' - AI Tutor features with safety monitoring'],
            [{ bold: 'Pexels' }, ' - Quest and badge imagery (licensed stock photos)'],
            [{ bold: 'Meta (Facebook)' }, ' - Marketing analytics, the Meta Pixel, and custom/lookalike advertising audiences (adult account holders only)'],
            [{ bold: 'Render' }, ' - Web hosting and application infrastructure'],
          ],
        },
        {
          type: 'paragraph',
          text: 'We carefully select partners who respect user privacy and comply with applicable privacy laws. Each service has its own privacy policy governing their data practices.',
        },
      ],
    },
    {
      heading: '11. Educational Records (FERPA Compliance)',
      blocks: [
        {
          type: 'paragraph',
          text: 'For students enrolled in Optio Academy\'s accredited program, certain educational records may be protected under the Family Educational Rights and Privacy Act (FERPA). We comply with FERPA requirements for the protection of student education records.',
        },
        {
          type: 'list',
          items: [
            'Educational records are disclosed only with parent consent or as permitted by law',
            'Parents and eligible students have the right to inspect and review education records',
            'Parents have the right to request amendments to inaccurate records',
            'We maintain a record of disclosures of education records',
          ],
        },
      ],
    },
    {
      heading: '12. International Data Transfers',
      blocks: [
        {
          type: 'paragraph',
          text: 'Your information may be transferred to and maintained on servers located outside of your state, province, country, or other governmental jurisdiction where data protection laws may differ from those in your jurisdiction.',
        },
        {
          type: 'paragraph',
          text: 'Our servers are located in the United States. If you access our Service from outside the United States, please be aware that your information may be transferred to, stored, and processed in the United States.',
        },
      ],
    },
    {
      heading: '13. State-Specific Privacy Rights',
      blocks: [
        { type: 'subheading', text: 'California Privacy Rights (CCPA/CPRA)' },
        {
          type: 'paragraph',
          text: 'If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):',
        },
        {
          type: 'list',
          items: [
            'Right to know what personal information we collect, use, and disclose',
            'Right to request deletion of your personal information',
            'Right to opt-out of the sale of your information (we do not sell personal information)',
            'Right to opt-out of the "sharing" of your personal information for cross-context behavioral advertising (such as building custom or lookalike advertising audiences)',
            'Right to non-discrimination for exercising your privacy rights',
            'Right to correct inaccurate personal information',
            'Right to limit use of sensitive personal information',
          ],
        },
        { type: 'subheading', text: 'Utah Privacy Rights' },
        {
          type: 'paragraph',
          text: 'Optio is based in Utah and serves Utah students and families. Utah residents have rights under the Utah Consumer Privacy Act.',
        },
      ],
    },
    {
      heading: '14. Changes to This Privacy Policy',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may update our Privacy Policy from time to time. We will notify you of any material changes by:',
        },
        {
          type: 'list',
          items: [
            'Posting the new Privacy Policy on this page',
            'Updating the "Effective Date" at the top',
            'Sending an email to the primary account email address',
            'Displaying a prominent notice in the Service',
          ],
        },
        {
          type: 'paragraph',
          text: 'You are advised to review this Privacy Policy periodically for any changes. For material changes that affect the privacy of children under 13, we will obtain verifiable parental consent before implementing the changes.',
        },
      ],
    },
    {
      heading: '15. Contact Us',
      blocks: [
        {
          type: 'paragraph',
          text: 'If you have any questions about this Privacy Policy, our data practices, or want to exercise your privacy rights, please contact us at:',
        },
        {
          type: 'contact',
          lines: [
            [{ bold: 'Optio, LLC' }],
            '1555 Freedom Blvd 200 W',
            'Provo, UT 84604',
            [{ bold: 'Email:' }, ' support@optioeducation.com'],
            [{ bold: 'Privacy Inquiries:' }, ' privacy@optioeducation.com'],
            [{ bold: 'Website:' }, ' https://optioeducation.com'],
          ],
        },
        {
          type: 'paragraph',
          text: 'For COPPA-related inquiries regarding children under 13, please email privacy@optioeducation.com with "COPPA Request" in the subject line.',
        },
      ],
    },
  ],
};
