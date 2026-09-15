/**
 * FamilySettingsSheet - ONE place for the family's settings on the phone.
 *
 * Adding a child, each child's picture, their profile, and inviting an
 * observer. Until 2026-09-15 these were spread over a menu behind a
 * three-dot button on the one child showing, the header's avatar menu, and
 * the plus button's sheet; the web dashboard put them in one Family Settings
 * modal with a tab per child, and this is that sheet. The cards on the
 * Family tab carry only Open.
 *
 * A child's login, AI access and portfolio privacy are web settings
 * (FamilySettingsModal -> ChildSettingsPanel). The phone used to offer
 * "Give login access" here and create the account with a hardcoded
 * password (and, off iOS, a made-up email); that row now opens the web
 * settings for that child instead.
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
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import { userInSisOrg } from '@/src/utils/orgModules';
import { pickChildAvatar } from './ChildAvatar';
import { initialsFor, nameFor } from './ChildSwitcher';

/** The web Family Settings modal, opened on this child's tab. */
function openWebSettings(child: Child) {
  router.push({
    pathname: '/(app)/view-on-web',
    params: { path: `/family?settings=${child.id}`, label: 'Login, AI and privacy settings', surface: 'learning' },
  } as any);
}

async function changePicture(child: Child) {
  try {
    await pickChildAvatar(child.id);
  } catch (err) {
    showAlert('Error', extractApiError(err, 'Could not update the picture.').message);
  }
}

function Row({ icon, label, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <Ionicons name={icon} size={18} color={c.brand} />
      <UIText size="sm" className="flex-1 font-poppins-medium">{label}</UIText>
      <Ionicons name="chevron-forward" size={16} color={c.iconMuted} />
    </Pressable>
  );
}

export function FamilySettingsSheet({ visible, onClose, kids }: { visible: boolean; onClose: () => void; kids: Child[] }) {
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
              {/* The picker runs after the sheet has closed (see pickChildAvatar). */}
              <Row icon="image-outline" label={`Change ${first}'s picture`} onPress={() => after(() => changePicture(kid))} />
              <Row icon="person-circle-outline" label={`${first}'s profile`} onPress={() => after(() => router.push(`/parent/child/${kid.id}` as any))} />
              <Row
                icon="key-outline"
                label={`${first}'s login, AI and privacy`}
                testID={`family-settings-web-${kid.id}`}
                onPress={() => after(() => openWebSettings(kid))}
              />
            </View>
          );
        })}
      </VStack>
    </BottomSheet>
  );
}
