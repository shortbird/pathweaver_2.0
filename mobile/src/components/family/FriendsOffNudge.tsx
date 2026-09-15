/**
 * FriendsOffNudge - "Friends is off for Jane. Turn it on."
 *
 * Three phases of Friends shipped with the switch off for every child and
 * the setting a few taps deep. This is the one line on the child's Family
 * card that brings the switch to the parent: one tap turns it on under the
 * default rules, and "Read the rules first" opens the Friends screen for a
 * parent who wants to see them. Renders nothing once Friends is on, when
 * this adult may not set it, or when the school has the module off.
 */

import React from 'react';
import { Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UIText, HStack, VStack, Button, ButtonText, toast } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useFriendPolicy } from '@/src/hooks/useFriendPolicy';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';

interface Props {
  childId: string;
  childFirstName: string;
  /** Where "Read the rules first" goes. Defaults to the child's Friends screen. */
  onOpenSettings?: () => void;
}

export function FriendsOffNudge({ childId, childFirstName, onOpenSettings }: Props) {
  const c = useThemeColors();
  const { policy, canSet, saving, save } = useFriendPolicy(childId);
  if (!policy || policy.enabled || !canSet || policy.origin === 'module_off') return null;

  const openSettings = onOpenSettings
    ?? (() => router.push(`/(app)/parent/friends/${childId}` as Href));

  const turnOn = async () => {
    try {
      await save({ enabled: true });
      toast.success(`Friends is on for ${childFirstName}.`);
    } catch (err) {
      showAlert('Could not turn Friends on', extractApiError(err).message);
    }
  };

  return (
    <VStack space="xs" className="mt-3 rounded-lg border border-dashed border-surface-300 dark:border-dark-surface-300 p-3" testID={`friends-off-nudge-${childId}`}>
      <HStack className="items-center gap-2">
        <Ionicons name="people-outline" size={14} color={c.iconMuted} />
        <UIText size="xs" className="flex-1 text-typo-500 dark:text-dark-typo-500">
          Friends is off for {childFirstName}. Friends see each other's work and encourage it. You choose the rules and can turn it off any time.
        </UIText>
      </HStack>
      <HStack className="items-center gap-3">
        <Button size="sm" onPress={turnOn} disabled={saving} testID={`friends-turn-on-${childId}`}>
          <ButtonText>Turn on Friends</ButtonText>
        </Button>
        <Pressable onPress={openSettings} hitSlop={6} accessibilityRole="button" accessibilityLabel="Read the Friends rules first">
          <UIText size="xs" className="text-optio-purple dark:text-optio-purple-light font-poppins-medium">Read the rules first</UIText>
        </Pressable>
      </HStack>
    </VStack>
  );
}
