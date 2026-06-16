import type { LegalDocument } from './types';

/**
 * Terms of Service — canonical content shared by v1 web and v2 mobile.
 * Keep `version` in sync with CURRENT_TOS_VERSION in backend/legal_versions.py.
 */
export const termsOfService: LegalDocument = {
  title: 'Terms of Service',
  effectiveDate: 'June 16, 2026',
  version: '1.0',
  sections: [
    {
      heading: '1. Acceptance of Terms',
      blocks: [
        {
          type: 'paragraph',
          text: 'By accessing or using the Optio platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.',
        },
      ],
    },
    {
      heading: '2. Description of Service',
      blocks: [
        {
          type: 'paragraph',
          text: 'Optio is an educational platform designed for K-12 students that combines project-based learning with digital achievement tracking. The Service includes:',
        },
        {
          type: 'list',
          items: [
            'Quest-based learning system with personalized tasks',
            'Badge achievements across five skill pillars (STEM, Wellness, Communication, Civics, Art)',
            'Digital diploma and portfolio creation',
            'Evidence submission and documentation tools',
            'XP (experience points) tracking and progression system',
            'AI Tutor for learning assistance',
            'Parent dashboard for monitoring and support',
            'Community features for connecting with other learners',
          ],
        },
        {
          type: 'paragraph',
          text: [
            'Optio is available as both a digital-only platform and as part of our fully online private school, Optio Academy. Academy participants must also agree to the ',
            { link: 'Optio Academy Agreement', href: '/academy-agreement' },
            '.',
          ],
        },
      ],
    },
    {
      heading: '3. User Accounts and Age Requirements',
      blocks: [
        { type: 'paragraph', text: 'Age Requirements:', emphasis: true },
        {
          type: 'list',
          items: [
            'This Service is intended for K-12 students (ages 5-18)',
            'Parents or legal guardians must create and manage accounts for children under 13 years old (COPPA compliance)',
            'Students aged 13 and older may create and manage their own accounts with parental consent',
            'Parents may monitor their student\'s activity through the Parent Dashboard',
          ],
        },
        { type: 'paragraph', text: 'Account Responsibilities:', emphasis: true },
        {
          type: 'list',
          items: [
            'You must provide accurate and complete information when creating an account',
            'You are responsible for maintaining the confidentiality of your account credentials',
            'You must notify us immediately of any unauthorized use of your account',
            'Parent accounts are responsible for all activity conducted under student accounts they manage',
          ],
        },
      ],
    },
    {
      heading: '4. Educational Philosophy and Content',
      blocks: [
        {
          type: 'paragraph',
          text: 'Optio operates on the philosophy that "The Process Is The Goal." Learning is valued for its intrinsic worth and the growth it creates in the present moment, not solely for future outcomes.',
        },
        { type: 'paragraph', text: 'User-Generated Content:', emphasis: true },
        {
          type: 'list',
          items: [
            'You retain ownership of all content you submit to the Service ("User Content")',
            'By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, display, and distribute your content as part of the Service for educational and promotional purposes',
            'You are responsible for ensuring your User Content does not violate any laws or third-party rights',
            'Students working on business ventures retain all intellectual property rights to their businesses',
          ],
        },
        { type: 'paragraph', text: 'Public Portfolio Visibility:', emphasis: true },
        {
          type: 'callout',
          variant: 'warning',
          title: 'IMPORTANT: Your learning portfolio is PUBLIC by default.',
          blocks: [
            {
              type: 'list',
              items: [
                'Your learning portfolio (including quests, evidence, achievements, and diplomas) is visible to anyone with your portfolio URL',
                'Portfolio content may be indexed by search engines and shared on social media',
                'Anyone on the internet can view your educational content and progress',
                'You can change your privacy settings at any time on your Profile page',
                'Privacy controls allow you to make your portfolio private or limit what information is publicly visible',
              ],
            },
          ],
        },
        { type: 'paragraph', text: 'Educational Credentials:', emphasis: true },
        {
          type: 'paragraph',
          text: 'Optio Academy participants may earn accredited credentials through our program. Digital diplomas and portfolios created through Optio are self-validated educational records that document learning achievements. We do not guarantee that these will be recognized by all educational institutions or employers, though they are designed to showcase meaningful learning outcomes.',
        },
      ],
    },
    {
      heading: '5. Acceptable Use',
      blocks: [
        { type: 'paragraph', text: 'You agree not to:' },
        {
          type: 'list',
          items: [
            'Submit false, misleading, or plagiarized content or evidence',
            'Impersonate another person or entity',
            'Upload content that is offensive, harmful, illegal, or inappropriate for a K-12 educational environment',
            'Harass, bully, or discriminate against other users',
            'Attempt to gain unauthorized access to the Service or other users\' accounts',
            'Use the Service for any illegal or unauthorized purpose',
            'Interfere with or disrupt the Service or servers',
            'Violate any applicable laws or regulations',
            'Share account credentials with others',
          ],
        },
      ],
    },
    {
      heading: '6. Pricing, Optio Academy, and Scholarship Programs',
      blocks: [
        { type: 'subheading', text: 'The Optio App and Platform Are Free' },
        {
          type: 'paragraph',
          text: 'The Optio mobile app and the core Optio learning platform are free to use. There are no in-app purchases or subscriptions. Creating an account and using the learning features — including quests, the learning journal, badges, the AI Tutor, and the parent and observer dashboards — costs nothing.',
        },
        { type: 'subheading', text: 'Optio Academy' },
        {
          type: 'paragraph',
          text: 'Optio Academy is our fully online private school for grades 9 – 12, delivered through the Optio platform with daily contact between students and a dedicated teacher. Enrollment in Optio Academy is a separate educational relationship established directly with Optio at enrollment — it is not an in-app subscription or purchase. Annual tuition is $8,000 per student, billed on the schedule agreed at enrollment, and covers all instruction, curriculum materials, and the Optio platform. Enrolled Academy students and their parents gain access to additional platform features as part of that enrollment relationship.',
        },
        { type: 'subheading', text: 'Tuition Terms (Optio Academy)' },
        {
          type: 'list',
          items: [
            'Optio Academy tuition is arranged directly between the family and Optio at enrollment, not through the app, and is billed on the schedule agreed at enrollment (annual or installment)',
            'If an Optio Academy student withdraws before the end of the school year, tuition is refunded prorated by the number of months attended',
            'Where tuition is funded by a scholarship or other third-party program, refunds flow back through that program rather than to the family directly',
            'We reserve the right to modify tuition with 30 days\' advance notice; pricing changes do not affect tuition for the current school year',
          ],
        },
      ],
    },
    {
      heading: '7. AI Tutor and Safety',
      blocks: [
        {
          type: 'paragraph',
          text: 'Our AI Tutor feature uses Google Gemini to provide personalized learning assistance. Safety measures include:',
        },
        {
          type: 'list',
          items: [
            'Content filtering for age-appropriate interactions',
            'Safety monitoring and logging of all conversations',
            'Parent dashboard access to view tutor conversations',
            'Immediate flagging of inappropriate content',
            'Human review of flagged interactions',
          ],
        },
        {
          type: 'paragraph',
          text: 'Parents may review, monitor, and disable AI Tutor access at any time through their Parent Dashboard.',
        },
      ],
    },
    {
      heading: '8. Parent Dashboard and Monitoring Rights',
      blocks: [
        {
          type: 'paragraph',
          text: 'Parents with linked student accounts have the following rights and capabilities:',
        },
        {
          type: 'list',
          items: [
            'View student\'s active quests and progress',
            'Access learning calendar and scheduled tasks',
            'Review learning insights and time patterns',
            'Monitor AI Tutor conversations for safety',
            'Upload evidence on behalf of students (subject to student approval)',
            'Receive learning rhythm indicators (flow state vs. needs support)',
            'Access safety reports and flagged content',
          ],
        },
        {
          type: 'paragraph',
          text: 'Parent access is designed to support student learning while respecting student autonomy. Parents cannot start quests on behalf of students or modify student work without permission.',
        },
      ],
    },
    {
      heading: '9. Media Release and Promotional Use',
      blocks: [
        { type: 'paragraph', text: 'By using Optio, you grant us permission to:' },
        {
          type: 'list',
          items: [
            'Use student images, voices, and work in promotional and educational materials',
            'Showcase student portfolios and diplomas as examples of learning outcomes',
            'Feature student projects in demonstrations and presentations',
            'Share anonymized learning data for research and improvement purposes',
          ],
        },
        {
          type: 'paragraph',
          text: 'All such use will be for non-commercial educational purposes and will respect student privacy. You may opt out of promotional use by contacting us at support@optioeducation.com.',
        },
      ],
    },
    {
      heading: '10. Intellectual Property',
      blocks: [
        {
          type: 'paragraph',
          text: 'The Service and its original content (excluding User Content) are owned by Optio, LLC and are protected by copyright, trademark, and other intellectual property laws.',
        },
        {
          type: 'paragraph',
          text: 'Students working on business ventures through Optio Academy retain all intellectual property rights to their business ideas, products, and creations. Students grant Optio a non-exclusive license to showcase their work for educational and promotional purposes only.',
        },
      ],
    },
    {
      heading: '11. Privacy',
      blocks: [
        {
          type: 'paragraph',
          text: [
            'Your use of the Service is also governed by our ',
            { link: 'Privacy Policy', href: '/privacy' },
            ', which is incorporated into these Terms by reference. We are committed to protecting student privacy and complying with COPPA, FERPA, and other applicable privacy laws.',
          ],
        },
      ],
    },
    {
      heading: '12. Third-Party Services',
      blocks: [
        { type: 'paragraph', text: 'Our Service uses third-party services including:' },
        {
          type: 'list',
          items: [
            'Supabase (database and authentication)',
            'Stripe (payment processing)',
            'Google Gemini (AI Tutor features)',
            'Pexels (quest and badge imagery)',
            'Meta Pixel (marketing analytics and advertising audiences)',
          ],
        },
        {
          type: 'paragraph',
          text: 'These services have their own terms and privacy policies. We are not responsible for third-party service practices but carefully select partners who respect user privacy.',
        },
      ],
    },
    {
      heading: '13. Disclaimers and Limitations of Liability',
      blocks: [
        {
          type: 'paragraph',
          text: 'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.',
        },
        {
          type: 'paragraph',
          text: 'We do not guarantee that the Service will be uninterrupted, secure, or error-free. We do not guarantee specific educational outcomes, business success, or acceptance of credentials by third parties.',
        },
        {
          type: 'paragraph',
          text: 'To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to loss of data, loss of profits, or loss of educational opportunities.',
        },
        {
          type: 'paragraph',
          text: [
            'For Optio Academy participants, additional terms specific to enrollment in the school are outlined in the ',
            { link: 'Optio Academy Agreement', href: '/academy-agreement' },
            '.',
          ],
        },
      ],
    },
    {
      heading: '14. Indemnification',
      blocks: [
        {
          type: 'paragraph',
          text: 'You agree to indemnify and hold harmless Optio, LLC and its officers, employees, and agents from any claims, damages, losses, and expenses (including attorney\'s fees) arising from:',
        },
        {
          type: 'list',
          items: [
            'Your use of the Service or violation of these Terms',
            'Your User Content or any content you submit',
            'Your violation of any rights of another party',
            'Your violation of any applicable laws or regulations',
          ],
        },
      ],
    },
    {
      heading: '15. Termination',
      blocks: [
        {
          type: 'paragraph',
          text: 'We may terminate or suspend your account immediately, without prior notice, for any reason, including but not limited to:',
        },
        {
          type: 'list',
          items: [
            'Breach of these Terms',
            'Fraudulent or illegal activity',
            'Disruptive or harmful behavior',
            'Non-payment of fees',
            'Lack of engagement or participation (Academy participants)',
            'Determination that the program is no longer a suitable fit',
          ],
        },
        {
          type: 'paragraph',
          text: 'Upon termination, your right to use the Service will cease immediately. Your User Content may be deleted or retained in accordance with our data retention policies and legal obligations.',
        },
        {
          type: 'paragraph',
          text: 'You may terminate your account at any time by contacting us at support@optioeducation.com.',
        },
      ],
    },
    {
      heading: '16. Dispute Resolution',
      blocks: [
        {
          type: 'paragraph',
          text: 'Any dispute arising from these Terms will first be addressed through good-faith informal discussion between the parties. If the dispute cannot be resolved informally, it shall be submitted to mediation in Utah County, Utah.',
        },
        {
          type: 'paragraph',
          text: 'If mediation fails to resolve the dispute, it will be resolved through individual, final, and binding arbitration in Utah County, Utah, under the rules of the American Arbitration Association. By agreeing to these Terms, you waive the right to a jury trial and the right to participate in a class-action lawsuit.',
        },
        {
          type: 'paragraph',
          text: 'This dispute resolution provision does not limit any rights provided by law to parents or guardians of minor students.',
        },
      ],
    },
    {
      heading: '17. Changes to Terms',
      blocks: [
        {
          type: 'paragraph',
          text: 'We reserve the right to modify these Terms at any time. We will notify users of material changes via email to the primary account email address or through prominent notice in the Service.',
        },
        {
          type: 'paragraph',
          text: 'Your continued use of the Service after changes are posted constitutes acceptance of the modified Terms. If you do not agree to the modified Terms, you must stop using the Service and may cancel your account.',
        },
      ],
    },
    {
      heading: '18. Governing Law',
      blocks: [
        {
          type: 'paragraph',
          text: 'These Terms shall be governed by and construed in accordance with the laws of the State of Utah and the United States, without regard to conflict of law provisions.',
        },
      ],
    },
    {
      heading: '19. Severability and Entire Agreement',
      blocks: [
        {
          type: 'paragraph',
          text: 'If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited or eliminated to the minimum extent necessary so that these Terms will otherwise remain in full force and effect.',
        },
        {
          type: 'paragraph',
          text: 'These Terms, together with the Privacy Policy and (for Academy participants) the Optio Academy Agreement, constitute the entire agreement between you and Optio, LLC regarding the Service and supersede all prior agreements and understandings.',
        },
      ],
    },
    {
      heading: '20. Contact Information',
      blocks: [
        {
          type: 'paragraph',
          text: 'If you have any questions about these Terms of Service, please contact us at:',
        },
        {
          type: 'contact',
          lines: [
            [{ bold: 'Optio, LLC' }],
            '1555 Freedom Blvd 200 W',
            'Provo, UT 84604',
            [{ bold: 'Email:' }, ' support@optioeducation.com'],
            [{ bold: 'Website:' }, ' https://optioeducation.com'],
          ],
        },
      ],
    },
  ],
};
