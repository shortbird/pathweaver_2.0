/**
 * GlassBackground - Screen background layer (Spotlight).
 *
 * Two soft radial glows (purple upper-left, pink lower-right) over the
 * theme background color, with a slow drift animation that adds a living
 * quality. Disabled when Reduce Motion is enabled.
 *
 * SVG gradient IDs are unique per instance (via useId) so multiple
 * GlassBackground components can coexist on web without collisions.
 */

import React, { useEffect, useId } from 'react';
import { StyleSheet, View, ViewStyle, Dimensions, Platform } from 'react-native';
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
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const DRIFT_MAX = 10;
const SVG_W = SCREEN_W + DRIFT_MAX * 2;
const SVG_H = SCREEN_H + DRIFT_MAX * 2;

interface GlassBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

// ── Spotlight background ────────────────────────────────────

function Spotlight({ mode, uid }: { mode: 'light' | 'dark'; uid: string }) {
  const isNative = Platform.OS !== 'web';

  // Native SVG renders radial gradients much more opaquely than web
  const primaryColor = mode === 'dark'
    ? 'rgba(109, 70, 155, 0.25)'
    : 'rgba(109, 70, 155, 0.14)';
  const secondaryColor = mode === 'dark'
    ? 'rgba(199, 75, 139, 0.18)'
    : 'rgba(239, 89, 123, 0.09)';
  // On native, use opacity on the Rect instead of in the color to get the right intensity
  const nativeOpacity = isNative ? 0.35 : 1;

  const id1 = `spot1_${uid}`;
  const id2 = `spot2_${uid}`;

  return (
    <Svg width={SVG_W} height={SVG_H}>
      <Defs>
        <RadialGradient id={id1} cx="0.3" cy="0.25" rx="0.75" ry="0.6" fx="0.3" fy="0.25">
          <Stop offset="0" stopColor={primaryColor} />
          <Stop offset="0.5" stopColor={primaryColor} />
          <Stop offset="1" stopColor={primaryColor} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={id2} cx="0.8" cy="0.7" rx="0.55" ry="0.45" fx="0.8" fy="0.7">
          <Stop offset="0" stopColor={secondaryColor} />
          <Stop offset="0.45" stopColor={secondaryColor} />
          <Stop offset="1" stopColor={secondaryColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id1})`} opacity={nativeOpacity} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id2})`} opacity={nativeOpacity} />
    </Svg>
  );
}

// ── Main component ───────────────────────────────────────────

export function GlassBackground({ children, style }: GlassBackgroundProps) {
  const uid = useId().replace(/:/g, '');
  const { mode, colors } = useThemeStore();
  const { reduceMotion } = useAccessibilitySettings();

  const driftX = useSharedValue(0);
  const driftY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
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
  }, [reduceMotion]);

  const blobAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: driftX.value },
      { translateY: driftY.value },
    ],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }, style]}>
      <Animated.View style={[styles.blobContainer, blobAnimatedStyle]} pointerEvents="none">
        <Spotlight mode={mode} uid={uid} />
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
