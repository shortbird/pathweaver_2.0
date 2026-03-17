/**
 * GlassCard - Translucent card with liquid glass effect.
 *
 * Adapts to light/dark theme via themeStore.
 * Light: frosted white glass. Dark: subtle translucent glass.
 */

import React from 'react';
import { StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  noPadding?: boolean;
  accent?: boolean;
}

export function GlassCard({ children, style, intensity = tokens.blur.medium, noPadding, accent }: GlassCardProps) {
  const { colors } = useThemeStore();

  const containerStyle = [
    styles.container,
    {
      borderColor: colors.glass.border,
      shadowColor: colors.glass.shadow,
    },
    style,
  ];

  const highlightColor = accent
    ? 'rgba(109, 70, 155, 0.3)'
    : colors.glass.highlight;

  if (Platform.OS === 'web') {
    return (
      <View style={[...containerStyle, {
        // @ts-ignore web-only
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        backgroundColor: colors.glass.background,
      } as any]}>
        <LinearGradient
          colors={[highlightColor, 'rgba(255, 255, 255, 0.0)']}
          style={styles.specularHighlight}
        />
        <View style={[styles.content, noPadding && styles.noPadding]}>
          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <BlurView intensity={intensity} style={styles.blur} tint={colors.blurTint}>
        <LinearGradient
          colors={[highlightColor, 'rgba(255, 255, 255, 0.0)']}
          style={styles.specularHighlight}
        />
        <View style={[styles.innerFill, { backgroundColor: colors.glass.background }, styles.content, noPadding && styles.noPadding]}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    borderWidth: 0.5,
    ...tokens.shadows.md,
  },
  specularHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  blur: {
    flex: 1,
  },
  innerFill: {},
  content: {
    padding: tokens.spacing.md,
  },
  noPadding: {
    padding: 0,
  },
});
