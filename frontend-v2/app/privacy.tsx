/**
 * Privacy Policy - Public page, no auth required.
 */

import React from 'react';
import { ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, Heading, UIText, Card, Divider } from '@/src/components/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <VStack space="sm">
      <Heading size="md">{title}</Heading>
      {children}
    </VStack>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <UIText size="sm" className="text-typo-600 leading-6">{children}</UIText>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <VStack space="xs" className="ml-2">
      {items.map((item, i) => (
        <HStack key={i} className="items-start gap-2">
          <UIText size="sm" className="text-optio-purple">•</UIText>
          <UIText size="sm" className="text-typo-600 leading-6 flex-1">{item}</UIText>
        </HStack>
      ))}
    </VStack>
  );
}

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 py-6 pb-16" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-3xl w-full md:mx-auto">

          {/* Back button */}
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.push('/(auth)/login')} className="flex-row items-center gap-1">
            <Ionicons name="arrow-back" size={18} color="#6D469B" />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Back</UIText>
          </Pressable>

          <Card variant="elevated" size="lg">
            <VStack space="lg">
              <Heading size="2xl">Privacy Policy</Heading>
              <UIText size="xs" className="text-typo-400">Effective Date: January 27, 2025</UIText>

              <Divider />

              <Section title="1. Introduction">
                <P>
                  Optio, LLC ("we," "our," or "us") is committed to protecting the privacy of students,
                  parents, and all users of our educational platform. This Privacy Policy explains how we
                  collect, use, disclose, and safeguard your information when you use the Optio platform.
                </P>
                <P>
                  We are committed to complying with the Children's Online Privacy Protection Act (COPPA),
                  the Family Educational Rights and Privacy Act (FERPA), and all applicable privacy laws.
                </P>
              </Section>

              <Section title="2. Information We Collect">
                <P>Personal Information:</P>
                <BulletList items={[
                  'Name (first and last name)',
                  'Email address',
                  'Password (encrypted and securely stored)',
                  'Date of birth (for age verification and COPPA compliance)',
                  'Parent/guardian information (for users under 13)',
                  'Role (student, parent, advisor, admin)',
                ]} />

                <P>Educational and Learning Data:</P>
                <BulletList items={[
                  'Quest enrollment and completion data',
                  'Task progress and completion status',
                  'Evidence of learning (images, documents, videos, text submissions)',
                  'Portfolio and diploma content',
                  'XP (experience points) and achievement data',
                  'Badge progress and earned badges',
                  'Skill pillar data (STEM, Wellness, Communication, Civics, Art)',
                ]} />

                <P>AI Tutor Data:</P>
                <BulletList items={[
                  'Conversation messages between students and AI Tutor',
                  'Tutor mode preferences',
                  'Safety ratings and flagged content',
                  'Parent oversight settings',
                ]} />

                <P>Usage Information (automatically collected):</P>
                <BulletList items={[
                  'Log data (IP address, browser type, access times)',
                  'Device information (device type, operating system)',
                  'Pages viewed and features used',
                  'Session duration and interaction patterns',
                ]} />
              </Section>

              <Section title="3. How We Use Your Information">
                <P>Provide and Improve Our Service:</P>
                <BulletList items={[
                  'Create and manage your account',
                  'Process quest enrollments and track progress',
                  'Generate diplomas, portfolios, and transcripts',
                  'Award badges and calculate XP across skill pillars',
                  'Provide AI Tutor assistance with safety monitoring',
                  'Enable parent dashboard access and monitoring',
                  'Monitor and analyze usage patterns to improve the Service',
                  'Personalize learning experiences and recommendations',
                ]} />

                <P>Safety and Compliance:</P>
                <BulletList items={[
                  'Monitor AI Tutor conversations for safety concerns',
                  'Detect and prevent fraud, abuse, or inappropriate behavior',
                  'Comply with legal obligations and respond to legal requests',
                  'Enforce our Terms of Service and community standards',
                ]} />
              </Section>

              <Section title="4. Information Sharing and Disclosure">
                <Card variant="outline" size="md" className="border-l-4 border-green-400 bg-green-50">
                  <UIText size="sm" className="font-poppins-semibold text-green-800">
                    We will never sell student data or personal information to third parties.
                  </UIText>
                </Card>

                <P>We may share information in these situations:</P>
                <BulletList items={[
                  'With your consent or at your direction',
                  'With service providers who assist in operating our platform',
                  'For legal reasons - to comply with laws, respond to legal requests, or protect rights',
                  'To protect safety - to prevent fraud, abuse, illegal activities, or immediate harm',
                  'Business transfers - in connection with a merger, acquisition, or sale of assets',
                  'Anonymized data - aggregate, de-identified data for research and improvement',
                ]} />
              </Section>

              <Section title="5. Children's Privacy (COPPA Compliance)">
                <P>
                  Optio is designed for K-12 students (ages 5-18). We take children's privacy seriously
                  and comply with the Children's Online Privacy Protection Act (COPPA).
                </P>
                <P>For Children Under 13:</P>
                <BulletList items={[
                  'Parents or legal guardians must create and manage accounts on behalf of children under 13',
                  'We collect only information necessary to provide the educational service',
                  'Parents have the right to review, update, or delete their child\'s information at any time',
                  'Parents can disable specific features for their child',
                  'We do not require children to provide more information than necessary to participate',
                ]} />
                <P>Parental Rights:</P>
                <BulletList items={[
                  'Review what personal information we have collected from their child',
                  'Request deletion of their child\'s personal information',
                  'Refuse to allow further collection or use of their child\'s information',
                  'Request changes to privacy settings or feature access',
                ]} />
                <P>Contact support@optioeducation.com to exercise these rights.</P>
              </Section>

              <Section title="6. Data Retention">
                <BulletList items={[
                  'We retain your personal information for as long as your account is active',
                  'You may request account deletion at any time',
                  'Upon deletion, we will remove your personal information within 30 days',
                  'Some information may be retained for legal compliance or dispute resolution',
                  'Accounts inactive for more than 3 years may be archived after notice',
                ]} />
              </Section>

              <Section title="7. Data Security">
                <P>We implement appropriate security measures including:</P>
                <BulletList items={[
                  'Encryption of data in transit (HTTPS/TLS) and at rest',
                  'Secure password hashing (bcrypt with salt)',
                  'httpOnly cookies for authentication (XSS protection)',
                  'CSRF (Cross-Site Request Forgery) protection',
                  'Access controls and role-based permissions',
                  'Secure hosting infrastructure (Supabase, Render)',
                  'AI Tutor safety monitoring and content filtering',
                  'Audit logging of sensitive operations',
                ]} />
                <P>
                  However, no method of electronic transmission or storage is 100% secure. While we strive
                  to protect your personal information, we cannot guarantee absolute security.
                </P>
              </Section>

              <Section title="8. Your Rights and Choices">
                <P>You have the right to:</P>
                <BulletList items={[
                  'Access and receive a copy of your personal information',
                  'Update or correct inaccurate information',
                  'Delete your account and personal information',
                  'Export your data in a portable format',
                  'Control portfolio and diploma visibility settings',
                  'Opt out of marketing communications',
                  'Control notification settings',
                  'Disable AI Tutor access',
                ]} />
                <P>To exercise these rights, contact support@optioeducation.com.</P>
              </Section>

              <Section title="9. Cookies and Tracking">
                <P>Types of cookies we use:</P>
                <BulletList items={[
                  'Essential cookies: Required for authentication and core Service functionality',
                  'Analytics cookies: Help us understand how users interact with our Service',
                  'Preference cookies: Remember your settings and preferences',
                  'Security cookies: CSRF tokens and security measures',
                ]} />
                <P>
                  You can instruct your browser to refuse all cookies. However, some features of our
                  Service may not function properly without cookies.
                </P>
              </Section>

              <Section title="10. Third-Party Services">
                <P>Third-party services we use include:</P>
                <BulletList items={[
                  'Supabase - Database, authentication, and storage (GDPR compliant)',
                  'Google Gemini - AI Tutor features with safety monitoring',
                  'Pexels - Quest and badge imagery (licensed stock photos)',
                  'Render - Web hosting and application infrastructure',
                ]} />
              </Section>

              <Section title="11. Educational Records (FERPA Compliance)">
                <P>
                  For students enrolled in accredited programs, certain educational records may be
                  protected under FERPA. We comply with FERPA requirements:
                </P>
                <BulletList items={[
                  'Educational records are disclosed only with parent consent or as permitted by law',
                  'Parents and eligible students have the right to inspect and review education records',
                  'Parents have the right to request amendments to inaccurate records',
                  'We maintain a record of disclosures of education records',
                ]} />
              </Section>

              <Section title="12. State-Specific Privacy Rights">
                <P>California Privacy Rights (CCPA/CPRA):</P>
                <BulletList items={[
                  'Right to know what personal information we collect, use, and disclose',
                  'Right to request deletion of your personal information',
                  'Right to opt-out of the sale of your information (we do not sell personal information)',
                  'Right to non-discrimination for exercising your privacy rights',
                ]} />
                <P>
                  Utah residents have rights under the Utah Consumer Privacy Act. Optio is based in Utah
                  and serves many Utah students.
                </P>
              </Section>

              <Section title="13. Changes to This Privacy Policy">
                <P>
                  We may update our Privacy Policy from time to time. We will notify you of material changes
                  by posting the new Privacy Policy, updating the effective date, and sending an email notification.
                  For material changes affecting children under 13, we will obtain verifiable parental consent.
                </P>
              </Section>

              <Section title="14. Contact Us">
                <P>
                  If you have any questions about this Privacy Policy, please contact us at:
                </P>
                <VStack space="xs" className="ml-2">
                  <UIText size="sm" className="font-poppins-semibold">Optio, LLC</UIText>
                  <UIText size="sm" className="text-typo-600">1555 Freedom Blvd 200 W</UIText>
                  <UIText size="sm" className="text-typo-600">Provo, UT 84604</UIText>
                  <UIText size="sm" className="text-typo-600">Email: support@optioeducation.com</UIText>
                  <UIText size="sm" className="text-typo-600">Privacy Inquiries: privacy@optioeducation.com</UIText>
                </VStack>
                <P>
                  For COPPA-related inquiries regarding children under 13, email privacy@optioeducation.com
                  with "COPPA Request" in the subject line.
                </P>
              </Section>
            </VStack>
          </Card>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
