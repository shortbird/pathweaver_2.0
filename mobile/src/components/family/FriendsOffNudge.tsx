/**
 * FriendsOffNudge - "Friends is off for Jane. Turn it on."
 *
 * Three phases of Friends shipped with the switch off for every child and
 * the setting a few taps deep. This is the one line on the child's Family
 * card that brings the switch to the parent. The button opens
 * FriendsExplainerSheet (what Friends is, then the switch) rather than
 * flipping it on the spot: the first version did, with a "Read the rules
 * first" link beside it, and a parent who wanted to know what they were
 * agreeing to was sent to a settings screen instead (owner, 2026-09-16).
 * Renders nothing once Friends is on, when this adult may not set it, or
 * when the school has the module off.
 */

import React, { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UIText, HStack, VStack, Button, ButtonText, toast } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useFriendPolicy } from '@/src/hooks/useFriendPolicy';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import { FriendsExplainerSheet } from './FriendsExplainerSheet';

interface Props {
  childId: string;
  childFirstName: string;
  /** Where "Friends settings" goes. Defaults to the child's Friends screen. */
  onOpenSettings?: () => void;
}

export function FriendsOffNudge({ childId, childFirstName, onOpenSettings }: Props) {
  const c = useThemeColors();
  const [explaining, setExplaining] = useState(false);
  const { policy, canSet, saving, save } = useFriendPolicy(childId);
  if (!policy || policy.enabled || !canSet || policy.origin === 'module_off') return null;

  const openSettings = onOpenSettings
    ?? (() => router.push(`/(app)/parent/friends/${childId}` as Href));

  const turnOn = async () => {
    try {
      await save({ enabled: true });
      setExplaining(false);
      toast.success(`Friends is on for ${childFirstName}. You can change the rules on their Friends screen.`);
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
      <HStack className="items-center">
        <Button size="sm" onPress={() => setExplaining(true)} disabled={saving} testID={`friends-turn-on-${childId}`}>
          <ButtonText>Turn on Friends</ButtonText>
        </Button>
      </HStack>
      <FriendsExplainerSheet
        childId={childId}
        childFirstName={childFirstName}
        visible={explaining}
        onClose={() => setExplaining(false)}
        policy={policy}
        canSet={canSet}
        saving={saving}
        onTurnOn={turnOn}
        onOpenSettings={openSettings}
      />
    </VStack>
  );
}
