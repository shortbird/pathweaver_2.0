/**
 * StartSomethingSheet - Bottom sheet listing the ways a student can add
 * new work to their "What you're working on" list:
 *   1. Browse quests (route to catalog — quest creation now lives on that page)
 *   2. Start a class (opens CreateClassSheet, gated to 13+ via parent)
 *
 * The Start-a-class row is only rendered when `canStartClass` is true.
 * The parent owns the visibility state of this sheet plus the two action
 * sheets it can chain to — this component just signals which action the
 * student picked.
 */

import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  VStack, HStack, UIText, Heading, BottomSheet,
} from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

interface StartSomethingSheetProps {
  visible: boolean;
  onClose: () => void;
  canStartClass: boolean;
  /** Open the parent-owned CaptureSheet. Parent should hide this sheet first. */
  onCaptureMoment: () => void;
  /** Open the existing CreateClassSheet. Parent should hide this sheet first. */
  onStartClass: () => void;
}

interface RowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}

/**
 * Chain a sheet-close with a follow-up action that opens another Modal-based
 * sheet. iOS RN crashes the UI if a new Modal mounts while another Modal is
 * still in its close animation, so we defer the next-sheet open until after
 * the current sheet's BottomSheet close animation (~250ms) has finished.
 */
function Row({ icon, iconColor, iconBg, title, subtitle, onPress, testID }: RowProps) {
  const c = useThemeColors();
  return (
    <Pressable testID={testID} onPress={onPress} className="active:opacity-70">
      <HStack className="items-center gap-3 py-3">
        <View
          style={{ backgroundColor: iconBg }}
          className="w-11 h-11 rounded-full items-center justify-center"
        >
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <VStack className="flex-1 min-w-0">
          <UIText size="md" className="font-poppins-semibold">{title}</UIText>
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">{subtitle}</UIText>
        </VStack>
        <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
      </HStack>
    </Pressable>
  );
}

export function StartSomethingSheet({
  visible,
  onClose,
  canStartClass,
  onCaptureMoment,
  onStartClass,
}: StartSomethingSheetProps) {
  const c = useThemeColors();
  // Run the chosen Modal-opening action only after this sheet has fully
  // unmounted, so the next sheet presents on the first tap (iOS Modal-over-Modal
  // race — the "tap twice" bug).
  const pendingRef = useRef<null | (() => void)>(null);
  const closeThen = (then: () => void) => () => {
    pendingRef.current = then;
    onClose();
  };
  const runPending = () => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    fn?.();
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={runPending}>
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <Heading size="lg">Start something new</Heading>
          <Pressable
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
          Pick what you want to do next.
        </UIText>

        <VStack className="mt-1">
          <Row
            testID="start-something-capture-moment"
            icon="camera-outline"
            iconColor="#6D469B"
            iconBg="#6D469B1A"
            title="Capture a moment"
            subtitle="Snap a photo, record audio, or note what you're working on"
            onPress={closeThen(onCaptureMoment)}
          />
          <Row
            testID="start-something-browse-quests"
            icon="compass-outline"
            iconColor="#6D469B"
            iconBg="#6D469B1A"
            title="Browse quests"
            subtitle="Find a quest from the Optio catalog"
            onPress={() => {
              // Route doesn't open a Modal, so close + push can fire together.
              onClose();
              router.push('/(app)/(tabs)/quests');
            }}
          />
          <Row
            testID="start-something-earn-bounty"
            icon="trophy-outline"
            iconColor="#0F766E"
            iconBg="#0F766E1A"
            title="Earn a bounty"
            subtitle="Start a posted task for XP"
            onPress={() => {
              onClose();
              router.push('/(app)/(tabs)/bounties');
            }}
          />
          {canStartClass && (
            <Row
              testID="start-something-start-class"
              icon="school-outline"
              iconColor="#DB2777"
              iconBg="#DB27771A"
              title="Start a class"
              subtitle="Earn high school credit for a passion project"
              onPress={closeThen(onStartClass)}
            />
          )}
        </VStack>
      </VStack>
    </BottomSheet>
  );
}
