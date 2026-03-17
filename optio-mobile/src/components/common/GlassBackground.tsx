/**
 * GlassBackground - Screen background with colored fields behind glass.
 *
 * Two variants to compare:
 *   'radial'  – Large radial color fields (soft spotlight pools at edges)
 *   'linear'  – Layered linear gradients at different angles
 *
 * Change VARIANT below to switch. Both read from themeStore for light/dark.
 */

import React from 'react';
import { StyleSheet, View, ViewStyle, Dimensions } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Rect,
  Ellipse,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore, type BlobColors } from '../../stores/themeStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Change this to 'radial' or 'linear' to compare ──────────
const VARIANT: 'radial' | 'linear' = 'radial';

interface GlassBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

// ── Option 3: Large radial color fields ──────────────────────
// Soft spotlight-like pools of color placed at screen edges.
// No defined shapes -- just colored light washing across.

function RadialFields({ blobColors }: { blobColors: BlobColors }) {
  return (
    <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
      <Defs>
        {/* Upper-left warm pool -- large radius, holds color to 60% */}
        <RadialGradient id="radial1" cx="0.15" cy="0.1" rx="0.8" ry="0.65" fx="0.15" fy="0.1">
          <Stop offset="0" stopColor={blobColors.chevron[0]} />
          <Stop offset="0.6" stopColor={blobColors.chevron[0]} />
          <Stop offset="1" stopColor={blobColors.chevron[1]} stopOpacity="0" />
        </RadialGradient>

        {/* Right-center accent pool -- large radius, holds color to 55% */}
        <RadialGradient id="radial2" cx="0.9" cy="0.4" rx="0.75" ry="0.6" fx="0.9" fy="0.4">
          <Stop offset="0" stopColor={blobColors.rings[0]} />
          <Stop offset="0.55" stopColor={blobColors.rings[0]} />
          <Stop offset="1" stopColor={blobColors.rings[1]} stopOpacity="0" />
        </RadialGradient>

        {/* Bottom-left cool pool -- large radius, holds color to 50% */}
        <RadialGradient id="radial3" cx="0.2" cy="0.85" rx="0.8" ry="0.55" fx="0.2" fy="0.85">
          <Stop offset="0" stopColor={blobColors.wave2[0]} />
          <Stop offset="0.5" stopColor={blobColors.wave2[0]} />
          <Stop offset="1" stopColor={blobColors.wave2[1]} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Rect x="0" y="0" width="100%" height="100%" fill="url(#radial1)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#radial2)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#radial3)" />
    </Svg>
  );
}

// ── Option 4: Layered linear gradients at angles ─────────────
// Full-screen linear gradients stacked at different angles
// with varying opacity. Clean and minimal.

function LinearLayers({ blobColors }: { blobColors: BlobColors }) {
  return (
    <>
      {/* Base layer: top-left to bottom-right, purple */}
      <LinearGradient
        colors={[blobColors.chevron[0], 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Mid layer: top-right to bottom-left, pink-purple */}
      <LinearGradient
        colors={[blobColors.rings[0], 'transparent']}
        start={{ x: 1, y: 0.15 }}
        end={{ x: 0.1, y: 0.85 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Bottom layer: bottom-center upward, accent wash */}
      <LinearGradient
        colors={['transparent', blobColors.wave2[0], 'transparent']}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0.3 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle cross layer for depth */}
      <LinearGradient
        colors={[blobColors.wave3[0], 'transparent']}
        start={{ x: 0, y: 0.6 }}
        end={{ x: 1, y: 0.2 }}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

// ── Main component ───────────────────────────────────────────

export function GlassBackground({ children, style }: GlassBackgroundProps) {
  const { colors, blobColors } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }, style]}>
      <View style={styles.blobContainer} pointerEvents="none">
        {VARIANT === 'radial' ? (
          <RadialFields blobColors={blobColors} />
        ) : (
          <LinearLayers blobColors={blobColors} />
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blobContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});
