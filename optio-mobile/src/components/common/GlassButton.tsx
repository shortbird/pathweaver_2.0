/**
 * GlassButton - Button with liquid glass effect.
 *
 * Primary variant: gradient fill (purple) with glass overlay
 * Outline variant: glass-style with subtle border
 * Ghost variant: text-only on dark backgrounds
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  Platform,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../theme/tokens';

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
  const isDisabled = disabled || loading;
  const sz = sizeConfig[size];

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.8}
        style={[{ borderRadius: tokens.radius.xl, overflow: 'hidden', opacity: isDisabled ? 0.4 : 1 }, style]}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <LinearGradient
          colors={[tokens.colors.primary, tokens.colors.accent]}
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
      </TouchableOpacity>
    );
  }

  if (variant === 'outline') {
    const content = (
      <>
        {loading ? (
          <ActivityIndicator color={tokens.colors.text} size="small" />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={sz.iconSize} color={tokens.colors.text} style={styles.icon} />}
            <Text style={[styles.outlineText, sz.text]}>{title}</Text>
          </>
        )}
      </>
    );

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
        style={[styles.outlineContainer, sz.inner, { opacity: isDisabled ? 0.4 : 1 }, style]}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        {content}
      </TouchableOpacity>
    );
  }

  // ghost
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.6}
      style={[styles.ghost, sz.inner, { opacity: isDisabled ? 0.4 : 1 }, style]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon && <Ionicons name={icon} size={sz.iconSize} color={tokens.colors.text} style={styles.icon} />}
      <Text style={[styles.ghostText, sz.text]}>{title}</Text>
    </TouchableOpacity>
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
    borderColor: tokens.colors.glass.border,
    backgroundColor: tokens.colors.glass.background,
  },
  outlineText: {
    color: tokens.colors.text,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    color: tokens.colors.text,
    fontFamily: tokens.typography.fonts.medium,
  },
});
