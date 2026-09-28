/**
 * "Due Tue, Oct 6" on a class quest task (ticket 26c91e25).
 *
 * The teacher sets one due date per task per class on web; GET /api/quests/<id>
 * carries it on each task as `due_date` (null when unset). Nothing renders
 * without a date, so a class with no due dates looks exactly as it did.
 * An incomplete task past its date reads "Past due"; a finished one keeps the
 * plain date, because the work is done and red would only nag.
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { HStack, UIText } from '@/src/components/ui';
import { formatDueDate, isPastDue } from '@/src/utils/dueDate';

export function dueChipState(
  dueDate: string | null | undefined,
  isCompleted: boolean,
  now: Date = new Date(),
): { text: string; pastDue: boolean } | null {
  const when = formatDueDate(dueDate, now);
  if (!when) return null;
  const pastDue = !isCompleted && isPastDue(dueDate, now);
  return { text: pastDue ? `Past due · ${when}` : `Due ${when}`, pastDue };
}

export function TaskDueChip({
  dueDate,
  isCompleted,
}: {
  dueDate?: string | null;
  isCompleted: boolean;
}) {
  const state = dueChipState(dueDate, isCompleted);
  if (!state) return null;
  const { text, pastDue } = state;
  return (
    <HStack
      testID={pastDue ? 'task-due-chip-past' : 'task-due-chip'}
      className={`self-start items-center gap-1 px-2 py-0.5 rounded-full ${
        pastDue ? 'bg-red-50 dark:bg-red-950/30' : 'bg-surface-100 dark:bg-dark-surface-200'
      }`}
      accessibilityLabel={text}
    >
      <Ionicons name={pastDue ? 'alert-circle-outline' : 'calendar-outline'} size={12} color={pastDue ? '#DC2626' : '#6B7280'} />
      <UIText
        size="xs"
        className={pastDue
          ? 'text-red-600 dark:text-red-400 font-poppins-medium'
          : 'text-typo-500 dark:text-dark-typo-500 font-poppins-medium'}
      >
        {text}
      </UIText>
    </HStack>
  );
}
