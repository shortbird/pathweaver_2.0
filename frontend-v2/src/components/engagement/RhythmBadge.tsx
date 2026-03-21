/**
 * RhythmBadge - Shows rhythm state with icon and label.
 * Compact version for quest cards, full version for dashboard.
 */

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText } from '../ui';
import type { RhythmState } from '@/src/hooks/useDashboard';

const rhythmConfig: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  color: string;
}> = {
  in_flow: { icon: 'flash', bg: 'bg-optio-purple/10', color: '#6D469B' },
  building: { icon: 'trending-up', bg: 'bg-blue-50', color: '#1D4ED8' },
  resting: { icon: 'moon', bg: 'bg-green-50', color: '#15803D' },
  fresh_return: { icon: 'refresh', bg: 'bg-amber-50', color: '#B45309' },
  ready_to_begin: { icon: 'play-circle', bg: 'bg-surface-100', color: '#6B7280' },
  ready_when_you_are: { icon: 'play-circle', bg: 'bg-surface-100', color: '#6B7280' },
  finding_rhythm: { icon: 'trending-up', bg: 'bg-blue-50', color: '#1D4ED8' },
};

interface RhythmBadgeProps {
  rhythm: RhythmState | null;
  compact?: boolean;
}

export function RhythmBadge({ rhythm, compact = false }: RhythmBadgeProps) {
  const state = rhythm?.state || 'ready_to_begin';
  const config = rhythmConfig[state] || rhythmConfig.ready_to_begin;
  const display = rhythm?.state_display || 'Ready to Begin';
  const message = rhythm?.message || '';

  if (compact) {
    return (
      <HStack className={`items-center gap-1.5 px-2 py-1 rounded-full ${config.bg}`}>
        <Ionicons name={config.icon} size={12} color={config.color} />
        <UIText size="xs" className="font-poppins-medium" style={{ color: config.color }}>
          {display}
        </UIText>
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
        <UIText size="xs" className="text-typo-500">{message}</UIText>
      </VStack>
    </HStack>
  );
}
