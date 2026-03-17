/**
 * ScrollEdgeEffect - Scroll container with dissolve edge under glass nav.
 *
 * Content fades into the background as it scrolls under the navigation layer.
 * When scrolled, the shadow on the glass nav deepens slightly.
 * Disabled under Reduce Motion (uses hard clip instead).
 */

import React, { useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
  NativeSyntheticEvent,
  NativeScrollEvent,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';
import { tokens } from '../../theme/tokens';

interface ScrollEdgeEffectProps {
  children: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  fadeHeight?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  showsVerticalScrollIndicator?: boolean;
}

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export function ScrollEdgeEffect({
  children,
  style,
  contentContainerStyle,
  fadeHeight = 24,
  refreshing,
  onRefresh,
  showsVerticalScrollIndicator = false,
}: ScrollEdgeEffectProps) {
  const { colors } = useThemeStore();
  const { reduceMotion } = useAccessibilitySettings();
  const scrollY = useSharedValue(0);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  }, []);

  const fadeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, fadeHeight],
      [0, 1],
      'clamp',
    );
    return { opacity: reduceMotion ? (scrollY.value > 0 ? 1 : 0) : opacity };
  });

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={contentContainerStyle}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing || false} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>

      {/* Top fade gradient overlay */}
      <Animated.View style={[styles.fadeOverlay, { height: fadeHeight }, fadeStyle]} pointerEvents="none">
        <LinearGradient
          colors={[colors.background, colors.background + '00']}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  fadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
