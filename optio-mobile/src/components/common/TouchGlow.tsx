/**
 * TouchGlow - Touch-point light bloom effect for glass-layer elements.
 *
 * Wraps an interactive element and renders a radial glow at the touch point.
 * The glow expands outward and fades on release.
 * Disabled when Reduce Motion is enabled.
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';

interface TouchGlowProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  glowColor?: string;
  glowRadius?: number;
  activeOpacity?: number;
  accessibilityRole?: 'button' | 'link' | 'tab';
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function TouchGlow({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  glowColor = 'rgba(255, 255, 255, 0.3)',
  glowRadius = 60,
  activeOpacity = 0.97,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
}: TouchGlowProps) {
  const { reduceMotion } = useAccessibilitySettings();
  const pressed = useSharedValue(0);
  const glowX = useSharedValue(0);
  const glowY = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  const handlePressIn = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    glowX.value = locationX;
    glowY.value = locationY;

    if (reduceMotion) {
      pressed.value = 1;
      return;
    }

    pressed.value = withSpring(1, { damping: 20, stiffness: 300 });
    glowOpacity.value = withTiming(1, { duration: 100 });
  }, [reduceMotion]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) {
      pressed.value = 0;
      return;
    }

    pressed.value = withSpring(0, { damping: 15, stiffness: 150 });
    glowOpacity.value = withTiming(0, { duration: 200 });
  }, [reduceMotion]);

  const containerStyle = useAnimatedStyle(() => {
    const scale = interpolate(pressed.value, [0, 1], [1, activeOpacity]);
    return { transform: [{ scale }] };
  });

  const glowStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0 };
    return {
      opacity: glowOpacity.value,
      transform: [
        { translateX: glowX.value - glowRadius },
        { translateY: glowY.value - glowRadius },
        { scale: interpolate(pressed.value, [0, 1], [0.5, 1]) },
      ],
    };
  });

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[containerStyle, style]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
    >
      {children}
      {!reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              width: glowRadius * 2,
              height: glowRadius * 2,
              borderRadius: glowRadius,
              backgroundColor: glowColor,
            },
            glowStyle,
          ]}
        />
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
  },
});
