/**
 * FamilyQuestsSection - the family's quests, on the Family tab.
 *
 * A quest the parent SET UP for the family -- private, owned by the parent,
 * with each enrolled child working through their own copy -- or one the
 * parent is themselves enrolled in (a school's training quest, or one they
 * made on their own account). Each card names who is on the quest with
 * their rhythm on it -- the engagement icon and seven days of boxes, not a
 * progress bar; a member's row opens THEIR copy: a child's in family scope,
 * the parent's own on the learner's quest screen. Children not on it yet can
 * be added from the card, a member's run can be saved for later or marked
 * done from the card (ticket e17134c6, the same two actions as the quest
 * screen; it said "End" until 2026-10-07), and
 * "New family quest" sets one up for whichever children the parent picks
 * (hooks/useFamilyQuests).
 *
 * Until 2026-09-15 this was "Your quests": the parent's own enrollments
 * only, with nothing to say whose quest it was and no way to put a child
 * on it.
 */

import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Avatar, AvatarFallbackText, AvatarImage, Card, HStack, Heading, UIText, VStack, Button, ButtonText,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useFamilyQuests, type FamilyQuest, type FamilyQuestMember } from '@/src/hooks/useFamilyQuests';
import { useFamilyStore } from '@/src/stores/familyStore';
import type { Child } from '@/src/types/family';
import { confirmAlert, showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { askSaveForLater, markDoneRule, type SaveForLaterAnswer } from '@/src/components/quests/questExit';
import { CreateQuestSheet } from '@/src/components/journal/CreateQuestSheet';

function MemberRow({ member, xpThreshold, onOpen, onSaveForLater, onMarkDone, ending }: {
  member: FamilyQuestMember;
  xpThreshold: number | null | undefined;
  onOpen: (m: FamilyQuestMember) => void;
  onSaveForLater: (m: FamilyQuestMember) => void;
  onMarkDone: (m: FamilyQuestMember) => void;
  ending: boolean;
}) {
  const done = Boolean(member.completed_at);
  const who = member.is_self ? 'your' : `${member.first_name}'s`;
  // The quest screen's rule (components/quests/questExit): with no XP finish
  // line, at least one finished task; with one, the finish line.
  const { canMarkDone, hint } = markDoneRule({
    xpThreshold,
    earnedXP: member.xp_earned ?? null,
    completedTasks: member.progress?.completed_tasks || 0,
    questLabel: 'quest',
  });
  return (
    <VStack className="py-1">
    <HStack className="items-center gap-2">
      <Pressable
        onPress={() => onOpen(member)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${who} copy`}
        className="flex-row items-center gap-2 flex-1 min-w-0 active:opacity-70"
      >
        <Avatar size="xs">
          {member.avatar_url ? (
            <AvatarImage source={{ uri: member.avatar_url }} />
          ) : (
            <AvatarFallbackText>{(member.first_name || '?').charAt(0).toUpperCase()}</AvatarFallbackText>
          )}
        </Avatar>
        <UIText size="sm" numberOfLines={1} style={{ width: 72 }}>{member.is_self ? 'You' : member.first_name}</UIText>
        <View style={{ alignSelf: 'flex-start' }}>
          {done ? (
            <UIText size="xs" className="rounded-full bg-green-50 px-2 py-1 font-poppins-semibold" style={{ color: '#15803D' }}>
              Completed
            </UIText>
          ) : (
            <RhythmBadge rhythm={member.rhythm || null} days={member.rhythm?.last_7_days || null} label={false} />
          )}
        </View>
      </Pressable>
      {/* Save for later / Mark done for this member's run -- what the two
          buttons on the quest screen do (ticket e17134c6), reachable from
          here so a parent does not have to open each child's copy to tidy
          up. */}
      {!done && (
        <HStack className="items-center gap-3">
          <Pressable
            onPress={() => onSaveForLater(member)}
            disabled={ending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Save ${who} quest for later`}
          >
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">Save for later</UIText>
          </Pressable>
          <Pressable
            onPress={() => onMarkDone(member)}
            disabled={ending || !canMarkDone}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${who} quest done`}
            accessibilityState={{ disabled: ending || !canMarkDone }}
            style={{ opacity: canMarkDone ? 1 : 0.4 }}
          >
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">Mark done</UIText>
          </Pressable>
        </HStack>
      )}
    </HStack>
    {!done && !canMarkDone && hint && (
      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-right">{hint}</UIText>
    )}
    </VStack>
  );
}

function FamilyQuestCard({ quest, kids, onOpen, onAdd, onSaveForLater, onMarkDone, adding, ending }: {
  quest: FamilyQuest;
  kids: Child[];
  onOpen: (q: FamilyQuest, m: FamilyQuestMember) => void;
  onAdd: (q: FamilyQuest, kid: Child) => void;
  onSaveForLater: (q: FamilyQuest, m: FamilyQuestMember) => void;
  onMarkDone: (q: FamilyQuest, m: FamilyQuestMember) => void;
  adding: boolean;
  ending: boolean;
}) {
  const c = useThemeColors();
  const onIt = new Set(quest.members.map((m) => m.user_id));
  const notYet = kids.filter((k) => !onIt.has(k.id));
  return (
    <Card variant="outline" size="md" testID={`family-quest-${quest.id}`}>
      <HStack className="items-start gap-3">
        {quest.image_url ? (
          <Image source={{ uri: quest.image_url }} style={{ width: 48, height: 48, borderRadius: 10 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: `${c.brand}15`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school-outline" size={22} color={c.brand} />
          </View>
        )}
        <VStack className="flex-1 min-w-0">
          <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{quest.title}</UIText>
          {quest.description ? (
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={2}>{quest.description}</UIText>
          ) : null}
        </VStack>
      </HStack>

      <VStack className="mt-2">
        {quest.members.map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            xpThreshold={quest.xp_threshold}
            onOpen={(member) => onOpen(quest, member)}
            onSaveForLater={(member) => onSaveForLater(quest, member)}
            onMarkDone={(member) => onMarkDone(quest, member)}
            ending={ending}
          />
        ))}
        {quest.members.length === 0 && (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Nobody is on this quest yet.</UIText>
        )}
      </VStack>

      {notYet.length > 0 && (
        <HStack className="mt-2 flex-wrap gap-2">
          {notYet.map((k) => {
            const name = k.first_name || k.display_name?.split(' ')[0] || 'child';
            return (
              <Pressable
                key={k.id}
                onPress={() => onAdd(quest, k)}
                disabled={adding}
                accessibilityRole="button"
                accessibilityLabel={`Add ${name}`}
                className="flex-row items-center gap-1 rounded-full border border-surface-200 dark:border-dark-surface-300 px-2.5 py-1 active:opacity-70"
              >
                <Ionicons name="add" size={14} color={c.brand} />
                <UIText size="xs" className="text-optio-purple dark:text-optio-purple-light font-poppins-medium">Add {name}</UIText>
              </Pressable>
            );
          })}
        </HStack>
      )}
    </Card>
  );
}

export function FamilyQuestsSection({ kids }: { kids: Child[] }) {
  const c = useThemeColors();
  const { isLargeScreen, isWide } = useBreakpoint();
  const { quests, loading, refetch, enrollChildren, endMemberQuest, archiveMemberQuest } = useFamilyQuests();
  const setSelected = useFamilyStore((s) => s.setSelected);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState(false);

  const openCopy = (quest: FamilyQuest, member: FamilyQuestMember) => {
    if (member.is_self) {
      // The learner's own quest screen, where the parent's tasks are done.
      router.push(`/(app)/quests/${quest.id}` as any);
      return;
    }
    // The child's copy: the same quest screen, with the family scope pointed
    // at them so the header and the other tabs agree on who the parent is
    // working with.
    setSelected(member.user_id);
    router.push(`/(app)/quests/${quest.id}` as any);
  };

  const addChild = async (quest: FamilyQuest, kid: Child) => {
    const name = kid.first_name || kid.display_name?.split(' ')[0] || 'them';
    setAdding(true);
    try {
      const { failed } = await enrollChildren(quest.id, [kid.id]);
      if (failed.length) showAlert(`Could not add ${name}`, failed[0]?.error);
    } catch (err) {
      showAlert(`Could not add ${name}`, extractApiError(err).message);
    } finally {
      setAdding(false);
    }
  };

  // Save for later: one question, two answers (components/quests/questExit).
  // A child's quest goes to Saved for Later on the child's Home; the
  // parent's own has no such list on mobile, and the copy says so.
  const saveForLaterFor = async (quest: FamilyQuest, member: FamilyQuestMember) => {
    const answer: SaveForLaterAnswer | null = await askSaveForLater('quest', !member.is_self);
    if (!answer) return;
    setEnding(true);
    try {
      await archiveMemberQuest(quest.id, member.is_self ? null : member.user_id, answer);
    } catch (err) {
      showAlert('Could not save the quest', extractApiError(err).message);
    } finally {
      setEnding(false);
    }
  };

  // Mark done: POST /end, named unfinished tasks as the quest screen does.
  const markDoneFor = async (quest: FamilyQuest, member: FamilyQuestMember) => {
    const remaining = Math.max((member.progress?.total_tasks || 0) - (member.progress?.completed_tasks || 0), 0);
    const whose = member.is_self ? 'your' : `${member.first_name}'s`;
    const unfinished = remaining > 0
      ? ` ${remaining} unfinished task${remaining === 1 ? '' : 's'} will leave the dashboard.`
      : '';
    const ok = await confirmAlert({
      title: `Mark ${whose} "${quest.title}" done?`,
      message: `All work and XP are kept, and the quest moves to Completed. It can be reopened later.${unfinished}`,
      confirmText: 'Mark done',
    });
    if (!ok) return;
    setEnding(true);
    try {
      await endMemberQuest(quest.id, member.is_self ? null : member.user_id);
    } catch (err) {
      showAlert('Could not mark the quest done', extractApiError(err).message);
    } finally {
      setEnding(false);
    }
  };

  if (loading) return null;

  const columns = isWide ? 3 : isLargeScreen ? 2 : 1;

  return (
    <VStack space="sm" testID="family-quests">
      <HStack className="items-center justify-between gap-2">
        <HStack className="items-center gap-2">
          <Ionicons name="school-outline" size={16} color={c.brand} />
          <Heading size="md">Family quests</Heading>
        </HStack>
        {kids.length > 0 && quests.length > 0 && (
          <Pressable onPress={() => setCreating(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="New family quest">
            <HStack className="items-center gap-1">
              <Ionicons name="add" size={16} color={c.brand} />
              <UIText size="sm" className="text-optio-purple dark:text-optio-purple-light font-poppins-medium">New</UIText>
            </HStack>
          </Pressable>
        )}
      </HStack>

      {quests.length === 0 ? (
        <Card variant="filled" size="md" className="items-center py-6">
          <Ionicons name="school-outline" size={28} color={c.iconMuted} />
          <UIText size="sm" className="font-poppins-semibold mt-2">No family quests yet</UIText>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1 text-center">
            Set up a quest for your children to work through together, each at their own pace.
          </UIText>
          {kids.length > 0 && (
            <Button size="sm" className="mt-3" onPress={() => setCreating(true)}>
              <ButtonText>New family quest</ButtonText>
            </Button>
          )}
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
          {quests.map((q) => (
            <View key={q.id} style={{ width: `${100 / columns}%`, padding: 6 }}>
              <FamilyQuestCard
                quest={q}
                kids={kids}
                onOpen={openCopy}
                onAdd={addChild}
                onSaveForLater={saveForLaterFor}
                onMarkDone={markDoneFor}
                adding={adding}
                ending={ending}
              />
            </View>
          ))}
        </View>
      )}

      <CreateQuestSheet
        visible={creating}
        onClose={() => setCreating(false)}
        familyChildren={kids}
        onCreated={() => refetch()}
      />
    </VStack>
  );
}
