/**
 * EngagementCalendar - Full heatmap grid for dashboard/detail views.
 * GitHub-style activity visualization with adaptive sizing.
 */

import React from 'react';
import { View } from 'react-native';
import { HStack, VStack, UIText } from '../ui';
import type { EngagementDay } from '@/src/hooks/useDashboard';

const intensityClasses = [
  'bg-surface-100',        // 0: no activity
  'bg-optio-purple/20',    // 1: light
  'bg-optio-purple/40',    // 2: moderate
  'bg-optio-purple/60',    // 3: active
  'bg-optio-purple',       // 4: intense
];

interface EngagementCalendarProps {
  days: EngagementDay[];
  firstActivityDate?: string;
}

export function EngagementCalendar({ days, firstActivityDate }: EngagementCalendarProps) {
  if (!days || days.length === 0) {
    return (
      <VStack testID="calendar-empty" space="sm">
        <UIText size="sm" className="text-typo-400">
          Your activity calendar will appear here as you engage with quests.
        </UIText>
      </VStack>
    );
  }

  const activeDays = days.filter((d) => d.activity_count > 0).length;

  // Format date range
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const firstDate = days[0]?.date;
  const lastDate = days[days.length - 1]?.date;

  return (
    <VStack space="sm">
      {/* Header */}
      <HStack className="items-center justify-between">
        <UIText testID="calendar-date-range" size="xs" className="text-typo-400">
          {firstDate && lastDate ? `${formatDate(firstDate)} - ${formatDate(lastDate)}` : ''}
        </UIText>
        <UIText testID="calendar-active-days" size="xs" className="text-typo-500 font-poppins-medium">
          {activeDays} active day{activeDays !== 1 ? 's' : ''}
        </UIText>
      </HStack>

      {/* Grid */}
      <View testID="calendar-grid" className="flex-row flex-wrap gap-1">
        {days.map((day, i) => (
          <View
            key={i}
            className={`w-3.5 h-3.5 md:w-4 md:h-4 rounded-sm ${intensityClasses[Math.min(day.intensity || 0, 4)]}`}
          />
        ))}
      </View>

      {/* Legend */}
      <HStack className="items-center gap-1">
        <UIText size="xs" className="text-typo-300">Less</UIText>
        {intensityClasses.map((cls, i) => (
          <View key={i} className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
        ))}
        <UIText size="xs" className="text-typo-300">More</UIText>
      </HStack>
    </VStack>
  );
}
