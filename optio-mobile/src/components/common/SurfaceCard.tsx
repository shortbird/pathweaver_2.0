/**
 * SurfaceCard - Opaque content-layer card.
 *
 * Used for all content containers (feed items, journal entries, stats cards, etc.).
 * NOT glass -- no blur, no specular highlight. Lives in the content layer.
 *
 * Light: semi-opaque white with shadow.
 * Dark: subtle translucent white with border.
 */

import React from 'react';
import { StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';

interface SurfaceCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
  accent?: boolean;
}

export function SurfaceCard({ children, style, noPadding, accent }: SurfaceCardProps) {
  const { mode, colors } = useThemeStore();
  const { reduceTransparency } = useAccessibilitySettings();

  const isDark = mode === 'dark';
  const isOpaque = reduceTransparency;

  const bgColor = isOpaque
    ? (isDark ? '#1A1C2E' : '#FFFFFF')
    : colors.surface;

  const borderStyle = (isDark || isOpaque)
    ? { borderWidth: 0.5, borderColor: isOpaque ? colors.text + '30' : 'rgba(255, 255, 255, 0.08)' }
    : {};

  const shadow = isDark ? tokens.shadows.sm : tokens.shadows.md;

  const accentBorder = accent
    ? { borderLeftWidth: 3, borderLeftColor: colors.primary }
    : {};

  // Strip elevation on Android — it creates gray outlines with borderRadius + overflow:hidden
  const effectiveShadow = Platform.OS === 'android' ? { ...shadow, elevation: 0 } : shadow;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bgColor },
        effectiveShadow,
        borderStyle,
        accentBorder,
        style,
        noPadding && styles.noPadding,
      ]}
    >
      <View style={[styles.content, noPadding && styles.noPadding]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
  },
  content: {
    padding: tokens.spacing.md,
  },
  noPadding: {
    padding: 0,
  },
});
