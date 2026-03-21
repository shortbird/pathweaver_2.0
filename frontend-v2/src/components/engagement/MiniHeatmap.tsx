/**
 * MiniHeatmap - 7-day engagement heatmap for quest cards.
 * Shows last 7 days of activity with 5 intensity levels.
 */

import React from 'react';
import { View } from 'react-native';
import type { EngagementDay } from '@/src/hooks/useDashboard';

const intensityClasses = [
  'bg-surface-200',        // 0: no activity
  'bg-optio-purple/20',    // 1: light
  'bg-optio-purple/40',    // 2: moderate
  'bg-optio-purple/60',    // 3: active
  'bg-optio-purple',       // 4: intense
];

interface MiniHeatmapProps {
  days: EngagementDay[];
  count?: number;
}

export function MiniHeatmap({ days, count = 7 }: MiniHeatmapProps) {
  // Get last N days, pad with empty if needed
  const recent = days.slice(-count);
  while (recent.length < count) {
    recent.unshift({ date: '', activity_count: 0, intensity: 0, activities: [] });
  }

  return (
    <View className="flex-row gap-1">
      {recent.map((day, i) => (
        <View
          key={i}
          className={`w-3 h-3 rounded-sm ${intensityClasses[Math.min(day.intensity || 0, 4)]}`}
        />
      ))}
    </View>
  );
}
