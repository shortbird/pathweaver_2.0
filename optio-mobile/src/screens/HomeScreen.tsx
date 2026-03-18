/**
 * Home Screen - Buddy companion + quick action buttons.
 *
 * Liquid glass aesthetic throughout. GlassBackground, SurfaceCard, GlassButton.
 * Vitality and bond are hidden stats -- the buddy's appearance communicates them.
 * Superadmin gets a debug panel to adjust vitality/bond/stage.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { tokens, textStyles } from '../theme/tokens';
import { icons } from '../theme/icons';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassButton } from '../components/common/GlassButton';
import { GlassBackground } from '../components/common/GlassBackground';
import OptioBuddy from '../components/buddy/OptioBuddy';
import useBuddyState from '../components/buddy/useBuddyState';
import { FOOD_CATALOG, STAGE_PALETTES } from '../components/buddy/buddyConstants';
import { QuickCapture, CaptureMode } from '../components/capture/QuickCapture';
import { useAuthStore } from '../stores/authStore';
import { useBuddyStore } from '../stores/buddyStore';
import { useThemeStore } from '../stores/themeStore';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

export function HomeScreen() {
  const { user, logout } = useAuthStore();
  const { buddy, isLoading, loadBuddy, createBuddy, feedBuddy, tapBuddy, updateBuddy } =
    useBuddyStore();
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [showCreate, setShowCreate] = useState(false);
  const [buddyName, setBuddyName] = useState('');
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Scroll to bottom when capture opens or mode changes
  useEffect(() => {
    if (captureMode) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [captureMode]);
  const navigation = useNavigation<any>();

  const isSuperadmin = user?.role === 'superadmin';

  useEffect(() => {
    loadBuddy();
  }, []);

  const handleCreate = useCallback(async () => {
    if (!buddyName.trim()) return;
    try {
      await createBuddy(buddyName.trim());
      setShowCreate(false);
      setBuddyName('');
    } catch {
      // Error shown via store
    }
  }, [buddyName, createBuddy]);

  if (isLoading) {
    return (
      <GlassBackground style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </GlassBackground>
    );
  }

  return (
    <GlassBackground style={styles.container}>
      {/* Top app bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Image source={{ uri: LOGO_URI }} style={styles.topLogo} resizeMode="contain" />
        <TouchableOpacity
          onPress={logout}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={styles.logoutBtn}
        >
          <Ionicons name={icons.logout as any} size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        style={styles.scrollView}
      >
        <Text style={[styles.greeting, { color: colors.text }]}>
          Hey, {user?.first_name || user?.display_name?.split(' ')[0] || 'there'}!
        </Text>

        {buddy ? (
          <BuddySection
            buddy={buddy}
            colors={colors}
            navigation={navigation}
            feedBuddy={feedBuddy}
            tapBuddy={tapBuddy}
            updateBuddy={updateBuddy}
            isSuperadmin={isSuperadmin}
          />
        ) : (
          <SurfaceCard style={styles.noPetCard}>
            {showCreate ? (
              <View>
                <Text style={[styles.noPetText, { color: colors.text }]}>Name your buddy</Text>
                <TextInput
                  value={buddyName}
                  onChangeText={setBuddyName}
                  placeholder="Enter a name..."
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.nameInput,
                    {
                      color: colors.text,
                      borderColor: colors.glass.border,
                      backgroundColor: colors.glass.background,
                    },
                  ]}
                  maxLength={30}
                  autoFocus
                  onSubmitEditing={handleCreate}
                />
                <View style={styles.createActions}>
                  <GlassButton
                    title="Cancel"
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      setShowCreate(false);
                      setBuddyName('');
                    }}
                  />
                  <GlassButton
                    title="Hatch!"
                    size="sm"
                    onPress={handleCreate}
                    disabled={!buddyName.trim()}
                  />
                </View>
              </View>
            ) : (
              <View>
                <Text style={[styles.eggEmoji]}>🥚</Text>
                <Text style={[styles.noPetText, { color: colors.textSecondary }]}>
                  Your buddy egg is waiting...
                </Text>
                <GlassButton
                  title="Hatch Your Buddy"
                  onPress={() => setShowCreate(true)}
                  icon="egg-outline"
                />
              </View>
            )}
          </SurfaceCard>
        )}

        <View style={styles.quickActions}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Capture</Text>

          {captureMode ? (
            <SurfaceCard>
              <QuickCapture
                initialMode={captureMode}
                onSaved={() => setCaptureMode(null)}
                onCancel={() => setCaptureMode(null)}
                onModeChange={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
              />
            </SurfaceCard>
          ) : (
            <View style={styles.actionRow}>
              <ActionButton
                label="Camera"
                iconName={icons.photo}
                color={colors.pillars.art}
                onPress={() => setCaptureMode('camera')}
              />
              <ActionButton
                label="Voice"
                iconName={icons.voice}
                color={colors.pillars.communication}
                onPress={() => setCaptureMode('voice')}
              />
              <ActionButton
                label="Text"
                iconName={icons.text}
                color={colors.pillars.stem}
                onPress={() => setCaptureMode('text')}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </GlassBackground>
  );
}

// ── Buddy Section ──

function BuddySection({
  buddy,
  colors,
  navigation,
  feedBuddy,
  tapBuddy,
  updateBuddy,
  isSuperadmin,
}: {
  buddy: any;
  colors: any;
  navigation: any;
  feedBuddy: (foodId: string, xpCost: number, v: number, b: number, txp: number, xpt: number) => Promise<void>;
  tapBuddy: (bond: number) => Promise<void>;
  updateBuddy: (u: any) => Promise<void>;
  isSuperadmin: boolean;
}) {
  const {
    vitality,
    bond,
    stage,
    xpFedToday,
    isFull,
    feedsRemaining,
    feedReaction,
    tapBurst,
    feed,
    tap,
    checkEvolution,
    setVitality,
    setBond,
    setStage,
  } = useBuddyState({
    name: buddy.name,
    vitality: buddy.vitality,
    bond: buddy.bond,
    stage: buddy.stage,
    highest_stage: buddy.highest_stage,
    last_interaction: buddy.last_interaction,
    food_journal: buddy.food_journal,
    equipped: buddy.equipped || {},
    wallet: buddy.wallet,
    total_xp_fed: buddy.total_xp_fed || 0,
    xp_fed_today: buddy.xp_fed_today || 0,
    last_fed_date: buddy.last_fed_date,
  });

  const [showAdmin, setShowAdmin] = useState(false);
  const palette = STAGE_PALETTES[stage];

  const handleTap = useCallback(() => {
    const result = tap();
    if (!result) return;
    tapBuddy(result.newBond);
  }, [tap, tapBuddy]);

  const handleFeed = useCallback(
    (food: (typeof FOOD_CATALOG)[number]) => {
      const result = feed(food);
      if (!result) return;

      feedBuddy(result.foodId, result.xpCost, result.newVitality, result.newBond, result.newTotalXpFed, result.newXpFedToday);

      if (result.didHatch) {
        updateBuddy({
          stage: 1,
          highest_stage: Math.max(buddy.highest_stage, 1),
        });
      }

      setTimeout(() => {
        const evolution = checkEvolution();
        if (evolution) {
          updateBuddy({
            stage: evolution.newStage,
            highest_stage: Math.max(buddy.highest_stage, evolution.newStage),
          });
        }
      }, 2200);
    },
    [feed, feedBuddy, checkEvolution, updateBuddy, buddy],
  );

  return (
    <View>
      {/* Buddy character */}
      <View style={styles.buddyContainer}>
        <OptioBuddy
          vitality={vitality}
          bond={bond}
          stage={stage}
          onTap={handleTap}
          feedReaction={feedReaction}
          tapBurst={tapBurst}
          width={280}
          height={154}
        />
      </View>

      {/* Name + stage label */}
      <Text style={[styles.buddyName, { color: colors.text }]}>{buddy.name}</Text>
      <Text style={[styles.stageLabel, { color: colors.primary }]}>{palette.name}</Text>

      {/* Hunger + Feed card */}
      <SurfaceCard style={styles.feedCard}>
        {/* Hunger bar */}
        <View style={styles.hungerLabelRow}>
          <Text style={[styles.hungerLabel, { color: colors.textSecondary }]}>Hunger</Text>
          <Text style={[styles.hungerLabel, { color: colors.textSecondary }]}>
            {feedsRemaining} feed{feedsRemaining !== 1 ? 's' : ''} left today
          </Text>
        </View>
        <View style={[styles.hungerBarBg, { backgroundColor: colors.statBarBg }]}>
          <LinearGradient
            colors={
              isFull
                ? [colors.success, colors.success + '88']
                : [tokens.colors.pillars.civics, tokens.colors.pillars.civics + '88']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.hungerBarFill, { width: `${Math.round((xpFedToday / 50) * 100)}%` }]}
          />
        </View>

        {/* Feed button or full message */}
        {isFull ? (
          <View style={styles.fullMessage}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[styles.fullMessageText, { color: colors.textSecondary }]}>
              Full! Come back tomorrow
            </Text>
          </View>
        ) : (
          <GlassButton
            title="Feed  -10 XP"
            onPress={() => handleFeed({ id: 'basic_food', name: 'Food', emoji: '', type: 'crunch', xpCost: 10, stageUnlock: 0, rotation: 'permanent' })}
            disabled={!!feedReaction || buddy.wallet < 10}
            style={styles.feedBtn}
          />
        )}

        {/* Wallet */}
        <View style={styles.walletRow}>
          <Ionicons name="star" size={14} color={colors.accent} />
          <Text style={[styles.walletText, { color: colors.accent }]}>
            {buddy.wallet} XP
          </Text>
        </View>
      </SurfaceCard>

      {/* Admin debug panel */}
      {isSuperadmin && (
        <View style={styles.adminSection}>
          <TouchableOpacity
            onPress={() => setShowAdmin(!showAdmin)}
            style={styles.adminToggle}
          >
            <Ionicons name="construct-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.adminToggleText, { color: colors.textMuted }]}>
              {showAdmin ? 'Hide' : 'Show'} Admin Controls
            </Text>
          </TouchableOpacity>

          {showAdmin && (
            <SurfaceCard style={styles.adminPanel}>
              <Text style={[styles.adminTitle, { color: colors.textSecondary }]}>
                Buddy Debug
              </Text>

              <GlassButton
                title="Reset to Egg (100 XP)"
                variant="outline"
                size="sm"
                onPress={async () => {
                  setStage(0);
                  setVitality(1);
                  setBond(0);
                  await updateBuddy({
                    stage: 0,
                    highest_stage: 0,
                    vitality: 1.0,
                    bond: 0.0,
                    wallet: 100,
                    total_xp_fed: 0,
                    xp_fed_today: 0,
                    last_interaction: new Date().toISOString(),
                  } as any);
                  await useBuddyStore.getState().loadBuddy();
                }}
                style={styles.resetBtn}
              />

              {/* Stage */}
              <View style={styles.sliderRow}>
                <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>Stage</Text>
                <Text style={[styles.sliderValue, { color: colors.text }]}>
                  {stage} - {STAGE_PALETTES[stage].name}
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={6}
                step={1}
                value={stage}
                onValueChange={(v: number) => setStage(v)}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.statBarBg}
                thumbTintColor={colors.primary}
                style={styles.slider}
              />

              {/* Vitality */}
              <View style={styles.sliderRow}>
                <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>Vitality</Text>
                <Text style={[styles.sliderValue, { color: colors.text }]}>
                  {Math.round(vitality * 100)}%
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={vitality}
                onValueChange={(v: number) => setVitality(v)}
                minimumTrackTintColor={tokens.colors.pillars.wellness}
                maximumTrackTintColor={colors.statBarBg}
                thumbTintColor={tokens.colors.pillars.wellness}
                style={styles.slider}
              />

              {/* Bond */}
              <View style={styles.sliderRow}>
                <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>Bond</Text>
                <Text style={[styles.sliderValue, { color: colors.text }]}>
                  {Math.round(bond * 100)}%
                </Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={bond}
                onValueChange={(v: number) => setBond(v)}
                minimumTrackTintColor={tokens.colors.pillars.art}
                maximumTrackTintColor={colors.statBarBg}
                thumbTintColor={tokens.colors.pillars.art}
                style={styles.slider}
              />
            </SurfaceCard>
          )}
        </View>
      )}
    </View>
  );
}

// ── Action Button ──

function ActionButton({
  label,
  iconName,
  color,
  onPress,
}: {
  label: string;
  iconName: string;
  color: string;
  onPress?: () => void;
}) {
  const { colors } = useThemeStore();

  const inner = (
    <>
      <View style={[styles.actionIconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={iconName as any} size={24} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <TouchableOpacity
        style={
          [
            styles.actionButton,
            {
              borderColor: colors.glass.border,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              backgroundColor: colors.glass.background,
            },
          ] as any
        }
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Quick capture: ${label}`}
        activeOpacity={0.7}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  // Android: skip BlurView, use simple translucent background
  if (Platform.OS === 'android') {
    return (
      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            borderColor: colors.glass.border,
            backgroundColor: colors.glass.background,
            elevation: 0,
          },
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Quick capture: ${label}`}
        activeOpacity={0.7}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.actionButtonNative, { borderColor: colors.glass.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Quick capture: ${label}`}
      activeOpacity={0.7}
    >
      <BlurView intensity={tokens.blur.light} tint={colors.blurTint} style={styles.actionButton}>
        <View style={[styles.actionInnerFill, { backgroundColor: colors.actionFill }]}>
          {inner}
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    paddingTop: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: 120,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
  },
  topLogo: {
    width: 100,
    height: 32,
  },
  greeting: {
    ...textStyles.h2,
    marginBottom: tokens.spacing.sm,
  },
  logoutBtn: {
    padding: tokens.spacing.sm,
  },
  // Buddy
  buddyContainer: {
    alignItems: 'center',
    marginBottom: 0,
  },
  buddyName: {
    ...textStyles.h1,
    textAlign: 'center',
  },
  stageLabel: {
    ...textStyles.label,
    textAlign: 'center',
    marginBottom: tokens.spacing.md,
  },
  // Feed card
  feedCard: {
    marginBottom: tokens.spacing.lg,
  },
  hungerLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xs,
  },
  hungerLabel: {
    ...textStyles.caption,
  },
  hungerBarBg: {
    height: 8,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
    marginBottom: tokens.spacing.md,
  },
  hungerBarFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  fullMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  fullMessageText: {
    ...textStyles.bodySm,
  },
  feedBtn: {
    alignSelf: 'center',
    marginBottom: tokens.spacing.sm,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
  },
  walletText: {
    ...textStyles.buttonSm,
  },
  // Create
  noPetCard: {
    marginBottom: tokens.spacing.lg,
    alignItems: 'center',
  },
  eggEmoji: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: tokens.spacing.md,
  },
  noPetText: {
    ...textStyles.h3,
    textAlign: 'center',
    marginBottom: tokens.spacing.md,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    ...textStyles.body,
    marginBottom: tokens.spacing.md,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  // Admin
  adminSection: {
    marginBottom: tokens.spacing.lg,
  },
  adminToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.sm,
  },
  adminToggleText: {
    ...textStyles.caption,
  },
  adminPanel: {
    marginTop: tokens.spacing.sm,
  },
  adminTitle: {
    ...textStyles.label,
    marginBottom: tokens.spacing.md,
    textAlign: 'center',
  },
  resetBtn: {
    alignSelf: 'center',
    marginBottom: tokens.spacing.lg,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.xs,
  },
  sliderLabel: {
    ...textStyles.bodySm,
  },
  sliderValue: {
    ...textStyles.label,
    minWidth: 80,
    textAlign: 'right',
  },
  slider: {
    height: 32,
    marginBottom: tokens.spacing.md,
  },
  // Quick actions
  quickActions: {
    marginBottom: tokens.spacing.lg,
  },
  sectionTitle: {
    ...textStyles.h3,
    marginBottom: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  actionButtonNative: {
    flex: 1,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    borderWidth: 0.5,
    ...tokens.shadows.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: tokens.spacing.md,
    alignItems: 'center',
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    borderWidth: 0.5,
    ...tokens.shadows.sm,
  },
  actionInnerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.spacing.md,
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.sm,
  },
  actionLabel: {
    ...textStyles.label,
  },
});
