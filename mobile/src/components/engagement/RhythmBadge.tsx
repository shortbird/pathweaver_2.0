/**
 * RhythmBadge - Shows rhythm state with icon and label.
 * Compact version for quest cards, full version for dashboard.
 *
 * `days` adds a seven-day mini heat map beside the label -- the
 * process-focused metric the platform shows instead of a progress bar
 * (core_philosophy.md). `label={false}` drops the state text and keeps the
 * icon and the map, for a row too narrow to fit "Building" (a family quest's
 * member rows); the state stays in the accessibility label. The family reads
 * carry the seven days as `rhythm.last_7_days`; the engagement calendar's
 * full `days` works too, the map shows the last seven.
 */

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText } from '../ui';
import type { RhythmState } from '@/src/hooks/useDashboard';
import { intensityClasses } from './EngagementCalendar';

// Map backend's granular states into 3 simplified display buckets
const simplifiedState: Record<string, string> = {
  in_flow: 'active',
  building: 'building',
  finding_rhythm: 'building',
  fresh_return: 'building',
  resting: 'resting',
  ready_to_begin: 'resting',
  ready_when_you_are: 'resting',
};

const rhythmConfig: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  color: string;
  label: string;
}> = {
  active: { icon: 'flash', bg: 'bg-optio-purple/10', color: '#6D469B', label: 'Active' },
  building: { icon: 'trending-up', bg: 'bg-blue-50', color: '#1D4ED8', label: 'Building' },
  resting: { icon: 'moon', bg: 'bg-green-50', color: '#15803D', label: 'Resting' },
};

export interface HeatDay { date: string; intensity: number }

/** UTC YYYY-MM-DD: the engagement payloads are keyed on the server's day,
 *  and the web map reads them the same way. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The last seven days as boxes, oldest first; a missing day is empty. */
export function MiniHeatMap({ days }: { days?: HeatDay[] | null }) {
  const today = new Date();
  const boxes: HeatDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = dayKey(d);
    const found = days?.find((x) => x.date === key);
    boxes.push({ date: key, intensity: found?.intensity || 0 });
  }
  return (
    <HStack className="gap-0.5" testID="mini-heat-map">
      {boxes.map((b) => (
        <View
          key={b.date}
          testID={`heat-${b.date}`}
          className={`w-2.5 h-2.5 rounded-sm ${intensityClasses[Math.min(b.intensity, 4)]}`}
        />
      ))}
    </HStack>
  );
}

interface RhythmBadgeProps {
  rhythm: RhythmState | null | undefined;
  compact?: boolean;
  /** Days for the seven-day map; omitted, no map. */
  days?: HeatDay[] | null;
  /** false: icon and map only, the state in the accessibility label. */
  label?: boolean;
}

export function RhythmBadge({ rhythm, compact = false, days, label = true }: RhythmBadgeProps) {
  const rawState = rhythm?.state || 'ready_to_begin';
  const bucket = simplifiedState[rawState] || 'resting';
  const config = rhythmConfig[bucket] || rhythmConfig.resting;
  const display = config.label;
  const message = rhythm?.message || '';

  if (compact || days !== undefined) {
    return (
      <HStack
        className={`items-center gap-1.5 px-2 py-1 rounded-full ${config.bg}`}
        accessibilityLabel={label ? undefined : display}
      >
        <Ionicons name={config.icon} size={12} color={config.color} />
        {label && (
          <UIText size="xs" className="font-poppins-medium" style={{ color: config.color }}>
            {display}
          </UIText>
        )}
        {days !== undefined && <MiniHeatMap days={days} />}
      </HStack>
    );
  }

  return (
    <HStack className={`items-center gap-3 p-3 rounded-xl ${config.bg}`}>
      <View className="w-10 h-10 rounded-full bg-white/60 items-center justify-center">
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <VStack className="flex-1">
        <UIText size="sm" className="font-poppins-semibold" style={{ color: config.color }}>
          {display}
        </UIText>
        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">{message}</UIText>
      </VStack>
    </HStack>
  );
}
