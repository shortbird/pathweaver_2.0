/**
 * RhythmBadge - Shows rhythm state with icon and label.
 * Compact version for quest cards, full version for dashboard.
 */

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText } from '../ui';
import type { RhythmState } from '@/src/hooks/useDashboard';

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

interface RhythmBadgeProps {
  rhythm: RhythmState | null;
  compact?: boolean;
}

export function RhythmBadge({ rhythm, compact = false }: RhythmBadgeProps) {
  const rawState = rhythm?.state || 'ready_to_begin';
  const bucket = simplifiedState[rawState] || 'resting';
  const config = rhythmConfig[bucket] || rhythmConfig.resting;
  const display = config.label;
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
