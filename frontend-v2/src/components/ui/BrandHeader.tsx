/**
 * BrandHeader - Compact brand gradient header for mobile screens.
 *
 * Mirrors the marketing site's gradient hero sections in a mobile-friendly size.
 * Use at the top of tab screens below the PageHeader for brand warmth.
 */

import React from 'react';
import { View, Platform } from 'react-native';
import { Heading } from './heading';
import { UIText } from './text';

interface BrandHeaderProps {
  title: string;
  subtitle?: string;
  compact?: boolean;
}

export function BrandHeader({ title, subtitle, compact }: BrandHeaderProps) {
  const py = compact ? 12 : 16;

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: py,
        paddingBottom: py,
        backgroundColor: '#6D469B',
        // Approximate the gradient on web; solid purple on native (no expo-linear-gradient)
        ...(Platform.OS === 'web'
          ? { backgroundImage: 'linear-gradient(135deg, #6D469B 0%, #8058AC 60%, #EF597B 100%)' }
          : {}),
      }}
    >
      <Heading size={compact ? 'lg' : 'xl'} className="text-white">
        {title}
      </Heading>
      {subtitle && (
        <UIText size="sm" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
          {subtitle}
        </UIText>
      )}
    </View>
  );
}
