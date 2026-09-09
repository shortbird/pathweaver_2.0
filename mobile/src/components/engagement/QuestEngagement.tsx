/**
 * QuestEngagement - the engagement mini-calendar block shown on quest views in
 * place of a task-completion progress bar.
 *
 * "The Process Is The Goal": quest views surface recent activity (rhythm), not
 * a completion percentage. Used by the student quest detail and the parent
 * quest view so every quest view reads the same way.
 */

import React from 'react';
import type { EngagementData } from '@/src/hooks/useDashboard';
import { MiniHeatmap } from './MiniHeatmap';
import { VStack, HStack, UIText, Card } from '@/src/components/ui';

export function QuestEngagement({ engagement, label = 'Recent activity' }: {
  engagement: EngagementData | null | undefined;
  label?: string;
}) {
  const days = engagement?.calendar?.days || [];
  const activeWeek = engagement?.summary?.active_days_last_week;

  return (
    <Card variant="elevated" size="md">
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <UIText size="sm" className="font-poppins-medium text-typo-700 dark:text-dark-typo-700">{label}</UIText>
          {typeof activeWeek === 'number' && (
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
              {activeWeek} active {activeWeek === 1 ? 'day' : 'days'} this week
            </UIText>
          )}
        </HStack>
        <MiniHeatmap days={days} count={14} />
      </VStack>
    </Card>
  );
}
