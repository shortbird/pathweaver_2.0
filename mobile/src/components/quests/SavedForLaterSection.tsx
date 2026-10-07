/**
 * SavedForLaterSection - the quests a student set aside with "Save for later".
 *
 * Ticket e17134c6 (2026-10-07) replaced the quest page's "End quest" with
 * "Save for later" (POST /api/quests/:id/archive: the enrollment goes inactive
 * with archived_at set, work and XP kept) and "Mark done". The web dashboard
 * lists saved quests under "Saved for Later" with a Resume button; mobile had
 * no such list, so a quest saved for later on the phone could only come back
 * by finding it again and pressing Start. This is the mobile list.
 *
 * Reads the same rows the web dashboard does: `archived_quests` on
 * GET /api/users/dashboard (dashboard_service.get_archived_quests). Resume is
 * the same POST /api/quests/:id/unarchive. In a parent's family scope both
 * name the child: the dashboard read already carries ?student_id=, and Resume
 * sends student_id in the body (the backend's @student_scope).
 *
 * Each row also has Remove, the list's "I'm done with it": POST /archive
 * with reason 'lost_interest', which hides the quest everywhere while the
 * work and XP stay in the portfolio.
 *
 * The rows are whatever the backend calls Saved for Later (every paused,
 * unfinished enrollment except the ones marked done-with), so nothing is
 * filtered here.
 *
 * Renders nothing when the list is empty.
 */

import React, { useState } from 'react';
import { View, Image, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { showAlert, confirmAlert } from '@/src/utils/alerts';
import { archiveBody } from '@/src/components/quests/questExit';
import { toast } from '@/src/stores/toastStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { ArchivedQuest } from '@/src/hooks/useDashboard';
import { VStack, HStack, Heading, UIText, Card, Button, ButtonText } from '@/src/components/ui';


interface Props {
  quests: ArchivedQuest[] | null | undefined;
  /** Family scope: the child whose quests these are. Null for the student. */
  studentId?: string | null;
  /** Called after a Resume or Remove succeeds, so the lists reload: a resumed
   *  quest moves back to the active list, a removed one leaves this one. */
  onChanged?: () => void | Promise<void>;
}

export function SavedForLaterSection({ quests, studentId = null, onChanged }: Props) {
  const c = useThemeColors();
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = (quests || []).filter((r) => r?.quest_id);

  if (rows.length === 0) return null;

  const resume = async (questId: string) => {
    setBusyId(questId);
    try {
      await api.post(`/api/quests/${questId}/unarchive`, studentId ? { student_id: studentId } : {});
      toast.success('Quest is back on the list');
      await onChanged?.();
    } catch {
      showAlert('Could not resume', 'That quest could not be brought back. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (questId: string, title: string) => {
    const ok = await confirmAlert({
      title: `Remove "${title}" from Saved for Later?`,
      message: 'The quest leaves every list. All work and XP stay in the portfolio.',
      confirmText: 'Remove',
    });
    if (!ok) return;
    setBusyId(questId);
    try {
      await api.post(`/api/quests/${questId}/archive`, archiveBody('done', studentId));
      await onChanged?.();
    } catch {
      showAlert('Could not remove', 'That quest could not be removed from the list. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <VStack testID="saved-for-later-section" space="sm">
      <Heading size="md">Saved for Later</Heading>
      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
        {studentId
          ? 'Quests set aside. The progress is safe, and Resume brings one back.'
          : 'Quests you set aside. Your progress is safe, and Resume brings one back.'}
      </UIText>
      <VStack space="sm">
        {rows.map((row) => {
          const q = row.quests || {};
          const imageUrl = q.image_url || q.header_image_url;
          const title = q.title || 'Quest';
          const savedOn = row.archived_at
            ? new Date(row.archived_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : null;
          return (
            <Card key={row.id} testID={`saved-quest-${row.quest_id}`} variant="elevated" size="sm">
              <HStack className="items-center gap-3">
                <Pressable
                  testID={`saved-quest-open-${row.quest_id}`}
                  onPress={() => router.push(`/(app)/quests/${row.quest_id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${title}`}
                  className="flex-1 min-w-0 flex-row items-center gap-3"
                  style={{ minHeight: 44 }}
                >
                  <View className="w-12 h-12 rounded-lg overflow-hidden bg-surface-200 dark:bg-dark-surface-200 items-center justify-center">
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                      <Ionicons name="bookmark-outline" size={20} color={c.iconMuted} />
                    )}
                  </View>
                  <VStack className="flex-1 min-w-0">
                    <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{title}</UIText>
                    {savedOn && (
                      <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">{`Saved on ${savedOn}`}</UIText>
                    )}
                  </VStack>
                </Pressable>
                <Button
                  testID={`saved-quest-resume-${row.quest_id}`}
                  variant="outline"
                  size="sm"
                  onPress={() => resume(row.quest_id)}
                  isDisabled={busyId !== null}
                  accessibilityLabel={`Resume ${title}`}
                >
                  <ButtonText>Resume</ButtonText>
                </Button>
                <Pressable
                  testID={`saved-quest-remove-${row.quest_id}`}
                  onPress={() => remove(row.quest_id, title)}
                  disabled={busyId !== null}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${title} from Saved for Later`}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">Remove</UIText>
                </Pressable>
              </HStack>
            </Card>
          );
        })}
      </VStack>
    </VStack>
  );
}
