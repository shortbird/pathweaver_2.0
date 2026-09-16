/**
 * FriendsExplainerSheet - what Friends is, and the switch.
 *
 * The nudge on the child's Family card turned Friends on with one tap,
 * before the parent had read anything, and "Read the rules first" beside
 * it opened a settings screen that reads nothing like an explanation
 * (owner, 2026-09-16). This is the explanation: what a friend sees, how one
 * is added, what they can do, what the parent sees, and how to end it, then
 * the switch, at the bottom, after all of that. Turning Friends on is the
 * parent's consent, so the text is the commitment the privacy policy
 * makes, in the parent's words. Mirrors web/src/components/parent/
 * FriendsExplainerModal.jsx; keep the two in step.
 */

import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Button, ButtonText, HStack, Heading, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { FriendPolicy } from '@/src/hooks/useFriendPolicy';

interface Props {
  childId: string;
  childFirstName: string;
  visible: boolean;
  onClose: () => void;
  /** The policy is the caller's (useFriendPolicy keeps local state, so the
   *  sheet reads the caller's copy rather than fetching a second one that
   *  the caller would never see change). */
  policy: FriendPolicy | null;
  canSet: boolean;
  saving: boolean;
  /** The switch. The caller writes it and closes the sheet on success. */
  onTurnOn: () => void;
  /** Opens the child's Friends screen. Offered when Friends is already on. */
  onOpenSettings?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <VStack space="xs">
      <UIText size="sm" className="font-poppins-semibold text-typo dark:text-dark-typo">{title}</UIText>
      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">{children}</UIText>
    </VStack>
  );
}

export function FriendsExplainerSheet({
  childId, childFirstName: name, visible, onClose, policy, canSet, saving, onTurnOn, onOpenSettings,
}: Props) {
  const c = useThemeColors();
  const alreadyOn = !!policy?.enabled;
  const canTurnOn = !!policy && !alreadyOn && canSet && policy.origin !== 'module_off';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <VStack space="md" testID={`friends-explainer-${childId}`}>
        <HStack className="items-center justify-between">
          <Heading size="lg">How Friends works</Heading>
          <Pressable
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700">
          Friends lets {name} connect with other students on Optio. Friends see each other's work and encourage it.
        </UIText>

        <Section title="What a friend sees">
          {name}'s display name, picture, and the work they share. Never an email address, last name, date of birth, or school.
        </Section>
        <Section title="How a friend is added">
          Through a classmate, a code shown in person, or an invite link. Both students have to say yes.
          You choose who may ask, and you can ask to approve each friend yourself first.
          You can also connect {name} with a friend from their Friends screen.
        </Section>
        <Section title="What a friend can do">
          See {name}'s work, react to it, leave a short comment, and send {name} a message. You can turn commenting or messaging off.
        </Section>
        <Section title="Safety check">
          Everything students write to each other passes a safety check before it is shown. Anything it holds is sent to you.
        </Section>
        <Section title="What you see">
          A notification each time a friend is added, and every comment and reaction on {name}'s Friends screen.
          You can hide a comment, remove a friend, or block one.
        </Section>
        <Section title="Turning it off">
          Any time, from {name}'s Friends screen. Turning Friends off removes every friend {name} has.
        </Section>

        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
          {alreadyOn
            ? `Friends is on for ${name}.`
            : `Turning Friends on is your consent to share ${name}'s work with the friends they make.`}
        </UIText>

        <HStack space="sm" className="justify-end">
          <Button size="md" variant="outline" onPress={onClose} disabled={saving} testID={`friends-explainer-close-${childId}`}>
            <ButtonText>{canTurnOn ? 'Not now' : 'Close'}</ButtonText>
          </Button>
          {canTurnOn && (
            <Button size="md" onPress={onTurnOn} disabled={saving} loading={saving} testID={`friends-explainer-turn-on-${childId}`}>
              <ButtonText>Turn on Friends</ButtonText>
            </Button>
          )}
          {alreadyOn && onOpenSettings && (
            <Button size="md" onPress={() => { onClose(); onOpenSettings(); }} testID={`friends-explainer-settings-${childId}`}>
              <ButtonText>Friends settings</ButtonText>
            </Button>
          )}
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
