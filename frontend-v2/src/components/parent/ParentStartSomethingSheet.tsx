/**
 * ParentStartSomethingSheet - Bottom sheet listing the ways a parent can
 * add new work / take primary parent actions:
 *   1. Post a bounty (routes to /bounties/create)
 *   2. Capture a moment (opens CaptureSheet via parent capture flow)
 *   3. Invite an observer (opens InviteObserverSheet)
 *   4. Add a kid (opens AddKidSheet)
 *
 * The parent owns the visibility state of this sheet via the shared store
 * (`useParentStartSomethingStore`). Each row picks an action — the parent
 * is responsible for unmounting this sheet before opening the next one
 * (Modal stacking issue on iOS — same pattern as the student sheet).
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  VStack, HStack, UIText, Heading, BottomSheet,
} from '../ui';

interface ParentStartSomethingSheetProps {
  visible: boolean;
  onClose: () => void;
  onCaptureMoment: () => void;
  onInviteObserver: () => void;
  onAddKid: () => void;
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

function Row({ icon, iconColor, iconBg, title, subtitle, onPress, testID }: RowProps) {
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
          <UIText size="xs" className="text-typo-500">{subtitle}</UIText>
        </VStack>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </HStack>
    </Pressable>
  );
}

const SHEET_CLOSE_MS = 280;
function chainAfterClose(close: () => void, then: () => void) {
  return () => {
    close();
    setTimeout(then, SHEET_CLOSE_MS);
  };
}

export function ParentStartSomethingSheet({
  visible,
  onClose,
  onCaptureMoment,
  onInviteObserver,
  onAddKid,
}: ParentStartSomethingSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <Heading size="lg">What do you want to do?</Heading>
          <Pressable
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color="#6B7280" />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-500">
          Pick what you want to do next.
        </UIText>

        <VStack className="mt-1">
          <Row
            testID="parent-action-post-bounty"
            icon="trophy-outline"
            iconColor="#0F766E"
            iconBg="#0F766E1A"
            title="Post a bounty"
            subtitle="Challenge your kid with a real-world task and reward"
            onPress={() => {
              // Plain route — doesn't open a Modal, so safe to fire alongside close.
              onClose();
              router.push('/bounties/create');
            }}
          />
          <Row
            testID="parent-action-capture-moment"
            icon="camera-outline"
            iconColor="#6D469B"
            iconBg="#6D469B1A"
            title="Capture a moment"
            subtitle="Log what your kid is doing in real life"
            onPress={chainAfterClose(onClose, onCaptureMoment)}
          />
          <Row
            testID="parent-action-invite-observer"
            icon="people-outline"
            iconColor="#A21CAF"
            iconBg="#A21CAF1A"
            title="Manage observers"
            subtitle="Share your family link with grandparents, mentors, friends"
            onPress={chainAfterClose(onClose, onInviteObserver)}
          />
          <Row
            testID="parent-action-add-kid"
            icon="person-add-outline"
            iconColor="#DB2777"
            iconBg="#DB27771A"
            title="Add a kid"
            subtitle="Create a profile for another child"
            onPress={chainAfterClose(onClose, onAddKid)}
          />
        </VStack>
      </VStack>
    </BottomSheet>
  );
}
