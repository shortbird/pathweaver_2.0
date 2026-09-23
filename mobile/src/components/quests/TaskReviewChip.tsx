/**
 * "Accepted by <teacher> · <date>" on a task, for the family to see.
 *
 * iCreate, ticket 650aa9b9 (2026-09-23): "When I accept a task, the parent is
 * notified of which one, but then it doesn't show up on the task that it has
 * been accepted. Can we show somewhere on the task that I have accepted it, for
 * the parents to see?" The accept is written in the SIS submissions inbox;
 * GET /api/quests/<id> now carries it on each task as `review` (null until a
 * teacher reviews the task). The web twin is TaskReviewChip in
 * web/src/components/quest/taskWorkspace/TaskEvidenceSection.jsx.
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { HStack, UIText } from '@/src/components/ui';
import type { TaskReview } from '@/src/hooks/useQuestDetail';

export function reviewChipText(review?: TaskReview | null): string | null {
  if (!review || review.action !== 'accepted') return null;
  const when = review.reviewed_at
    ? new Date(review.reviewed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return `Accepted by ${review.reviewer_name || 'your teacher'}${when ? ` · ${when}` : ''}`;
}

export function TaskReviewChip({ review }: { review?: TaskReview | null }) {
  const text = reviewChipText(review);
  if (!text) return null;
  return (
    <HStack
      className="self-start items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950/30"
      accessibilityLabel={text}
    >
      <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
      <UIText size="xs" className="text-green-700 dark:text-green-500 font-poppins-medium">
        {text}
      </UIText>
    </HStack>
  );
}
