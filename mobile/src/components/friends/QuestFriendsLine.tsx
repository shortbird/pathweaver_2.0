/**
 * QuestFriendsLine - the friends on this quest, and the door to inviting one.
 *
 * "Sam is on this too" with Message beside it, for a student whose friend is
 * doing the same quest; and Collaborate, which invites a friend to it.
 * Students on their own quest only: a parent in family scope is on the
 * child's copy, and the invite is the child's to send. Renders nothing for a
 * student with no friends, so the screen is unchanged for the many who have
 * none yet. Both reads fail quietly. Mirrors web/src/components/quest/
 * QuestFriendsCard.jsx.
 */

import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, VStack, UIText, Button, ButtonText, Avatar, AvatarFallbackText, AvatarImage } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useFriends, friendsOnQuest, messagesRouteFor, type FriendOnQuest, type PeerProfile } from '@/src/hooks/useFriends';
import { CollaborateSheet } from './CollaborateSheet';

interface Props {
  quest: { id: string; title: string };
  isEnrolled: boolean;
  /** True for a parent in family scope, whose child sends their own invites. */
  hidden?: boolean;
}

export function QuestFriendsLine({ quest, isEnrolled, hidden = false }: Props) {
  const c = useThemeColors();
  const { connections } = useFriends();
  const [onQuest, setOnQuest] = useState<FriendOnQuest[] | null>(null);
  const [collaborating, setCollaborating] = useState(false);

  useEffect(() => {
    if (hidden || !quest.id) return undefined;
    let cancelled = false;
    friendsOnQuest(quest.id)
      .then((rows) => { if (!cancelled) setOnQuest(rows); })
      .catch(() => { if (!cancelled) setOnQuest([]); });
    return () => { cancelled = true; };
  }, [quest.id, hidden]);

  const allFriends: (PeerProfile & { on_quest: boolean })[] = (connections.active || []).map((conn) => ({
    ...conn.peer,
    on_quest: !!onQuest?.some((f) => f.id === conn.peer.id),
  }));

  if (hidden || onQuest === null || allFriends.length === 0) return null;

  return (
    <Card variant="outline" size="md" testID="quest-friends-line">
      <HStack className="items-center gap-3">
        <Ionicons name="people-outline" size={18} color={c.brand} />
        <VStack className="flex-1 min-w-0" space="xs">
          {onQuest.length === 0 ? (
            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Doing this with a friend? Invite them.</UIText>
          ) : onQuest.map((f) => (
            <HStack key={f.id} className="items-center gap-2 flex-wrap">
              <Pressable
                onPress={() => router.push(`/(app)/friends/${f.id}` as Href)}
                accessibilityRole="button"
                accessibilityLabel={f.display_name}
                className="flex-row items-center gap-2"
              >
                <Avatar size="xs">
                  {f.avatar_url ? <AvatarImage source={{ uri: f.avatar_url }} /> : <AvatarFallbackText>{(f.display_name[0] || '?').toUpperCase()}</AvatarFallbackText>}
                </Avatar>
                <UIText size="sm" className="font-poppins-medium text-typo dark:text-dark-typo">{f.display_name}</UIText>
              </Pressable>
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">is on this too</UIText>
              {f.can_message && (
                <Pressable onPress={() => router.push(messagesRouteFor(f.id) as Href)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Message ${f.display_name}`}>
                  <UIText size="sm" className="text-optio-purple dark:text-optio-purple-light font-poppins-medium">Message</UIText>
                </Pressable>
              )}
            </HStack>
          ))}
        </VStack>
        {isEnrolled && (
          <Button size="xs" variant="outline" onPress={() => setCollaborating(true)} testID="quest-collaborate-button">
            <ButtonText>Collaborate</ButtonText>
          </Button>
        )}
      </HStack>
      <CollaborateSheet
        visible={collaborating}
        onClose={() => setCollaborating(false)}
        quest={quest}
        friendList={allFriends}
      />
    </Card>
  );
}
