/**
 * Pipe Organ Encounter — public registration page.
 *
 * Route: /poe   (single page; the participant picks their POE location here)
 * Public (no auth). Teens (or their parents) enroll here; participants under 18
 * capture parental consent inline (typed name + checkbox). On submit the backend
 * creates an independent student account, records consent, and sets up a
 * "Pipe Organ Encounter" journal topic the student documents into during camp.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { poeAPI } from '@/src/services/api';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField,
} from '@/src/components/ui';

interface Cohort {
  slug: string;
  display_name: string;
  site_city?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

const CONSENT_STATEMENT =
  'I am the parent or legal guardian of this participant. I consent to their ' +
  'enrollment in the Optio Pipe Organ Encounter program, to Optio creating an ' +
  'account and processing their learning records to assess and issue academic ' +
  'credit, and I confirm the information provided is accurate.';

const WHAT_YOU_GET = [
  '0.5 fine arts credit (one semester of a high school music course), posted with a grade of A.',
  'Real accredited credit — Optio is WASC-accredited, so it transfers nationwide.',
  'Homeschool and unenrolled students get an official accredited transcript record.',
  'All the work happens during the POE week, on your phone. Nothing extra after camp.',
];

const HOW_IT_WORKS = [
  'Pick your POE and enroll below (free, opt-in). Under 18? A parent or guardian signs consent right here.',
  'On day one of camp, we show you what to log — about 15–20 minutes.',
  'Each day, log lessons, practice, masterclasses, repertoire, and reflections. Add photos, audio, or video.',
  'After camp, Optio reviews your documented work and issues your 0.5 fine arts credit.',
];

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format a YYYY-MM-DD range without timezone surprises (parse the parts directly).
const formatDateRange = (start?: string | null, end?: string | null): string | null => {
  if (!start) return null;
  const [sy, sm, sd] = start.split('-').map(Number);
  if (!sy || !sm || !sd) return null;
  if (!end) return `${MONTHS[sm - 1]} ${sd}, ${sy}`;
  const [ey, em, ed] = end.split('-').map(Number);
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}, ${sy}`;
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}, ${sy}`;
  return `${MONTHS[sm - 1]} ${sd}, ${sy} – ${MONTHS[em - 1]} ${ed}, ${ey}`;
};

const ageFromDob = (dob: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
};

export default function PoeEnrollScreen() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [selectedSlug, setSelectedSlug] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [parentFirst, setParentFirst] = useState('');
  const [parentLast, setParentLast] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ consent_pending?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await poeAPI.cohorts();
        setCohorts(data.cohorts || []);
      } catch {
        setLoadError('Could not load the Pipe Organ Encounter locations. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const age = ageFromDob(dob);
  const isMinor = age !== null && age < 18;
  const selectedCohort = cohorts.find((c) => c.slug === selectedSlug) || null;

  const handleSubmit = async () => {
    setError(null);
    if (!selectedSlug) { setError('Please select your POE location.'); return; }
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return; }
    if (!emailOk(email)) { setError('A valid email address is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (age === null) { setError('Enter your date of birth as YYYY-MM-DD.'); return; }
    if (age < 13) { setError('Participants under 13 cannot enroll directly. Please contact us so a parent can set up a managed account.'); return; }
    if (isMinor && !emailOk(parentEmail)) { setError('A parent or guardian email is required for participants under 18.'); return; }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        poe_cohort: selectedSlug,
        student: { first_name: firstName, last_name: lastName, email, password, date_of_birth: dob },
      };
      if (isMinor) {
        body.parent = { first_name: parentFirst, last_name: parentLast, email: parentEmail };
        body.consent = { signature_name: signatureName, agreed: agreed && !!signatureName.trim() };
      }
      const { data } = await poeAPI.enroll(body);
      setSuccess({ consent_pending: data.consent_pending });
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d?.message || d?.error || 'Enrollment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <VStack className="items-center gap-3">
          <ActivityIndicator size="large" color="#6D469B" />
          <UIText className="text-typo-400">Loading…</UIText>
        </VStack>
      </SafeAreaView>
    );
  }

  // ── Load error ──
  if (loadError) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="md" className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-red-100 items-center justify-center">
              <Ionicons name="close-circle-outline" size={32} color="#DC2626" />
            </View>
            <Heading size="lg" className="text-center">Something went wrong</Heading>
            <UIText size="sm" className="text-typo-400 text-center">{loadError}</UIText>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  // ── Success ──
  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="md" className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center">
              <Ionicons name="checkmark-circle-outline" size={32} color="#16A34A" />
            </View>
            <Heading size="lg" className="text-center">You’re enrolled in {selectedCohort?.display_name || 'your POE'}</Heading>
            <UIText size="sm" className="text-typo-500 text-center">
              Check your email to verify your account, then log in to start logging your POE.
            </UIText>
            {success.consent_pending && (
              <View className="bg-optio-purple/5 border border-optio-purple/20 rounded-lg p-3 w-full">
                <UIText size="sm" className="text-typo-500 text-center">
                  Your parent/guardian hasn’t signed consent yet. You can start logging right away —
                  we’ll just need consent on file before your credit is issued.
                </UIText>
              </View>
            )}
            <Button size="lg" onPress={() => router.push('/(auth)/login' as any)} className="bg-optio-purple w-full">
              <ButtonText>Go to Login</ButtonText>
            </Button>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="items-center pb-12" showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View className="w-full bg-optio-purple px-6 py-10 items-center">
            <View className="max-w-2xl w-full">
              <UIText size="xs" className="text-white/80 uppercase">Pipe Organ Encounter · 2026</UIText>
              <Heading size="2xl" className="text-white mt-2">
                Earn fine arts credit for your Pipe Organ Encounter
              </Heading>
              <UIText className="text-white/90 mt-3">
                Document your week at camp in the Optio app and earn 0.5 fine arts credit — real,
                accredited, transcript-ready. Free for 2026. Opt-in.
              </UIText>
            </View>
          </View>

          <View className="max-w-2xl w-full px-6 pt-8">
            {/* What you get */}
            <Heading size="lg">What you get</Heading>
            <VStack space="sm" className="mt-3">
              {WHAT_YOU_GET.map((t) => (
                <HStack key={t} className="gap-3 items-start">
                  <Ionicons name="checkmark-circle" size={20} color="#6D469B" style={{ marginTop: 1 }} />
                  <UIText size="sm" className="flex-1 text-typo-500">{t}</UIText>
                </HStack>
              ))}
            </VStack>

            {/* How it works */}
            <Heading size="lg" className="mt-8">How it works</Heading>
            <VStack space="sm" className="mt-3">
              {HOW_IT_WORKS.map((t, i) => (
                <HStack key={t} className="gap-3 items-start">
                  <View className="w-6 h-6 rounded-full bg-optio-purple/10 items-center justify-center">
                    <UIText size="xs" className="text-optio-purple font-poppins-semibold">{i + 1}</UIText>
                  </View>
                  <UIText size="sm" className="flex-1 text-typo-500">{t}</UIText>
                </HStack>
              ))}
            </VStack>

            {/* Enroll */}
            <Heading size="lg" className="mt-8 mb-3">Enroll</Heading>

            {cohorts.length === 0 ? (
              <View className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <UIText size="sm" className="text-amber-800">
                  Enrollment isn’t open yet. Check back soon.
                </UIText>
              </View>
            ) : (
              <Card variant="elevated" size="lg" className="w-full">
                <VStack space="lg">
                  {/* POE location picker */}
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Which POE are you attending?</UIText>
                    <VStack space="sm" className="mt-1">
                      {cohorts.map((c) => {
                        const sel = c.slug === selectedSlug;
                        const dates = formatDateRange(c.start_date, c.end_date);
                        return (
                          <Pressable
                            key={c.slug}
                            onPress={() => setSelectedSlug(c.slug)}
                            className={`flex-row items-center justify-between rounded-lg border p-3 ${sel ? 'border-optio-purple bg-optio-purple/5' : 'border-outline-200'}`}
                          >
                            <View className="flex-1">
                              <UIText className={`font-poppins-medium ${sel ? 'text-optio-purple' : 'text-typo-600'}`}>
                                {c.display_name}
                              </UIText>
                              {dates && (
                                <UIText size="xs" className="text-typo-400">{dates}</UIText>
                              )}
                            </View>
                            <Ionicons
                              name={sel ? 'radio-button-on' : 'radio-button-off'}
                              size={20}
                              color={sel ? '#6D469B' : '#9CA3AF'}
                            />
                          </Pressable>
                        );
                      })}
                    </VStack>
                  </VStack>

                  <HStack className="gap-3">
                    <VStack space="xs" className="flex-1">
                      <UIText size="sm" className="font-poppins-medium">First name</UIText>
                      <Input variant="outline" size="lg">
                        <InputField placeholder="First name" value={firstName} onChangeText={setFirstName} />
                      </Input>
                    </VStack>
                    <VStack space="xs" className="flex-1">
                      <UIText size="sm" className="font-poppins-medium">Last name</UIText>
                      <Input variant="outline" size="lg">
                        <InputField placeholder="Last name" value={lastName} onChangeText={setLastName} />
                      </Input>
                    </VStack>
                  </HStack>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Your email</UIText>
                    <Input variant="outline" size="lg">
                      <InputField placeholder="you@example.com" value={email} onChangeText={setEmail}
                        autoCapitalize="none" keyboardType="email-address" />
                    </Input>
                  </VStack>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Choose a password</UIText>
                    <Input variant="outline" size="lg">
                      <InputField placeholder="6+ characters" value={password} onChangeText={setPassword} secureTextEntry />
                    </Input>
                  </VStack>

                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Date of birth</UIText>
                    <Input variant="outline" size="lg">
                      <InputField placeholder="YYYY-MM-DD" value={dob} onChangeText={setDob} keyboardType="numbers-and-punctuation" />
                    </Input>
                  </VStack>

                  {isMinor && (
                    <View className="bg-optio-purple/5 border border-optio-purple/20 rounded-lg p-4">
                      <VStack space="md">
                        <UIText className="font-poppins-semibold">Parent / guardian consent</UIText>
                        <UIText size="xs" className="text-typo-400">
                          Participants under 18 need a parent or guardian to consent. You can start logging at
                          camp right away; consent must be on file before credit is issued.
                        </UIText>
                        <HStack className="gap-3">
                          <VStack space="xs" className="flex-1">
                            <UIText size="sm" className="font-poppins-medium">Parent first name</UIText>
                            <Input variant="outline" size="lg">
                              <InputField placeholder="First name" value={parentFirst} onChangeText={setParentFirst} />
                            </Input>
                          </VStack>
                          <VStack space="xs" className="flex-1">
                            <UIText size="sm" className="font-poppins-medium">Parent last name</UIText>
                            <Input variant="outline" size="lg">
                              <InputField placeholder="Last name" value={parentLast} onChangeText={setParentLast} />
                            </Input>
                          </VStack>
                        </HStack>
                        <VStack space="xs">
                          <UIText size="sm" className="font-poppins-medium">Parent / guardian email</UIText>
                          <Input variant="outline" size="lg">
                            <InputField placeholder="parent@example.com" value={parentEmail} onChangeText={setParentEmail}
                              autoCapitalize="none" keyboardType="email-address" />
                          </Input>
                        </VStack>
                        <UIText size="xs" className="text-typo-500">{CONSENT_STATEMENT}</UIText>
                        <VStack space="xs">
                          <UIText size="sm" className="font-poppins-medium">Parent/guardian full name (e-signature)</UIText>
                          <Input variant="outline" size="lg">
                            <InputField placeholder="Type full name" value={signatureName} onChangeText={setSignatureName} />
                          </Input>
                        </VStack>
                        <Pressable onPress={() => setAgreed(!agreed)} className="flex-row items-start gap-3">
                          <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color="#6D469B" />
                          <UIText size="sm" className="flex-1 text-typo-500">
                            I am the parent/guardian and I agree to the statement above.
                          </UIText>
                        </Pressable>
                      </VStack>
                    </View>
                  )}

                  {error ? (
                    <View className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <UIText size="sm" className="text-red-700">{error}</UIText>
                    </View>
                  ) : null}

                  <Button size="lg" onPress={handleSubmit} isDisabled={submitting} className="bg-optio-purple">
                    <ButtonText>{submitting ? 'Enrolling…' : 'Enroll for free'}</ButtonText>
                  </Button>
                  <UIText size="xs" className="text-typo-400 text-center">
                    Enrollment is optional and free for 2026. Declining has no effect on your POE participation.
                  </UIText>
                </VStack>
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
