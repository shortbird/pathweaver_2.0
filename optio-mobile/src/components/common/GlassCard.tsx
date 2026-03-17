/**
 * GlassContainer (also exported as GlassCard for backwards compat)
 *
 * Translucent glass material for the NAVIGATION/CONTROLS layer only.
 * Do NOT use for content cards -- use SurfaceCard instead.
 *
 * Responds to accessibility settings:
 *   - Reduce Transparency: near-opaque, heavy blur
 *   - Increased Contrast: solid bg + 2px border
 *   - Reduce Motion: no specular animation
 */

import React from 'react';
import { StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';

interface GlassContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  noPadding?: boolean;
  accent?: boolean;
  /** Use thin glass variant (less blur, no specular) */
  thin?: boolean;
}

export function GlassContainer({
  children,
  style,
  intensity = tokens.blur.medium,
  noPadding,
  accent,
  thin,
}: GlassContainerProps) {
  const { colors } = useThemeStore();
  const { reduceTransparency, highContrast } = useAccessibilitySettings();

  const effectiveIntensity = reduceTransparency ? tokens.blur.heavy : (thin ? tokens.blur.light : intensity);
  const bgColor = reduceTransparency
    ? (colors.blurTint === 'dark' ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)')
    : (thin ? colors.glass.thinBackground : colors.glass.background);
  const borderColor = highContrast
    ? colors.text
    : (thin ? colors.glass.thinBorder : colors.glass.border);
  const borderWidth = highContrast ? 2 : 0.5;
  const showSpecular = !thin && !highContrast;

  const highlightColor = accent
    ? 'rgba(109, 70, 155, 0.3)'
    : colors.glass.highlight;

  const containerStyle = [
    styles.container,
    {
      borderColor,
      borderWidth,
      shadowColor: colors.glass.shadow,
    },
    !thin && tokens.shadows.md,
    style,
  ];

  // High contrast: fully opaque, no blur
  if (highContrast) {
    return (
      <View style={[...containerStyle, { backgroundColor: colors.blurTint === 'dark' ? '#000' : '#FFF' }]}>
        <View style={[styles.content, noPadding && styles.noPadding]}>
          {children}
        </View>
      </View>
    );
  }

  // Web fallback: CSS backdrop-filter
  if (Platform.OS === 'web') {
    return (
      <View style={[...containerStyle, {
        // @ts-ignore web-only
        backdropFilter: `blur(${effectiveIntensity}px)`,
        WebkitBackdropFilter: `blur(${effectiveIntensity}px)`,
        backgroundColor: bgColor,
      } as any]}>
        {showSpecular && (
          <LinearGradient
            colors={[highlightColor, 'rgba(255, 255, 255, 0.0)']}
            style={styles.specularHighlight}
          />
        )}
        <View style={[styles.content, noPadding && styles.noPadding]}>
          {children}
        </View>
      </View>
    );
  }

  // Native: BlurView
  return (
    <View style={containerStyle}>
      <BlurView intensity={effectiveIntensity} style={styles.blur} tint={colors.blurTint}>
        {showSpecular && (
          <LinearGradient
            colors={[highlightColor, 'rgba(255, 255, 255, 0.0)']}
            style={styles.specularHighlight}
          />
        )}
        <View style={[styles.innerFill, { backgroundColor: bgColor }, styles.content, noPadding && styles.noPadding]}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

/** @deprecated Use GlassContainer for glass-layer elements, SurfaceCard for content-layer */
export const GlassCard = GlassContainer;

const styles = StyleSheet.create({
  container: {
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
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
