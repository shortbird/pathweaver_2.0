/**
 * GlassButton - Button with liquid glass interaction physics.
 *
 * Primary: purple-to-pink tinted glass (not solid gradient)
 * Outline: thin glass material
 * Ghost: text-only, no glass
 *
 * Touch response: scale 0.97x with spring physics + glow bloom.
 * Accessibility: respects Reduce Motion (no springs, no glow).
 */

import React, { useCallback } from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  Platform,
  View,
  GestureResponderEvent,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';
import { springTouch, springDefault } from '../../utils/glassAnimations';

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GlassButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  style,
}: GlassButtonProps) {
  const { colors } = useThemeStore();
  const { reduceMotion, highContrast } = useAccessibilitySettings();
  const isDisabled = disabled || loading;
  const sz = sizeConfig[size];
  const pressed = useSharedValue(0);

  const handlePressIn = useCallback(() => {
    if (reduceMotion) {
      pressed.value = 1;
      return;
    }
    pressed.value = withSpring(1, springTouch);
  }, [reduceMotion]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) {
      pressed.value = 0;
      return;
    }
    pressed.value = withSpring(0, springDefault);
  }, [reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(pressed.value, [0, 1], [1, 0.97]);
    return { transform: [{ scale }] };
  });

  if (variant === 'primary') {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          animatedStyle,
          {
            borderRadius: tokens.radius.xl,
            overflow: 'hidden',
            opacity: isDisabled ? 0.4 : 1,
          },
          highContrast && {
            borderWidth: 2,
            borderColor: '#FFF',
          },
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: isDisabled }}
      >
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.inner, sz.inner]}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              {icon && <Ionicons name={icon} size={sz.iconSize} color="#FFF" style={styles.icon} />}
              <Text style={[styles.primaryText, sz.text]}>{title}</Text>
            </>
          )}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  if (variant === 'outline') {
    const content = (
      <>
        {loading ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={sz.iconSize} color={colors.text} style={styles.icon} />}
            <Text style={[styles.outlineText, { color: colors.text }, sz.text]}>{title}</Text>
          </>
        )}
      </>
    );

    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          animatedStyle,
          styles.outlineContainer,
          sz.inner,
          {
            borderColor: highContrast ? colors.text : colors.glass.thinBorder,
            backgroundColor: colors.glass.thinBackground,
            opacity: isDisabled ? 0.4 : 1,
          },
          highContrast && { borderWidth: 2 },
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: isDisabled }}
      >
        {content}
      </AnimatedPressable>
    );
  }

  // ghost
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        animatedStyle,
        styles.ghost,
        sz.inner,
        { opacity: isDisabled ? 0.4 : 1 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled }}
    >
      {icon && <Ionicons name={icon} size={sz.iconSize} color={colors.text} style={styles.icon} />}
      <Text style={[styles.ghostText, { color: colors.text }, sz.text]}>{title}</Text>
    </AnimatedPressable>
  );
}

const sizeConfig = {
  sm: {
    inner: { paddingVertical: tokens.spacing.xs + 2, paddingHorizontal: tokens.spacing.md },
    text: { fontSize: tokens.typography.sizes.sm },
    iconSize: 16,
  },
  md: {
    inner: { paddingVertical: tokens.spacing.sm + 4, paddingHorizontal: tokens.spacing.lg },
    text: { fontSize: tokens.typography.sizes.md },
    iconSize: 18,
  },
  lg: {
    inner: { paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.xl },
    text: { fontSize: tokens.typography.sizes.lg },
    iconSize: 22,
  },
} as const;

const styles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.xl,
  },
  icon: {
    marginRight: tokens.spacing.sm,
  },
  primaryText: {
    color: '#FFF',
    fontFamily: tokens.typography.fonts.semiBold,
  },
  outlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.xl,
    borderWidth: 0.5,
  },
  outlineText: {
    fontFamily: tokens.typography.fonts.semiBold,
  },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    fontFamily: tokens.typography.fonts.medium,
  },
});
