/**
 * Unread teacher feedback, at the top of the quest screen.
 *
 * Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
 * the inbox with a small badge, and students miss it. A banner or pop-up
 * attached to the quest itself would make sure they see it."
 *
 * `count` and `feedback` are GET /api/quests/<id>'s unread_feedback_count and
 * latest_feedback, set only for the student on their own quest (0 and null in
 * family scope). "Read feedback" opens the thread; reading it marks the note
 * read and the banner goes on the next load. The web twin is
 * web/src/components/quest/TeacherFeedbackBanner.jsx.
 */

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Button, ButtonText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import type { LatestFeedback } from '@/src/hooks/useQuestDetail';

export function feedbackBannerTitle(feedback: LatestFeedback): string {
  return `Your teacher left feedback on ${feedback.task_title || 'a task'}`;
}

export function TeacherFeedbackBanner({ count = 0, feedback, onRead }: {
  count?: number | null;
  feedback?: LatestFeedback | null;
  onRead?: (feedback: LatestFeedback) => void;
}) {
  const c = useThemeColors();
  if (!count || count < 1 || !feedback) return null;
  const more = count - 1;
  return (
    <VStack
      testID="teacher-feedback-banner"
      accessibilityRole="alert"
      space="sm"
      className="p-4 rounded-2xl border border-optio-purple/30 bg-optio-purple/5"
    >
      <HStack className="items-start gap-3">
        <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center">
          <Ionicons name="chatbubbles-outline" size={18} color={c.brand} />
        </View>
        <VStack className="flex-1 min-w-0" space="xs">
          <UIText size="sm" className="font-poppins-semibold text-typo dark:text-dark-typo">
            {feedbackBannerTitle(feedback)}
          </UIText>
          {feedback.preview ? (
            <UIText size="sm" className="text-typo-700 dark:text-dark-typo-300">
              {feedback.author_name ? `${feedback.author_name}: ` : ''}{feedback.preview}
            </UIText>
          ) : null}
          {more > 0 && (
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
              {more === 1 ? '1 more new note on this quest' : `${more} more new notes on this quest`}
            </UIText>
          )}
        </VStack>
      </HStack>
      <Button size="md" className="self-start" onPress={() => onRead?.(feedback)}>
        <ButtonText>Read feedback</ButtonText>
      </Button>
    </VStack>
  );
}

/**
 * "New feedback" on a quest card (ticket 4ea811d6), from the dashboard's
 * active_quests[].unread_feedback_count. Renders nothing at 0.
 */
export function NewFeedbackMarker({ count }: { count?: number | null }) {
  if (!count || count < 1) return null;
  return (
    <HStack
      testID="quest-card-new-feedback"
      accessibilityLabel="New feedback from your teacher"
      className="self-start items-center gap-1.5 px-2 py-0.5 rounded-full bg-optio-purple/10"
    >
      <View className="w-1.5 h-1.5 rounded-full bg-optio-pink" />
      <UIText size="xs" className="text-optio-purple font-poppins-semibold">New feedback</UIText>
    </HStack>
  );
}
