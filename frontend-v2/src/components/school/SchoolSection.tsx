/**
 * SchoolSection — a feed block: card with an icon-tile header. The mobile
 * counterpart of the web FeedSection; every section of the School page uses it
 * so the feed reads as one visual system.
 *
 * Collapsible, and CLOSED on arrival. iCreate asked for this during family
 * orientation (2026-08-18): with announcements, events, lost & found,
 * shout-outs, the carpool board and every child's class schedule all expanded,
 * the page opened as a wall of text and the thing a parent came for was
 * several screens down. Closed by default, the page opens as a list of
 * headings you can pick from.
 *
 * State is per-mount (sections re-close on the next visit) — the collapse is
 * navigation, not a preference worth persisting.
 */

import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, HStack, Heading, UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

interface SchoolSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  intro?: string;
  children: React.ReactNode;
}

export function SchoolSection({ title, icon, count, intro, children }: SchoolSectionProps) {
  const c = useThemeColors();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card className="mb-3 bg-white dark:bg-dark-surface-100">
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        testID={`section-toggle-${title}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={title}
      >
        <HStack className={`items-center gap-2.5 ${collapsed ? '' : 'mb-3'}`}>
          <View className="w-8 h-8 rounded-lg bg-optio-purple/10 items-center justify-center">
            <Ionicons name={icon} size={17} color="#6D469B" />
          </View>
          <Heading size="sm" className="flex-1">{title}{count ? ` (${count})` : ''}</Heading>
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={16}
            color={c.iconMuted}
          />
        </HStack>
      </Pressable>
      {!collapsed && (
        <>
          {intro ? (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 -mt-1 mb-3">
              {intro}
            </UIText>
          ) : null}
          {children}
        </>
      )}
    </Card>
  );
}
