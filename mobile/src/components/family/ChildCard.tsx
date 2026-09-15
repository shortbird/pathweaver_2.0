/**
 * ChildCard - one child on the Family tab.
 *
 * The card answers "how is this child doing" without opening them: their
 * picture (tap it to set one -- ChildAvatar), the numbers that move (XP,
 * active quests, streak, when they were last active), the quests they are
 * on with the child's RHYTHM on each -- not a progress bar: the process is
 * the goal, and "Active" with seven days of boxes says more about a week
 * than "3/7 tasks" -- the weekly goal as one line, and the peer-connection
 * requests waiting on the parent. The summary is /api/parent/dashboard/:id
 * (useChildDashboard), the same read the web dashboard's cards make, and
 * until it lands, or if it fails, the card still stands: name, picture, and
 * Open.
 *
 * "Open" puts the child in family scope (stores/familyStore) and lands on
 * their dashboard; a quest row does the same and lands on that quest, so
 * the parent is working WITH the child on it; the name lands on their full
 * profile. Until 2026-09-15 the tab showed ONE child at a time behind a
 * switcher, with a hero, a calendar and a list of doors; every child is a
 * card now, the way the web dashboard does it.
 */

import React, { useEffect, useRef } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, UIText, VStack, Button, ButtonText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useChildDashboard } from '@/src/hooks/useParent';
import type { Child } from '@/src/types/family';
import type { ConnectionApprovals } from '@/src/hooks/useConnectionApprovals';
import type { QuestRhythm } from '@/src/hooks/useFamilyQuests';
import { formatRelativeTime } from '@/src/utils/timeAgo';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { ChildAvatar } from './ChildAvatar';
import { ChildConnections } from './ChildConnections';
import { WeeklyXpGoalLine } from './WeeklyXpGoalLine';
import { initialsFor, nameFor } from './ChildSwitcher';

const MAX_QUESTS = 3;

/** The parts of /api/parent/dashboard/:id the card reads. */
interface ChildSummary {
  student?: { total_xp?: number; streak_days?: number; avatar_url?: string | null };
  stats?: { total_xp?: number; active_quests_count?: number };
  learning_rhythm?: { last_activity_date?: string | null };
  active_quests?: ActiveQuest[];
}

interface ActiveQuest {
  quest_id?: string;
  id?: string;
  title?: string;
  image_url?: string | null;
  quests?: { id?: string; title?: string; image_url?: string | null };
  rhythm?: QuestRhythm | null;
}

/** "1,250 XP · 3 active quests · 4-day streak · Active 2d ago" */
function statLine(summary: ChildSummary | null, child: Child): string {
  const parts: string[] = [];
  const xp = summary?.student?.total_xp ?? summary?.stats?.total_xp ?? child.total_xp;
  if (typeof xp === 'number') parts.push(`${xp.toLocaleString()} XP`);
  const quests = summary?.stats?.active_quests_count;
  if (typeof quests === 'number') parts.push(`${quests} active quest${quests === 1 ? '' : 's'}`);
  const streak = summary?.student?.streak_days || 0;
  if (streak > 0) parts.push(`${streak}-day streak`);
  if (summary) {
    const last = summary.learning_rhythm?.last_activity_date;
    parts.push(last ? `Active ${formatRelativeTime(last)}` : 'No activity yet');
  }
  return parts.join(' · ');
}

interface ChildCardProps {
  child: Child;
  /** Bumped by the tab on pull-to-refresh and on focus; the card refetches. */
  refreshKey: number;
  connections: ConnectionApprovals;
  connectionsBusy: boolean;
  onDecideConnection: (connectionId: string, approve: boolean) => Promise<void>;
  onRevokeConnection: (connectionId: string) => Promise<void>;
  onOpen: (child: Child) => void;
  onOpenQuest: (child: Child, questId: string) => void;
  onOpenProfile: (child: Child) => void;
  /** The quest catalog in this child's scope. The parent tab bar has no
   *  Quests tab, so the card is the door (the web has the sidebar). */
  onBrowseQuests: (child: Child) => void;
}

export function ChildCard({
  child, refreshKey, connections, connectionsBusy, onDecideConnection, onRevokeConnection,
  onOpen, onOpenQuest, onOpenProfile, onBrowseQuests,
}: ChildCardProps) {
  const c = useThemeColors();
  const { data, refetch } = useChildDashboard(child.id);
  const summary = data as ChildSummary | null;
  const firstName = child.first_name || nameFor(child).split(' ')[0];

  // The hook fetches on mount; a later bump is the tab asking for fresh rows.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    refetch();
  }, [refreshKey, refetch]);

  const quests = summary?.active_quests || [];
  const quiet = summary && quests.length === 0;

  return (
    <Card variant="outline" size="md" testID={`child-card-${child.id}`}>
      <HStack className="items-center gap-3">
        <ChildAvatar
          childId={child.id}
          firstName={firstName}
          avatarUrl={summary?.student?.avatar_url || child.avatar_url}
          initials={initialsFor(child)}
          size="lg"
        />
        <VStack className="flex-1 min-w-0">
          {/* The name opens the child's full profile. */}
          <Pressable onPress={() => onOpenProfile(child)} accessibilityRole="button" accessibilityLabel={`Open ${nameFor(child)}'s profile`}>
            <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>{nameFor(child)}</UIText>
          </Pressable>
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={1}>
            {statLine(summary, child)}
          </UIText>
        </VStack>
        <Button size="sm" onPress={() => onOpen(child)} testID={`child-open-${child.id}`}>
          <ButtonText>Open</ButtonText>
        </Button>
      </HStack>

      {quests.length > 0 && (
        <VStack className="mt-3" space="xs">
          <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">
            Quests
          </UIText>
          {quests.slice(0, MAX_QUESTS).map((q) => {
            const quest = q.quests || q;
            const questId = q.quest_id || q.id || quest.id || '';
            return (
              <Pressable
                key={questId}
                onPress={() => onOpenQuest(child, questId)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${quest.title || q.title} with ${firstName}`}
                className="rounded-lg py-1 active:opacity-70"
              >
                <HStack className="items-center gap-2">
                  {quest.image_url ? (
                    <Image source={{ uri: quest.image_url }} style={{ width: 32, height: 32, borderRadius: 8 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${c.brand}15`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="rocket-outline" size={16} color={c.brand} />
                    </View>
                  )}
                  <VStack className="flex-1 min-w-0" space="xs">
                    <UIText size="sm" numberOfLines={1}>{quest.title || q.title}</UIText>
                    <View style={{ alignSelf: 'flex-start' }}>
                      <RhythmBadge rhythm={q.rhythm || null} days={q.rhythm?.last_7_days || null} compact />
                    </View>
                  </VStack>
                  <Ionicons name="chevron-forward" size={14} color={c.iconMuted} />
                </HStack>
              </Pressable>
            );
          })}
          {quests.length > MAX_QUESTS && (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">and {quests.length - MAX_QUESTS} more</UIText>
          )}
        </VStack>
      )}
      {quiet && (
        <UIText size="xs" className="mt-3 text-typo-400 dark:text-dark-typo-400">No quests yet.</UIText>
      )}
      {summary && (
        <Pressable
          onPress={() => onBrowseQuests(child)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Browse quests for ${firstName}`}
          className="mt-2 flex-row items-center gap-1"
        >
          <Ionicons name="search-outline" size={13} color={c.brand} />
          <UIText size="xs" className="text-optio-purple dark:text-optio-purple-light font-poppins-medium">
            Browse quests for {firstName}
          </UIText>
        </Pressable>
      )}

      <WeeklyXpGoalLine studentId={child.id} />

      <ChildConnections
        connections={connections}
        busy={connectionsBusy}
        onDecide={onDecideConnection}
        onRevoke={onRevokeConnection}
      />
    </Card>
  );
}
