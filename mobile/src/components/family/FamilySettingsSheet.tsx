/**
 * FamilySettingsSheet - ONE place for the family's settings on the phone.
 *
 * The parent's own account, adding a child, inviting an observer, and each
 * child's Friends. Until 2026-09-15 these were spread over a menu behind a
 * three-dot button on the one child showing, the header's avatar menu, and
 * the plus button's sheet; the web dashboard put them in one Family Settings
 * modal with a tab per child, and this is that sheet.
 *
 * Each child's Friends policy (on/off, ask me first, who may ask, what
 * friends may do) is the child's Friends screen (parent/friends/<id>),
 * reached from here the way the web reaches it from the child's settings
 * tab. A request waiting on the parent shows its count on the row.
 *
 * Trimmed 2026-09-18: a child's picture is set by tapping it on their card
 * or profile (ChildAvatar), their profile opens from their dashboard, and
 * "login, AI and privacy" was a door to the web settings modal; the three
 * rows repeated what the app already offers, or left it. (That last row had
 * itself replaced "Give login access", which created the account here with
 * a hardcoded password.) The web's FamilySettingsModal still carries the
 * login, AI and privacy settings.
 *
 * "Add a child" is hidden for a family in an SIS school: the office owns the
 * roster there, and a child added from the app lands outside the household
 * that registration, billing and class chats are built on.
 *
 * Opening another sheet from here (Add a kid, Invite an observer) waits for
 * this one to finish closing -- on iOS a second Modal will not present
 * until the first is gone (the same pending pattern as ui/action-sheet).
 */

import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar, AvatarFallbackText, AvatarImage, BottomSheet, Divider, HStack, Heading, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useAuthStore } from '@/src/stores/authStore';
import { useAddKidStore } from '@/src/stores/familyStore';
import { useInviteObserverStore } from '@/src/stores/inviteObserverStore';
import type { Child } from '@/src/types/family';
import { userInSisOrg } from '@/src/utils/orgModules';
import { initialsFor, nameFor } from './ChildSwitcher';

function Row({ icon, label, onPress, testID, badge }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string;
  /** A count waiting on the parent, shown as a pill. */
  badge?: number;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} waiting for you` : label}
      className="flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <Ionicons name={icon} size={18} color={c.brand} />
      <UIText size="sm" className="flex-1 font-poppins-medium">{label}</UIText>
      {badge ? (
        <UIText size="xs" className="rounded-full bg-optio-pink px-1.5 text-white font-poppins-bold" style={{ fontSize: 10, lineHeight: 16 }}>
          {badge}
        </UIText>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
    </Pressable>
  );
}

export function FamilySettingsSheet({ visible, onClose, kids, pendingFriendRequests }: {
  visible: boolean;
  onClose: () => void;
  kids: Child[];
  /** {childId: number of friend requests waiting on the parent}. */
  pendingFriendRequests?: Record<string, number>;
}) {
  const c = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const canAddChild = !userInSisOrg(user);
  const pendingRef = useRef<(() => void) | null>(null);
  const after = (fn: () => void) => { pendingRef.current = fn; onClose(); };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => { const fn = pendingRef.current; pendingRef.current = null; fn?.(); }}
    >
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <Heading size="lg">Family settings</Heading>
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

        <Row icon="person-outline" label="Your account" onPress={() => after(() => router.push('/(app)/settings' as any))} />
        {canAddChild && (
          <Row icon="person-add-outline" label="Add a child" testID="family-settings-add-child" onPress={() => after(() => useAddKidStore.getState().open())} />
        )}
        <Row icon="eye-outline" label="Invite an observer" onPress={() => after(() => useInviteObserverStore.getState().open())} />

        {kids.map((kid) => {
          const first = kid.first_name || nameFor(kid).split(' ')[0];
          return (
            <View key={kid.id} testID={`family-settings-child-${kid.id}`}>
              <Divider className="my-2" />
              <HStack className="items-center gap-3 py-1">
                <Avatar size="md">
                  {kid.avatar_url ? (
                    <AvatarImage source={{ uri: kid.avatar_url }} />
                  ) : (
                    <AvatarFallbackText>{initialsFor(kid)}</AvatarFallbackText>
                  )}
                </Avatar>
                <VStack className="flex-1 min-w-0">
                  <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>{nameFor(kid)}</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    {kid.is_dependent ? 'Managed profile' : 'Has their own login'}
                  </UIText>
                </VStack>
              </HStack>
              <Row
                icon="people-outline"
                label={`${first}'s friends`}
                testID={`family-settings-friends-${kid.id}`}
                badge={pendingFriendRequests?.[kid.id]}
                onPress={() => after(() => router.push(`/(app)/parent/friends/${kid.id}` as any))}
              />
            </View>
          );
        })}
      </VStack>
    </BottomSheet>
  );
}
