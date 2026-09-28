/**
 * The dashboard's "Upcoming" card: class work with a due date (ticket
 * 26c91e25).
 *
 * Upcoming items first, soonest first; past-due items at the bottom until they
 * are done (owner decision). A task reads as its own title with the quest's
 * title underneath; tapping any row opens the quest. An empty list renders
 * nothing, so an org that never sets due dates sees no change on Home.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Heading, HStack, UIText, VStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { orderAgenda, type AgendaItem } from '@/src/hooks/useStudentAgenda';
import { formatDueDate } from '@/src/utils/dueDate';

function AgendaRow({ item, pastDue }: { item: AgendaItem; pastDue: boolean }) {
  const c = useThemeColors();
  const primary = item.kind === 'task' && item.taskTitle ? item.taskTitle : item.questTitle;
  const secondary = item.kind === 'task' && item.taskTitle
    ? item.questTitle
    : item.className;
  const when = formatDueDate(item.dueDate);
  return (
    <Pressable
      testID={`upcoming-item-${item.key}`}
      onPress={() => router.push(`/(app)/quests/${item.questId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${primary}, ${pastDue ? 'past due' : 'due'} ${when}`}
      className="py-2"
    >
      <HStack className="items-center gap-3">
        <VStack className="flex-1 min-w-0">
          <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{primary}</UIText>
          {secondary ? (
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={1}>
              {secondary}
            </UIText>
          ) : null}
        </VStack>
        <UIText
          size="xs"
          className={pastDue
            ? 'text-red-600 dark:text-red-400 font-poppins-medium'
            : 'text-typo-500 dark:text-dark-typo-500'}
        >
          {when}
        </UIText>
        <Ionicons name="chevron-forward" size={14} color={c.iconMuted} />
      </HStack>
    </Pressable>
  );
}

export function UpcomingCard({ items, now }: { items: AgendaItem[]; now?: Date }) {
  if (!items || items.length === 0) return null;
  const { upcoming, pastDue } = orderAgenda(items, now);
  return (
    <VStack space="sm" testID="upcoming-card">
      <Heading size="md">Upcoming</Heading>
      <Card variant="elevated" size="md">
        {upcoming.map((item) => (
          <AgendaRow key={item.key} item={item} pastDue={false} />
        ))}
        {pastDue.length > 0 && (
          <View testID="upcoming-past-due" className={upcoming.length > 0 ? 'mt-2 pt-2 border-t border-surface-200 dark:border-dark-surface-300' : ''}>
            <UIText size="xs" className="text-red-600 dark:text-red-400 font-poppins-semibold">Past due</UIText>
            {pastDue.map((item) => (
              <AgendaRow key={item.key} item={item} pastDue />
            ))}
          </View>
        )}
      </Card>
    </VStack>
  );
}
