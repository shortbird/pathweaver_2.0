/**
 * SchoolSection — a feed block: card with an icon-tile header. The mobile
 * counterpart of the web FeedSection; every section of the School page uses it
 * so the feed reads as one visual system.
 */

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, Heading, UIText } from '@/src/components/ui';

interface SchoolSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  intro?: string;
  children: React.ReactNode;
}

export function SchoolSection({ title, icon, count, intro, children }: SchoolSectionProps) {
  return (
    <Card className="mb-3 bg-white dark:bg-dark-surface-100">
      <HStack className="items-center gap-2.5 mb-3">
        <View className="w-8 h-8 rounded-lg bg-optio-purple/10 items-center justify-center">
          <Ionicons name={icon} size={17} color="#6D469B" />
        </View>
        <Heading size="sm">{title}{count ? ` (${count})` : ''}</Heading>
      </HStack>
      {intro ? (
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 -mt-1 mb-3">
          {intro}
        </UIText>
      ) : null}
      {children}
    </Card>
  );
}
