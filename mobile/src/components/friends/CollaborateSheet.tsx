/**
 * CollaborateSheet - invite a friend to do a quest alongside you.
 *
 * Two doors, one sheet. From a friend's page the friend is fixed and the
 * student picks one of their own quests in progress; from a quest the quest
 * is fixed and the student picks a friend. Either way the server sends one
 * notification with the quest a tap away, and the two pages show "You are
 * both on this" once the friend starts it. Each student does their own
 * tasks and earns their own XP -- the invite is the whole feature, on
 * purpose (2026-09-16). Mirrors web/src/components/connections/
 * CollaborateModal.jsx.
 */

import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, Button, ButtonText, HStack, Heading, UIText, VStack, toast } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { collaborate, type PeerProfile } from '@/src/hooks/useFriends';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';

interface QuestOption { id: string; title: string; shared?: boolean }
interface FriendOption extends PeerProfile { on_quest?: boolean }

interface Props {
  visible: boolean;
  onClose: () => void;
  /** From a friend's page: the friend, and the student's own quests in progress. */
  friend?: PeerProfile | null;
  quests?: QuestOption[];
  /** From a quest: the quest, and the student's friends (`on_quest` marks those already on it). */
  quest?: { id: string; title: string } | null;
  friendList?: FriendOption[];
}

export function CollaborateSheet({ visible, onClose, friend, quests = [], quest, friendList = [] }: Props) {
  const c = useThemeColors();
  const [sending, setSending] = useState<string | null>(null);
  const pickingQuest = !!friend;

  const invite = async (optionId: string, who: string, already: boolean) => {
    const peerId = pickingQuest ? friend!.id : optionId;
    const questId = pickingQuest ? optionId : quest!.id;
    setSending(optionId);
    try {
      const out = await collaborate(peerId, questId);
      toast.success(out?.already_on_quest || already ? `${who} is on it too. They have been told.` : `Invited ${who}.`);
      onClose();
    } catch (err) {
      showAlert('Could not send that invite', extractApiError(err).message);
    } finally {
      setSending(null);
    }
  };

  const rows: { id: string; label: string; already: boolean; who: string }[] = pickingQuest
    ? quests.map((q) => ({ id: q.id, label: q.title, already: !!q.shared, who: friend!.display_name }))
    : friendList.map((f) => ({ id: f.id, label: f.display_name, already: !!f.on_quest, who: f.display_name }));

  const title = pickingQuest ? `Collaborate with ${friend!.display_name}` : `Collaborate on ${quest?.title || 'this quest'}`;
  const lead = pickingQuest
    ? `Pick one of your quests. ${friend!.display_name} gets an invite with the quest one tap away.`
    : 'Pick a friend. They get an invite with this quest one tap away.';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <VStack space="md" testID="collaborate-sheet">
        <HStack className="items-center justify-between">
          <Heading size="lg">{title}</Heading>
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
        <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700">{lead}</UIText>
        {rows.length === 0 ? (
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
            {pickingQuest ? 'Start a quest first, then invite a friend to it.' : 'No friends yet. Add one from the Friends screen.'}
          </UIText>
        ) : (
          <VStack space="sm">
            {rows.map((r) => (
              <HStack key={r.id} className="items-center justify-between gap-3 py-1">
                <VStack className="flex-1 min-w-0">
                  <UIText size="sm" className="text-typo dark:text-dark-typo" numberOfLines={1}>{r.label}</UIText>
                  {r.already && (
                    <UIText size="xs" className="text-optio-purple dark:text-optio-purple-light">Already on this quest</UIText>
                  )}
                </VStack>
                <Button
                  size="sm"
                  variant={r.already ? 'outline' : 'solid'}
                  onPress={() => invite(r.id, r.who, r.already)}
                  disabled={sending !== null}
                  loading={sending === r.id}
                  testID={`collaborate-${r.id}`}
                >
                  <ButtonText>{r.already ? 'Nudge' : 'Invite'}</ButtonText>
                </Button>
              </HStack>
            ))}
          </VStack>
        )}
      </VStack>
    </BottomSheet>
  );
}
