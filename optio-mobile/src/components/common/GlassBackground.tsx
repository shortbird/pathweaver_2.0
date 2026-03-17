/**
 * GlassBackground - Screen background layer.
 *
 * Variants (change VARIANT below to compare):
 *   'ambientLight'  -- Option A: Soft directional warmth, top-to-bottom
 *   'spotlight'      -- Option B: Mostly solid with one faint radial glow
 *   'radial'         -- Original: Multiple colored radial blobs
 *   'linear'         -- Original: Layered linear gradients
 *
 * Slow drift animation on the background layer adds a living quality.
 * Disabled when Reduce Motion is enabled.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, Dimensions } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore, type BlobColors } from '../../stores/themeStore';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Switch this to compare ───────────────────────────────────
const VARIANT: 'ambientLight' | 'spotlight' | 'radial' | 'linear' = 'spotlight';

const DRIFT_MAX = 10;
const SVG_W = SCREEN_W + DRIFT_MAX * 2;
const SVG_H = SCREEN_H + DRIFT_MAX * 2;

interface GlassBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

// ── Option A: Ambient Light ──────────────────────────────────
// Soft directional gradient -- warm lavender at top fading to cool white.
// No shapes, no blobs. Just natural light falling on a surface.
// Glass elements create the visual depth, not the background.

function AmbientLight({ mode }: { mode: 'light' | 'dark' }) {
  if (mode === 'dark') {
    return (
      <LinearGradient
        colors={[
          'rgba(109, 70, 155, 0.12)',  // Faint warm purple at top
          'rgba(13, 15, 26, 0.0)',     // Transparent (base bg shows through)
          'rgba(43, 165, 165, 0.06)',  // Barely-there cool teal at bottom
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }

  return (
    <LinearGradient
      colors={[
        'rgba(109, 70, 155, 0.08)',  // Barely-there warm purple at top
        'rgba(238, 234, 244, 0.0)',  // Transparent mid (base bg is the star)
        'rgba(239, 89, 123, 0.04)', // Whisper of pink-rose at bottom
      ]}
      locations={[0, 0.45, 1]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}

// ── Option B: Spotlight ──────────────────────────────────────
// Mostly solid background with one very faint, large radial glow
// centered behind content. Like a soft spotlight on a stage.

function Spotlight({ mode }: { mode: 'light' | 'dark' }) {
  // Primary glow: warm purple, upper-left bias
  const primaryColor = mode === 'dark'
    ? 'rgba(109, 70, 155, 0.25)'
    : 'rgba(109, 70, 155, 0.14)';
  // Secondary glow: warm pink-rose, lower-right to create tonal contrast
  const secondaryColor = mode === 'dark'
    ? 'rgba(199, 75, 139, 0.18)'
    : 'rgba(239, 89, 123, 0.09)';

  return (
    <Svg width={SVG_W} height={SVG_H}>
      <Defs>
        {/* Primary: large warm glow, offset upper-left */}
        <RadialGradient id="spot1" cx="0.3" cy="0.25" rx="0.75" ry="0.6" fx="0.3" fy="0.25">
          <Stop offset="0" stopColor={primaryColor} />
          <Stop offset="0.5" stopColor={primaryColor} />
          <Stop offset="1" stopColor={primaryColor} stopOpacity="0" />
        </RadialGradient>
        {/* Secondary: smaller warm accent, lower-right */}
        <RadialGradient id="spot2" cx="0.8" cy="0.7" rx="0.55" ry="0.45" fx="0.8" fy="0.7">
          <Stop offset="0" stopColor={secondaryColor} />
          <Stop offset="0.45" stopColor={secondaryColor} />
          <Stop offset="1" stopColor={secondaryColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#spot1)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#spot2)" />
    </Svg>
  );
}

// ── Original: Radial color fields ────────────────────────────

function RadialFields({ blobColors }: { blobColors: BlobColors }) {
  return (
    <Svg width={SVG_W} height={SVG_H}>
      <Defs>
        <RadialGradient id="radial1" cx="0.15" cy="0.1" rx="0.8" ry="0.65" fx="0.15" fy="0.1">
          <Stop offset="0" stopColor={blobColors.chevron[0]} />
          <Stop offset="0.6" stopColor={blobColors.chevron[0]} />
          <Stop offset="1" stopColor={blobColors.chevron[1]} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="radial2" cx="0.9" cy="0.4" rx="0.75" ry="0.6" fx="0.9" fy="0.4">
          <Stop offset="0" stopColor={blobColors.rings[0]} />
          <Stop offset="0.55" stopColor={blobColors.rings[0]} />
          <Stop offset="1" stopColor={blobColors.rings[1]} stopOpacity="0" />
        </RadialGradient>
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

// ── Original: Linear gradient layers ─────────────────────────

function LinearLayers({ blobColors }: { blobColors: BlobColors }) {
  return (
    <>
      <LinearGradient
        colors={[blobColors.chevron[0], 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[blobColors.rings[0], 'transparent']}
        start={{ x: 1, y: 0.15 }}
        end={{ x: 0.1, y: 0.85 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', blobColors.wave2[0], 'transparent']}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0.3 }}
        style={StyleSheet.absoluteFill}
      />
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
  const { mode, colors, blobColors } = useThemeStore();
  const { reduceMotion } = useAccessibilitySettings();

  const driftX = useSharedValue(0);
  const driftY = useSharedValue(0);

  // Only drift for variants that have visible shapes to move
  const shouldDrift = VARIANT === 'radial' || VARIANT === 'spotlight';

  useEffect(() => {
    if (reduceMotion || !shouldDrift) {
      driftX.value = 0;
      driftY.value = 0;
      return;
    }

    driftX.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-8, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    driftY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 11000, easing: Easing.inOut(Easing.sin) }),
        withTiming(6, { duration: 11000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [reduceMotion, shouldDrift]);

  const blobAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: driftX.value },
      { translateY: driftY.value },
    ],
  }));

  const renderBackground = () => {
    switch (VARIANT) {
      case 'ambientLight':
        return <AmbientLight mode={mode} />;
      case 'spotlight':
        return <Spotlight mode={mode} />;
      case 'radial':
        return <RadialFields blobColors={blobColors} />;
      case 'linear':
        return <LinearLayers blobColors={blobColors} />;
    }
  };

  // ambientLight uses a simple LinearGradient that fills the screen -- no drift needed
  if (VARIANT === 'ambientLight') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, style]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {renderBackground()}
        </View>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }, style]}>
      <Animated.View style={[styles.blobContainer, blobAnimatedStyle]} pointerEvents="none">
        {renderBackground()}
      </Animated.View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  blobContainer: {
    position: 'absolute',
    top: -DRIFT_MAX,
    left: -DRIFT_MAX,
    width: SVG_W,
    height: SVG_H,
  },
});
