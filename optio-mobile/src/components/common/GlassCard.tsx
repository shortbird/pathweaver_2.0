/**
 * GlassCard - Base card component with glass morphism effect.
 *
 * All cards in the app extend this: BountyCard, JournalEntryCard, ShopItemCard, FeedItemCard.
 * Uses expo-blur for the glass effect (cross-platform fallback for Liquid Glass).
 */

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { tokens } from '../../theme/tokens';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  noPadding?: boolean;
}

export function GlassCard({ children, style, intensity = tokens.blur.light, noPadding }: GlassCardProps) {
  return (
    <View style={[styles.container, style]}>
      <BlurView intensity={intensity} style={styles.blur} tint="light">
        <View style={[styles.content, noPadding && styles.noPadding]}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.glass.border,
    ...tokens.shadows.md,
  },
  blur: {
    flex: 1,
  },
  content: {
    padding: tokens.spacing.md,
    backgroundColor: tokens.colors.glass.backgroundSolid,
  },
  noPadding: {
    padding: 0,
  },
});
