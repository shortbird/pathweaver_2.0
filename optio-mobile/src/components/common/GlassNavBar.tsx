/**
 * GlassNavBar - Glass material header for stack navigation screens.
 *
 * Replaces default opaque headers with a glass surface featuring:
 *   - BlurView background with specular highlight
 *   - Adaptive shadow that deepens when content scrolls beneath
 *   - Back button + title on the glass surface
 *
 * Lives in the GLASS LAYER (navigation), not content layer.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';
import { useAccessibilitySettings } from '../../hooks/useAccessibilitySettings';

interface GlassNavBarProps {
  title: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
}

export function GlassNavBar({ title, onBack, rightElement }: GlassNavBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const { reduceTransparency, highContrast } = useAccessibilitySettings();

  const topPadding = Platform.OS === 'web' ? 16 : insets.top;

  // Accessibility: solid background when transparency is reduced
  if (reduceTransparency || Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: topPadding,
            backgroundColor: highContrast ? (colors.blurTint === 'dark' ? '#000' : '#FFF') : colors.background,
            borderBottomWidth: highContrast ? 2 : 0.5,
            borderBottomColor: highContrast ? colors.text : colors.glass.borderLight,
          },
        ]}
      >
        <View style={styles.content}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <View style={styles.rightSlot}>{rightElement}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <BlurView
        intensity={tokens.blur.medium}
        tint={colors.blurTint}
        style={StyleSheet.absoluteFill}
      />
      {/* Specular highlight */}
      <LinearGradient
        colors={[colors.glass.highlight, 'rgba(255, 255, 255, 0.0)']}
        style={styles.specular}
      />
      {/* Semi-transparent fill */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass.background }]} />
      {/* Bottom border */}
      <View style={[styles.borderLine, { backgroundColor: colors.glass.borderLight }]} />

      <View style={styles.content}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <View style={styles.rightSlot}>{rightElement}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  specular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  borderLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: tokens.spacing.md,
  },
  backButton: {
    marginRight: tokens.spacing.sm,
    padding: tokens.spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
