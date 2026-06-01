/**
 * First-run onboarding carousel.
 *
 * Three cards introducing the core philosophy + the two surfaces a student
 * touches every day (capture, journal). Skippable from the first slide.
 *
 * Mounted via app/(app)/_layout.tsx, which checks PrefsKeys.OnboardingSeen
 * once auth loads and routes here if it's not set yet.
 */

import React, { useRef, useState } from 'react';
import {
  View, ScrollView, Pressable, useWindowDimensions, Platform, Image,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, Heading, UIText, Button, ButtonText } from '@/src/components/ui';
import { setFlag, PrefsKeys } from '@/src/stores/prefsStore';

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'sparkles',
    iconColor: '#6D469B',
    iconBg: 'rgba(109, 70, 155, 0.12)',
    title: 'The process is the goal',
    body: 'Optio celebrates the learning you do today — not a grade, not a future outcome. Show up, capture what you learn, and the rest follows.',
  },
  {
    icon: 'add-circle',
    iconColor: '#EF597B',
    iconBg: 'rgba(239, 89, 123, 0.12)',
    title: 'Capture a moment',
    body: 'Tap the center button anywhere in the app to capture what you just learned — a photo, a video, a few words. Even five seconds counts.',
  },
  {
    icon: 'book',
    iconColor: '#3DA24A',
    iconBg: 'rgba(61, 162, 74, 0.12)',
    title: 'Organize into quests',
    body: 'Group moments into topics, search the quest library, or create your own quest. Your journal grows with every moment you save.',
  },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  // Slightly roomier slides on tablet / desktop; phones stay at 480.
  const slideWidth = Math.min(width, width >= 768 ? 560 : 480);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    await setFlag(PrefsKeys.OnboardingSeen, true);
    router.replace('/(app)/(tabs)/dashboard');
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    if (i !== index) setIndex(i);
  };

  const goNext = () => {
    if (index >= SLIDES.length - 1) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * slideWidth, animated: true });
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-dark-surface">
      <View className="flex-1 items-center">
        {/* Skip — always visible, top right */}
        <HStack className="w-full justify-end px-5 pt-2">
          <Pressable
            onPress={finish}
            hitSlop={12}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <UIText size="sm" className="text-typo-400 font-poppins-medium">Skip</UIText>
          </Pressable>
        </HStack>

        {/* Slides */}
        <View style={{ width: slideWidth, flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            decelerationRate="fast"
          >
            {SLIDES.map((slide, i) => (
              <View
                key={i}
                style={{
                  width: slideWidth,
                  paddingHorizontal: 28,
                  paddingTop: 32,
                  paddingBottom: 24,
                }}
              >
                <VStack space="lg" className="items-center">
                  <View
                    style={{
                      width: 128,
                      height: 128,
                      borderRadius: 64,
                      backgroundColor: slide.iconBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 24,
                      marginBottom: 8,
                    }}
                  >
                    <Ionicons name={slide.icon} size={64} color={slide.iconColor} />
                  </View>
                  <Heading size="2xl" className="text-center">
                    {slide.title}
                  </Heading>
                  <UIText
                    size="md"
                    className="text-typo-500 text-center"
                    style={{ lineHeight: 24 }}
                  >
                    {slide.body}
                  </UIText>
                </VStack>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Dots + CTA */}
        <VStack space="md" className="w-full items-center px-8 pb-8" style={{ maxWidth: slideWidth }}>
          <HStack space="xs" className="items-center justify-center" style={{ height: 10 }}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === index ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i === index ? '#6D469B' : '#E2DCE8',
                }}
              />
            ))}
          </HStack>
          <Button size="lg" className="w-full" onPress={goNext}>
            <ButtonText>{isLast ? "Let's go" : 'Next'}</ButtonText>
          </Button>
        </VStack>
      </View>
    </SafeAreaView>
  );
}
