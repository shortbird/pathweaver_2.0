/**
 * Onboarding Screen - 4-slide introduction shown on first launch.
 *
 * Gameplay loop: Capture -> Earn XP -> Feed Buddy -> Track Journey
 *
 * Swipeable pages with liquid glass cards, pillar-colored accents,
 * pagination dots, and a "Get Started" CTA on the final slide.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polygon, Line, Circle as SvgCircle } from 'react-native-svg';
import { tokens, textStyles } from '../theme/tokens';
import { GlassCard } from '../components/common/GlassCard';
import { GlassButton } from '../components/common/GlassButton';
import { GlassBackground } from '../components/common/GlassBackground';
import OptioBuddy from '../components/buddy/OptioBuddy';
import { useOnboardingStore } from '../stores/onboardingStore';

const { width: SCREEN_W } = Dimensions.get('window');

interface SlideIcon {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface Slide {
  id: string;
  icons: SlideIcon[];
  dotColor: string;
  title: string;
  subtitle: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    id: 'capture',
    icons: [
      { name: 'camera-outline', color: tokens.colors.pillars.art },
      { name: 'mic-outline', color: tokens.colors.pillars.communication },
      { name: 'create-outline', color: tokens.colors.pillars.stem },
    ],
    dotColor: tokens.colors.pillars.communication,
    title: 'Capture a Moment',
    subtitle: 'Step 1',
    description:
      'Snap a photo, record your voice, or write about what you learned. Every moment counts.',
  },
  {
    id: 'earn',
    icons: [
      { name: 'star-outline', color: tokens.colors.pillars.civics },
      { name: 'trophy-outline', color: tokens.colors.accent },
      { name: 'sparkles-outline', color: tokens.colors.primary },
    ],
    dotColor: tokens.colors.pillars.civics,
    title: 'Earn XP',
    subtitle: 'Step 2',
    description:
      'Every capture earns Experience Points (XP) across five learning pillars. The more you learn, the more you grow.',
  },
  {
    id: 'buddy',
    icons: [],
    dotColor: tokens.colors.pillars.wellness,
    title: 'Feed Your Buddy',
    subtitle: 'Step 3',
    description:
      'Spend your XP to feed your companion. Watch it hatch, grow, and evolve as you learn together.',
  },
  {
    id: 'journey',
    icons: [],
    dotColor: tokens.colors.pillars.stem,
    title: 'Track Your Growth',
    subtitle: 'Step 4',
    description:
      'See your progress across STEM, Art, Communication, Civics, and Wellness. The process is the goal.',
  },
  {
    id: 'observers',
    icons: [
      { name: 'people-outline', color: tokens.colors.primary },
      { name: 'chatbubble-ellipses-outline', color: tokens.colors.pillars.communication },
      { name: 'heart-outline', color: tokens.colors.accent },
    ],
    dotColor: tokens.colors.primary,
    title: 'Invite Observers',
    subtitle: 'Step 5',
    description:
      'Invite parents, mentors, or coaches to follow your journey. They can cheer you on and leave encouragement.',
  },
];

// ── Animated XP Award ──

const CONFETTI_PIECES = [
  { color: tokens.colors.pillars.stem, x: -40, y: -50, rot: 25, size: 8 },
  { color: tokens.colors.pillars.art, x: 35, y: -55, rot: -30, size: 10 },
  { color: tokens.colors.pillars.communication, x: -55, y: -20, rot: 45, size: 7 },
  { color: tokens.colors.accent, x: 50, y: -15, rot: -15, size: 9 },
  { color: tokens.colors.pillars.civics, x: -30, y: -65, rot: 60, size: 6 },
  { color: tokens.colors.pillars.wellness, x: 45, y: -45, rot: -50, size: 8 },
  { color: tokens.colors.primary, x: -50, y: -40, rot: 10, size: 10 },
  { color: tokens.colors.pillars.stem, x: 55, y: -30, rot: -40, size: 7 },
  { color: tokens.colors.accent, x: -20, y: -70, rot: 35, size: 6 },
  { color: tokens.colors.pillars.art, x: 25, y: -60, rot: -20, size: 9 },
  { color: tokens.colors.pillars.communication, x: -60, y: -55, rot: 55, size: 7 },
  { color: tokens.colors.pillars.civics, x: 60, y: -50, rot: -45, size: 8 },
];

function XpAwardAnimation({ active }: { active: boolean }) {
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const xpScale = useRef(new Animated.Value(0.3)).current;
  const xpOpacity = useRef(new Animated.Value(0)).current;
  const confettiAnims = useRef(
    CONFETTI_PIECES.map(() => ({
      opacity: new Animated.Value(0),
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      rotate: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (active) {
      // Reset all
      toastOpacity.setValue(0);
      toastTranslateY.setValue(20);
      xpScale.setValue(0.3);
      xpOpacity.setValue(0);
      confettiAnims.forEach((a) => {
        a.opacity.setValue(0);
        a.translateX.setValue(0);
        a.translateY.setValue(0);
        a.rotate.setValue(0);
      });

      Animated.sequence([
        Animated.delay(300),
        // 1. Toast slides up
        Animated.parallel([
          Animated.timing(toastOpacity, {
            toValue: 1, duration: 400, useNativeDriver: true,
          }),
          Animated.timing(toastTranslateY, {
            toValue: 0, duration: 400,
            easing: Easing.out(Easing.back(1.5)), useNativeDriver: true,
          }),
        ]),
        Animated.delay(200),
        // 2. XP badge pops + confetti
        Animated.parallel([
          Animated.spring(xpScale, {
            toValue: 1, damping: 8, stiffness: 150, useNativeDriver: true,
          }),
          Animated.timing(xpOpacity, {
            toValue: 1, duration: 200, useNativeDriver: true,
          }),
          // Confetti burst
          ...confettiAnims.map((a, i) => {
            const piece = CONFETTI_PIECES[i];
            const delay = Math.random() * 150;
            return Animated.sequence([
              Animated.delay(delay),
              Animated.parallel([
                Animated.timing(a.opacity, {
                  toValue: 1, duration: 150, useNativeDriver: true,
                }),
                Animated.timing(a.translateX, {
                  toValue: piece.x, duration: 600,
                  easing: Easing.out(Easing.cubic), useNativeDriver: true,
                }),
                Animated.timing(a.translateY, {
                  toValue: piece.y, duration: 600,
                  easing: Easing.out(Easing.cubic), useNativeDriver: true,
                }),
                Animated.timing(a.rotate, {
                  toValue: piece.rot, duration: 600, useNativeDriver: true,
                }),
              ]),
              // Fade out
              Animated.timing(a.opacity, {
                toValue: 0, duration: 400, delay: 200, useNativeDriver: true,
              }),
            ]);
          }),
        ]),
      ]).start();
    }
  }, [active]);

  return (
    <View style={styles.xpContainer}>
      {/* Toast notification */}
      <Animated.View
        style={[
          styles.xpToast,
          {
            opacity: toastOpacity,
            transform: [{ translateY: toastTranslateY }],
          },
        ]}
      >
        <Ionicons name="checkmark-circle" size={20} color={tokens.colors.success} />
        <Text style={styles.xpToastText}>Learning moment captured!</Text>
      </Animated.View>

      {/* XP badge + confetti wrapper */}
      <View style={styles.xpBadgeWrapper}>
        {/* Confetti pieces */}
        {confettiAnims.map((a, i) => {
          const piece = CONFETTI_PIECES[i];
          const rotation = a.rotate.interpolate({
            inputRange: [0, 360],
            outputRange: ['0deg', '360deg'],
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.confettiPiece,
                {
                  width: piece.size,
                  height: piece.size * 0.6,
                  backgroundColor: piece.color,
                  borderRadius: piece.size * 0.15,
                  opacity: a.opacity,
                  transform: [
                    { translateX: a.translateX },
                    { translateY: a.translateY },
                    { rotate: rotation },
                  ],
                },
              ]}
            />
          );
        })}

        {/* XP badge */}
        <Animated.View
          style={[
            styles.xpBadgeOuter,
            {
              opacity: xpOpacity,
              transform: [{ scale: xpScale }],
            },
          ]}
        >
          <LinearGradient
            colors={[tokens.colors.primary, tokens.colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.xpBadge}
          >
            <Text style={styles.xpBadgeText}>+10 XP</Text>
          </LinearGradient>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Pillar Radar Chart ──

const RADAR_SVG_SIZE = 160;
const RADAR_CX = RADAR_SVG_SIZE / 2;
const RADAR_CY = RADAR_SVG_SIZE / 2;
const RADAR_R = 55;
const ICON_OFFSET = RADAR_R + 24; // how far out the icons sit

const RADAR_PILLARS: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: number;
}[] = [
  { key: 'stem', label: 'STEM', icon: 'flask-outline', color: tokens.colors.pillars.stem, value: 0.75 },
  { key: 'art', label: 'Art', icon: 'color-palette-outline', color: tokens.colors.pillars.art, value: 0.6 },
  { key: 'communication', label: 'Communication', icon: 'chatbubbles-outline', color: tokens.colors.pillars.communication, value: 0.85 },
  { key: 'civics', label: 'Civics', icon: 'globe-outline', color: tokens.colors.pillars.civics, value: 0.5 },
  { key: 'wellness', label: 'Wellness', icon: 'fitness-outline', color: tokens.colors.pillars.wellness, value: 0.7 },
];

function radarPoint(i: number, r: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * i) / RADAR_PILLARS.length - Math.PI / 2;
  return { x: RADAR_CX + r * Math.cos(angle), y: RADAR_CY + r * Math.sin(angle) };
}

// Total view size including icon overhang
const RADAR_VIEW_SIZE = RADAR_SVG_SIZE + 48;

function PillarRadar() {
  const gridLevels = [0.33, 0.66, 1.0];
  const iconPositions = RADAR_PILLARS.map((_, i) => radarPoint(i, ICON_OFFSET));

  return (
    <View style={radarStyles.wrapper}>
      {/* SVG chart centered in the view */}
      <View style={radarStyles.svgWrapper}>
        <Svg width={RADAR_SVG_SIZE} height={RADAR_SVG_SIZE}>
          {/* Grid rings */}
          {gridLevels.map((level) => {
            const pts = RADAR_PILLARS.map((_, i) => {
              const p = radarPoint(i, RADAR_R * level);
              return `${p.x},${p.y}`;
            }).join(' ');
            return (
              <Polygon
                key={level}
                points={pts}
                fill="none"
                stroke={tokens.colors.textMuted}
                strokeWidth={0.5}
                opacity={0.5}
              />
            );
          })}

          {/* Axis lines */}
          {RADAR_PILLARS.map((p, i) => {
            const pt = radarPoint(i, RADAR_R);
            return (
              <Line
                key={i}
                x1={RADAR_CX}
                y1={RADAR_CY}
                x2={pt.x}
                y2={pt.y}
                stroke={p.color}
                strokeWidth={0.5}
                opacity={0.4}
              />
            );
          })}

          {/* Data polygon */}
          <Polygon
            points={RADAR_PILLARS.map((p, i) => {
              const pt = radarPoint(i, RADAR_R * p.value);
              return `${pt.x},${pt.y}`;
            }).join(' ')}
            fill={tokens.colors.primary + '25'}
            stroke={tokens.colors.primary}
            strokeWidth={2}
          />

          {/* Data dots */}
          {RADAR_PILLARS.map((p, i) => {
            const pt = radarPoint(i, RADAR_R * p.value);
            return <SvgCircle key={p.key} cx={pt.x} cy={pt.y} r={4} fill={p.color} />;
          })}
        </Svg>

        {/* Ionicon overlays positioned absolutely around the chart */}
        {RADAR_PILLARS.map((p, i) => {
          const pos = iconPositions[i];
          // Offset from SVG origin, centered on the icon (24x24 wrapper -> 12px offset)
          const svgOffsetX = (RADAR_VIEW_SIZE - RADAR_SVG_SIZE) / 2;
          const svgOffsetY = (RADAR_VIEW_SIZE - RADAR_SVG_SIZE) / 2;
          return (
            <View
              key={p.key}
              style={[
                radarStyles.iconWrap,
                {
                  left: pos.x + svgOffsetX - 12,
                  top: pos.y + svgOffsetY - 12,
                },
              ]}
            >
              <Ionicons name={p.icon} size={18} color={p.color} />
            </View>
          );
        })}
      </View>

      {/* Color-coded pillar legend: 3 on top, 2 on bottom */}
      <View style={radarStyles.legend}>
        <View style={radarStyles.legendRow}>
          {RADAR_PILLARS.slice(0, 3).map((p) => (
            <View key={p.key} style={radarStyles.legendItem}>
              <Ionicons name={p.icon} size={14} color={p.color} />
              <Text style={[radarStyles.legendText, { color: p.color }]}>{p.label}</Text>
            </View>
          ))}
        </View>
        <View style={radarStyles.legendRow}>
          {RADAR_PILLARS.slice(3).map((p) => (
            <View key={p.key} style={radarStyles.legendItem}>
              <Ionicons name={p.icon} size={14} color={p.color} />
              <Text style={[radarStyles.legendText, { color: p.color }]}>{p.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const radarStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  svgWrapper: {
    width: RADAR_VIEW_SIZE,
    height: RADAR_VIEW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.semiBold,
  },
});

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

export function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const completeOnboarding = useOnboardingStore((s) => s.complete);

  const isLast = activeIndex === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      completeOnboarding();
    } else {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <GlassCard style={styles.card}>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>

        {item.id === 'capture' ? (
          /* Photo + icon row on the capture slide */
          <>
            <Image
              source={{ uri: 'https://auth.optioeducation.com/storage/v1/object/public/mobile_app/Onboarding/nature_walk.jpg' }}
              style={styles.slideImage}
              resizeMode="cover"
            />
            <View style={styles.iconRow}>
              {item.icons.map((icon, i) => (
                <View key={i} style={[styles.iconOrb, { backgroundColor: icon.color + '15' }]}>
                  <Ionicons name={icon.name} size={32} color={icon.color} />
                </View>
              ))}
            </View>
          </>
        ) : item.id === 'earn' ? (
          /* Animated XP award on the earn slide */
          <XpAwardAnimation active={activeIndex === 1} />
        ) : item.id === 'buddy' ? (
          /* Live buddy character on the feed slide */
          <View style={styles.buddyContainer}>
            <OptioBuddy
              vitality={0.8}
              bond={0.7}
              stage={3}
              width={240}
              height={132}
            />
          </View>
        ) : item.id === 'journey' ? (
          /* Pillar radar chart on the track slide */
          <View style={styles.radarContainer}>
            <PillarRadar />
          </View>
        ) : item.id === 'observers' ? (
          <Image
            source={{ uri: 'https://auth.optioeducation.com/storage/v1/object/public/mobile_app/Onboarding/observers.jpg' }}
            style={styles.slideImage}
            resizeMode="cover"
          />
        ) : null}

        <Text style={styles.slideDescription}>{item.description}</Text>
      </GlassCard>
    </View>
  );

  return (
    <GlassBackground style={styles.container}>
      {/* Logo at top */}
      <View style={styles.logoContainer}>
        <Image
          source={{ uri: LOGO_URI }}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          if (idx !== activeIndex && idx >= 0 && idx < SLIDES.length) {
            setActiveIndex(idx);
          }
        }}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        style={styles.flatList}
      />

      {/* Bottom controls */}
      <View style={styles.bottomSection}>
        {/* Pagination dots */}
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.id}
              style={[
                styles.dot,
                i === activeIndex
                  ? [styles.dotActive, { backgroundColor: SLIDES[activeIndex].dotColor }]
                  : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          {!isLast ? (
            <>
              <GlassButton
                title="Skip"
                variant="ghost"
                size="md"
                onPress={handleSkip}
                style={styles.skipButton}
              />
              <GlassButton
                title="Next"
                variant="primary"
                size="md"
                onPress={handleNext}
                icon="arrow-forward"
                style={styles.nextButton}
              />
            </>
          ) : (
            <GlassButton
              title="Get Started"
              variant="primary"
              size="lg"
              onPress={handleNext}
              icon="rocket-outline"
              style={styles.getStartedButton}
            />
          )}
        </View>
      </View>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 48 : 60,
    paddingBottom: tokens.spacing.md,
  },
  logoBg: {
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
  },
  logo: {
    width: 160,
    height: 48,
  },
  flatList: {
    flex: 1,
  },
  slide: {
    width: SCREEN_W,
    paddingHorizontal: tokens.spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideImage: {
    width: SCREEN_W - tokens.spacing.lg * 2 - tokens.spacing.md * 2,
    height: 200,
    borderRadius: tokens.radius.lg,
    marginBottom: tokens.spacing.md,
    alignSelf: 'center',
  },
  xpContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  xpToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.full,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    borderWidth: 0.5,
    borderColor: tokens.colors.glass.borderLight,
    ...tokens.shadows.sm,
  },
  xpToastText: {
    fontFamily: tokens.typography.fonts.medium,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
  },
  xpBadgeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 100,
  },
  xpBadgeOuter: {
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
    ...tokens.shadows.glow(tokens.colors.accent),
  },
  xpBadge: {
    paddingVertical: tokens.spacing.sm + 2,
    paddingHorizontal: tokens.spacing.xl,
    borderRadius: tokens.radius.full,
  },
  xpBadgeText: {
    color: '#FFF',
    fontFamily: tokens.typography.fonts.bold,
    fontSize: tokens.typography.sizes.xxl,
    textAlign: 'center',
  },
  confettiPiece: {
    position: 'absolute',
  },
  buddyContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: tokens.spacing.md,
  },
  radarContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: tokens.spacing.md,
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.lg,
  },
  iconOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: tokens.spacing.xl,
  },
  slideTitle: {
    ...textStyles.h1,
    color: tokens.colors.text,
    textAlign: 'center',
    marginBottom: tokens.spacing.xs,
  },
  slideSubtitle: {
    ...textStyles.label,
    color: tokens.colors.primary,
    textAlign: 'center',
    marginBottom: tokens.spacing.lg,
  },
  slideDescription: {
    ...textStyles.body,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: tokens.spacing.sm,
  },
  bottomSection: {
    paddingBottom: Platform.OS === 'web' ? 32 : 48,
    paddingHorizontal: tokens.spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
  dotInactive: {
    width: 8,
    backgroundColor: tokens.colors.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  skipButton: {
    flex: 1,
  },
  nextButton: {
    flex: 1,
  },
  getStartedButton: {
    flex: 1,
  },
});
