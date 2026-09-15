/**
 * ParentWelcomeModal - the first-visit intro for a parent's feed, re-openable
 * from the Tips button. Lived inside app/(app)/(tabs)/feed.tsx until
 * 2026-09-15, when the feed screen was split by role.
 */

import React from 'react';
import { View, Pressable, Image, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText, Button, ButtonText, Divider } from '@/src/components/ui';

const OPTIO_ICON_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

export function ParentWelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: c.card, borderRadius: 24, maxWidth: 480, width: '92%', maxHeight: '85%' }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
            <VStack space="lg">
              <Pressable
                onPress={onClose}
                style={{ position: 'absolute', right: 0, top: 0, zIndex: 10, padding: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <View className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
                  <Ionicons name="close" size={18} color={c.icon} />
                </View>
              </Pressable>

              <VStack space="sm" className="items-center pt-2">
                <Image source={{ uri: OPTIO_ICON_URI }} style={{ width: 48, height: 48 }} resizeMode="contain" />
                <Heading size="xl" className="text-center">Welcome to Optio!</Heading>
                <UIText size="sm" className="text-typo-500 text-center dark:text-dark-typo-500">
                  Here's how you can support your kid's learning journey.
                </UIText>
              </VStack>

              <VStack space="xs">
                <Heading size="md">The Process Is The Goal</Heading>
                <UIText size="sm" className="text-typo-500 leading-5 dark:text-dark-typo-500">
                  We celebrate curiosity, effort, and growth — not grades or test scores.
                  Your kid learns by doing self-directed quests that build real-world skills.
                </UIText>
              </VStack>

              <Divider />

              <VStack space="xs">
                <Heading size="md">What you can do as a parent</Heading>
                <VStack space="sm" className="mt-1">
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: c.brand, borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Capture moments</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Tap the center button to log what your kid is doing in real life.</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: c.brandPink, borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Post bounties</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Challenge your kid with a real-world task and a reward.</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#3B82F6', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Invite observers</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Bring grandparents, mentors, or family friends along for the ride.</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#10B981', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Celebrate effort, not outcomes</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Ask "what did you try?" instead of "did you finish?"</UIText>
                    </VStack>
                  </HStack>
                </VStack>
              </VStack>

              <Button size="lg" onPress={onClose} className="w-full mt-2">
                <ButtonText>Got it</ButtonText>
              </Button>
            </VStack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
