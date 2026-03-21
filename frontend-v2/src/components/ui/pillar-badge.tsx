/**
 * PillarBadge - Displays a pillar tag with icon and color.
 */

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack } from './hstack';
import { UIText } from './text';
import { getPillar } from '@/src/config/pillars';

interface PillarBadgeProps {
  pillar: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function PillarBadge({ pillar, showIcon = true, size = 'sm' }: PillarBadgeProps) {
  const config = getPillar(pillar);
  const iconSize = size === 'sm' ? 12 : 14;
  const textSize = size === 'sm' ? 'xs' as const : 'sm' as const;
  const px = size === 'sm' ? 'px-2' : 'px-3';
  const py = size === 'sm' ? 'py-0.5' : 'py-1';

  return (
    <View
      style={{ backgroundColor: config.color + '20', borderRadius: 20 }}
      className={`${px} ${py} flex-row items-center gap-1`}
    >
      {showIcon && (
        <Ionicons name={config.icon} size={iconSize} color={config.color} />
      )}
      <UIText size={textSize} style={{ color: config.color }} className="font-poppins-medium">
        {config.label}
      </UIText>
    </View>
  );
}
