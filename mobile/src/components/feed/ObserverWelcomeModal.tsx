/**
 * ObserverWelcomeModal - the two-step first-visit intro for an observer,
 * re-openable from the Tips button on their feed. Lived inside
 * app/(app)/(tabs)/feed.tsx until 2026-09-15, when the feed screen was split
 * by role.
 */

import React, { useState, useEffect } from 'react';
import { View, Pressable, Image, ScrollView, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useObserverStudents } from '@/src/hooks/useObserverStudents';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText, Button, ButtonText } from '@/src/components/ui';

// Local PNG logo. The SVG logo URI does NOT render in React Native's <Image>
// (no SVG support), so the welcome modal showed blank space where the logo
// should be -- use the bundled app-icon PNG instead.
const OPTIO_LOGO = require('@/assets/images/icon.png');

// What an observer can actually DO — shown first (the functional orientation),
// as real labelled rows rather than decorative chips.
const OBSERVER_CAPABILITIES = [
  {
    icon: 'newspaper-outline' as const,
    color: '#3B82F6',
    bg: 'bg-blue-50',
    title: 'See their work',
    body: 'Everything they capture or complete shows up in your feed.',
  },
  {
    icon: 'chatbubble-outline' as const,
    color: '#EF597B',
    bg: 'bg-optio-pink/5',
    title: 'Cheer them on',
    body: 'Leave a comment on anything they share.',
  },
  {
    icon: 'trophy-outline' as const,
    color: '#6D469B',
    bg: 'bg-optio-purple/10',
    title: 'Set bounties',
    body: 'Post a challenge they can take on — you review it and grant the reward.',
  },
];

// Coaching prompts for step 2 — the encouragement style Optio is built around.
const OBSERVER_FEEDBACK_TIPS = [
  { color: '#6D469B', title: 'Celebrate effort', example: '"I love how you tried a new approach."' },
  { color: '#EF597B', title: 'Ask about the process', example: '"What was the most challenging part?"' },
  { color: '#3B82F6', title: 'Show genuine interest', example: '"Tell me more about this project."' },
  { color: '#10B981', title: 'Acknowledge growth', example: '"I can see how much you\'ve learned."' },
];

/**
 * Observer welcome — a two-step, skimmable intro shown on first observer login
 * (and re-openable via the "Tips" button in the feed header). Step 1 leads with
 * what an observer can DO; step 2 is how to give great feedback. A sticky footer
 * keeps the progress dots + primary action in view, and the hero is personalized
 * to the student(s) they're linked to.
 */
export function ObserverWelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  // Only fetch the linked students while the modal is actually open.
  const { students } = useObserverStudents(visible);
  const [step, setStep] = useState(0);

  // Restart at step 1 each time it opens (incl. re-open via the Tips button).
  useEffect(() => { if (visible) setStep(0); }, [visible]);

  if (!visible) return null;

  const names = students
    .map((s) => s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim())
    .filter(Boolean);
  const heroName =
    names.length === 0 ? null
      : names.length === 1 ? names[0]
        : `${names[0]} + ${names.length - 1} more`;
  const singleStudent = students.length === 1 ? students[0] : null;
  const singleName = singleStudent
    ? (singleStudent.first_name || singleStudent.display_name || 'their')
    : null;

  const finish = () => {
    onClose();
    // With exactly one linked student, drop straight into their activity.
    if (singleStudent) router.push(`/(app)/observers/student/${singleStudent.id}` as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{
          backgroundColor: c.card,
          borderRadius: 24,
          maxWidth: 480,
          width: '92%',
          maxHeight: '85%',
          overflow: 'hidden',
        }}>
          {/* Fixed hero */}
          <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12 }}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}
            >
              <View className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
                <Ionicons name="close" size={18} color={c.icon} />
              </View>
            </Pressable>
            <VStack space="sm" className="items-center">
              <Image source={OPTIO_LOGO} style={{ width: 64, height: 64, borderRadius: 16 }} resizeMode="cover" />
              <Heading size="2xl" className="text-center">
                {heroName ? `You're observing ${heroName}` : "You're an observer"}
              </Heading>
              <UIText size="md" className="text-typo-500 text-center leading-6 dark:text-dark-typo-500">
                Cheer them on and set challenges as they learn. Optio is about the process, not grades.
              </UIText>
            </VStack>
          </View>

          {/* Scrollable step body */}
          <ScrollView
            style={{ flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
          >
            {step === 0 ? (
              <VStack space="lg">
                <Heading size="lg">What you can do</Heading>
                {OBSERVER_CAPABILITIES.map((cap) => (
                  <HStack key={cap.title} className="items-start gap-3.5">
                    <View className={`w-12 h-12 rounded-full items-center justify-center ${cap.bg}`}>
                      <Ionicons name={cap.icon} size={24} color={cap.color} />
                    </View>
                    <VStack className="flex-1 min-w-0">
                      <UIText size="md" className="font-poppins-semibold">{cap.title}</UIText>
                      <UIText size="sm" className="text-typo-500 leading-6 dark:text-dark-typo-500">{cap.body}</UIText>
                    </VStack>
                  </HStack>
                ))}
              </VStack>
            ) : (
              <VStack space="lg">
                <VStack space="xs">
                  <Heading size="lg">Giving great feedback</Heading>
                  <UIText size="sm" className="text-typo-500 leading-6 dark:text-dark-typo-500">
                    A few words from you go a long way. Focus on the effort, not the outcome.
                  </UIText>
                </VStack>
                <VStack space="md">
                  {OBSERVER_FEEDBACK_TIPS.map((tip) => (
                    <HStack key={tip.title} className="items-start gap-3.5">
                      <View style={{ width: 4, backgroundColor: tip.color, borderRadius: 2, minHeight: 38, marginTop: 2 }} />
                      <VStack className="flex-1">
                        <UIText size="md" className="font-poppins-semibold">{tip.title}</UIText>
                        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">{tip.example}</UIText>
                      </VStack>
                    </HStack>
                  ))}
                </VStack>
              </VStack>
            )}
          </ScrollView>

          {/* Sticky footer: progress dots + actions (always in view) */}
          <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, borderTopWidth: 1, borderTopColor: c.border }}>
            <HStack className="items-center justify-center gap-1.5 mb-3">
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === step ? c.brand : c.border,
                  }}
                />
              ))}
            </HStack>
            {step === 0 ? (
              <Button size="lg" onPress={() => setStep(1)} className="w-full">
                <ButtonText>Next</ButtonText>
              </Button>
            ) : (
              <HStack className="gap-3">
                <Button size="lg" variant="outline" onPress={() => setStep(0)} className="flex-1">
                  <ButtonText>Back</ButtonText>
                </Button>
                <Button size="lg" onPress={finish} className="flex-1">
                  <ButtonText>{singleName ? `View ${singleName}'s work` : 'Get started'}</ButtonText>
                </Button>
              </HStack>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
