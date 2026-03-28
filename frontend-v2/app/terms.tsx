/**
 * Terms of Service - Public page, no auth required.
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

export default function TermsOfServiceScreen() {
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
              <Heading size="2xl">Terms of Service</Heading>
              <UIText size="xs" className="text-typo-400">Effective Date: January 27, 2025</UIText>

              <Divider />

              <Section title="1. Acceptance of Terms">
                <P>
                  By accessing or using the Optio platform ("Service"), you agree to be bound by these Terms of Service.
                  If you do not agree to these terms, please do not use our Service.
                </P>
              </Section>

              <Section title="2. Description of Service">
                <P>
                  Optio is an educational platform designed for K-12 students that combines project-based learning
                  with digital achievement tracking. The Service includes:
                </P>
                <BulletList items={[
                  'Quest-based learning system with personalized tasks',
                  'Badge achievements across five skill pillars (STEM, Wellness, Communication, Civics, Art)',
                  'Digital diploma and portfolio creation',
                  'Evidence submission and documentation tools',
                  'XP (experience points) tracking and progression system',
                  'AI Tutor for learning assistance',
                  'Parent dashboard for monitoring and support',
                  'Community features for connecting with other learners',
                ]} />
              </Section>

              <Section title="3. User Accounts and Age Requirements">
                <P>Age Requirements:</P>
                <BulletList items={[
                  'This Service is intended for K-12 students (ages 5-18)',
                  'Parents or legal guardians must create and manage accounts for children under 13 years old (COPPA compliance)',
                  'Students aged 13 and older may create and manage their own accounts with parental consent',
                  'Parents may monitor their student\'s activity through the Parent Dashboard',
                ]} />
                <P>Account Responsibilities:</P>
                <BulletList items={[
                  'You must provide accurate and complete information when creating an account',
                  'You are responsible for maintaining the confidentiality of your account credentials',
                  'You must notify us immediately of any unauthorized use of your account',
                  'Parent accounts are responsible for all activity conducted under student accounts they manage',
                ]} />
              </Section>

              <Section title="4. Educational Philosophy and Content">
                <P>
                  Optio operates on the philosophy that "The Process Is The Goal." Learning is valued for
                  its intrinsic worth and the growth it creates in the present moment, not solely for future outcomes.
                </P>
                <P>User-Generated Content:</P>
                <BulletList items={[
                  'You retain ownership of all content you submit to the Service ("User Content")',
                  'By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, display, and distribute your content as part of the Service for educational and promotional purposes',
                  'You are responsible for ensuring your User Content does not violate any laws or third-party rights',
                  'Students working on business ventures retain all intellectual property rights to their businesses',
                ]} />
                <Card variant="outline" size="md" className="border-l-4 border-amber-400 bg-amber-50">
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-semibold">IMPORTANT: Your learning portfolio is PUBLIC by default.</UIText>
                    <BulletList items={[
                      'Your learning portfolio is visible to anyone with your portfolio URL',
                      'Portfolio content may be indexed by search engines and shared on social media',
                      'You can change your privacy settings at any time on your Profile page',
                    ]} />
                  </VStack>
                </Card>
              </Section>

              <Section title="5. Acceptable Use">
                <P>You agree not to:</P>
                <BulletList items={[
                  'Submit false, misleading, or plagiarized content or evidence',
                  'Impersonate another person or entity',
                  'Upload content that is offensive, harmful, illegal, or inappropriate for a K-12 educational environment',
                  'Harass, bully, or discriminate against other users',
                  'Attempt to gain unauthorized access to the Service or other users\' accounts',
                  'Use the Service for any illegal or unauthorized purpose',
                  'Interfere with or disrupt the Service or servers',
                  'Share account credentials with others',
                ]} />
              </Section>

              <Section title="6. Subscription and Payments">
                <P>
                  Access to certain features of the digital Optio platform may require a paid subscription.
                  Subscription details and pricing are subject to change with notice.
                </P>
                <BulletList items={[
                  'All subscriptions are month-to-month with no long-term contract required',
                  'Subscription fees are billed in advance on a recurring monthly basis',
                  'You may cancel your subscription at any time with written notice',
                  'Cancellations take effect at the end of the current billing period',
                  'All fees are non-refundable unless otherwise stated or required by law',
                  'We reserve the right to modify pricing with 30 days\' advance notice',
                ]} />
              </Section>

              <Section title="7. AI Tutor and Safety">
                <P>
                  Our AI Tutor feature uses Google Gemini to provide personalized learning assistance.
                  Safety measures include:
                </P>
                <BulletList items={[
                  'Content filtering for age-appropriate interactions',
                  'Safety monitoring and logging of all conversations',
                  'Parent dashboard access to view tutor conversations',
                  'Immediate flagging of inappropriate content',
                  'Human review of flagged interactions',
                ]} />
              </Section>

              <Section title="8. Parent Dashboard and Monitoring Rights">
                <P>Parents with linked student accounts have the following capabilities:</P>
                <BulletList items={[
                  'View student\'s active quests and progress',
                  'Access learning calendar and scheduled tasks',
                  'Review learning insights and time patterns',
                  'Monitor AI Tutor conversations for safety',
                  'Upload evidence on behalf of students',
                  'Receive learning rhythm indicators',
                  'Access safety reports and flagged content',
                ]} />
              </Section>

              <Section title="9. Intellectual Property">
                <P>
                  The Service and its original content (excluding User Content) are owned by Optio, LLC and are
                  protected by copyright, trademark, and other intellectual property laws.
                </P>
                <P>
                  Students working on business ventures through Optio retain all intellectual property
                  rights to their business ideas, products, and creations.
                </P>
              </Section>

              <Section title="10. Privacy">
                <P>
                  Your use of the Service is also governed by our Privacy Policy, which is incorporated into
                  these Terms by reference. We are committed to protecting student privacy and complying with
                  COPPA, FERPA, and other applicable privacy laws.
                </P>
              </Section>

              <Section title="11. Third-Party Services">
                <P>Our Service uses third-party services including:</P>
                <BulletList items={[
                  'Supabase (database and authentication)',
                  'Google Gemini (AI Tutor features)',
                  'Pexels (quest and badge imagery)',
                ]} />
              </Section>

              <Section title="12. Disclaimers and Limitations of Liability">
                <P>
                  THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
                  INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                  OR NON-INFRINGEMENT.
                </P>
                <P>
                  To the maximum extent permitted by law, we shall not be liable for any indirect, incidental,
                  special, consequential, or punitive damages arising from your use of the Service.
                </P>
              </Section>

              <Section title="13. Termination">
                <P>
                  We may terminate or suspend your account immediately, without prior notice, for breach of
                  these Terms, fraudulent or illegal activity, disruptive behavior, or non-payment of fees.
                </P>
                <P>
                  You may terminate your account at any time by contacting us at support@optioeducation.com
                  or through your Profile settings.
                </P>
              </Section>

              <Section title="14. Dispute Resolution">
                <P>
                  Any dispute arising from these Terms will first be addressed through good-faith informal
                  discussion. If unresolved, it shall be submitted to mediation in Utah County, Utah, then
                  resolved through individual, final, and binding arbitration under the rules of the American
                  Arbitration Association.
                </P>
              </Section>

              <Section title="15. Governing Law">
                <P>
                  These Terms shall be governed by and construed in accordance with the laws of the State
                  of Utah and the United States, without regard to conflict of law provisions.
                </P>
              </Section>

              <Section title="16. Contact Information">
                <P>
                  If you have any questions about these Terms of Service, please contact us at:
                </P>
                <VStack space="xs" className="ml-2">
                  <UIText size="sm" className="font-poppins-semibold">Optio, LLC</UIText>
                  <UIText size="sm" className="text-typo-600">1555 Freedom Blvd 200 W</UIText>
                  <UIText size="sm" className="text-typo-600">Provo, UT 84604</UIText>
                  <UIText size="sm" className="text-typo-600">Email: support@optioeducation.com</UIText>
                </VStack>
              </Section>
            </VStack>
          </Card>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
