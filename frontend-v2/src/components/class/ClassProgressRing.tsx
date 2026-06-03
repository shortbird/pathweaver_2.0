/**
 * ClassProgressRing - Circular SVG progress ring for a transcript class.
 *
 * Shows approved subject XP toward the next 1000-XP credit. When
 * approvedXp >= 1000 (creditsEarned >= 1), the ring fills + a checkmark
 * banner appears above the inner number. Excess XP rolls over toward the
 * next credit.
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { UIText, VStack } from '../ui';

interface ClassProgressRingProps {
  approvedXp: number;
  targetXp?: number;
  size?: number;
  strokeWidth?: number;
}

export function ClassProgressRing({
  approvedXp,
  targetXp = 1000,
  size = 120,
  strokeWidth = 10,
}: ClassProgressRingProps) {
  const c = useThemeColors();
  const creditsEarned = Math.floor(approvedXp / targetXp);
  const xpToNext = approvedXp - creditsEarned * targetXp;
  const ringValue = creditsEarned > 0 && xpToNext === 0 ? targetXp : xpToNext;
  const ringTotal = targetXp;
  const percent = Math.min(1, ringValue / ringTotal);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent);

  return (
    <VStack className="items-center justify-center" style={{ width: size, height: size }}>
      <View style={{ position: 'absolute' }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={c.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#6D469B"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </View>
      <VStack className="items-center" style={{ width: size, height: size, justifyContent: 'center' }}>
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wider">
          {creditsEarned > 0 ? `${creditsEarned} credit${creditsEarned > 1 ? 's' : ''}` : 'Progress'}
        </UIText>
        <UIText size="lg" className="font-poppins-bold text-optio-purple">
          {ringValue}
        </UIText>
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
          / {targetXp} XP
        </UIText>
      </VStack>
    </VStack>
  );
}
