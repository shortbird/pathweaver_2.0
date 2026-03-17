/**
 * Capture Screen - Full-screen multi-mode learning capture.
 *
 * Wraps the unified QuickCapture component in a GlassBackground with
 * a scroll container. All capture logic lives in QuickCapture.
 */

import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { tokens } from '../theme/tokens';
import { GlassBackground } from '../components/common/GlassBackground';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { QuickCapture } from '../components/capture/QuickCapture';
import { useThemeStore } from '../stores/themeStore';

export function CaptureScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation();

  return (
    <GlassBackground style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.text }]}>Capture</Text>

        <SurfaceCard>
          <QuickCapture
            initialMode="photo"
            onSaved={() => navigation.goBack()}
          />
        </SurfaceCard>
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: tokens.spacing.md,
  },
  scroll: {
    paddingBottom: tokens.spacing.xxl + 40,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontFamily: tokens.typography.fonts.bold,
    marginBottom: tokens.spacing.md,
  },
});
