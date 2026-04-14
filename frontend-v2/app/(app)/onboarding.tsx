/**
 * First-run onboarding.
 *
 * Shows role-appropriate intro slides, primes permissions before the system
 * prompt fires, and stores a per-user "seen" flag. Navigates back to feed
 * when the user taps Done.
 */

import React, { useMemo, useState } from 'react';
import { View, Pressable, Platform, Image, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { markOnboardingSeen } from '@/src/stores/onboardingStore';
import { registerForPushNotifications } from '@/src/services/pushNotifications';
import { Heading, UIText, Button, ButtonText, VStack, HStack } from '@/src/components/ui';
import api from '@/src/services/api';

const OPTIO_ICON_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

interface Slide {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  cta?: string;
  action?: 'request_notifications' | 'next' | 'done' | 'save_name';
  kind?: 'info' | 'name_prompt';
}

/** Treat these as "no real name yet" so we prompt. */
const GENERIC_FIRST_NAMES = new Set(['', 'user']);

function needsNamePrompt(firstName?: string | null): boolean {
  if (!firstName) return true;
  return GENERIC_FIRST_NAMES.has(firstName.trim().toLowerCase());
}

function slidesForRole(role: string | null | undefined): Slide[] {
  const isParent = role === 'parent';
  const isObserver = role === 'observer';

  if (isObserver) {
    return [
      {
        key: 'welcome',
        icon: 'heart-outline',
        iconColor: '#E85D8A',
        title: 'Welcome to Optio',
        body: 'You can celebrate and support the students you observe. Leave comments, post bounties, and watch their journey.',
        cta: 'Next',
        action: 'next',
      },
      {
        key: 'feed',
        icon: 'newspaper-outline',
        iconColor: '#3B82F6',
        title: 'Your feed',
        body: 'See completed tasks and learning moments from the students you observe in one place.',
        cta: 'Next',
        action: 'next',
      },
      {
        key: 'notifications',
        icon: 'notifications-outline',
        iconColor: '#6D469B',
        title: 'Stay in the loop',
        body: 'Turn on notifications so you don\'t miss new bounties or messages. You can change this later in Settings.',
        cta: 'Allow notifications',
        action: 'request_notifications',
      },
    ];
  }

  if (isParent) {
    return [
      {
        key: 'welcome',
        icon: 'people-outline',
        iconColor: '#6D469B',
        title: 'Welcome, family',
        body: 'Follow your child\'s learning journey on the Family tab. See their progress, moments, and weekly rhythm.',
        cta: 'Next',
        action: 'next',
      },
      {
        key: 'bounties',
        icon: 'flag-outline',
        iconColor: '#E85D8A',
        title: 'Post bounties',
        body: 'Create bounties to motivate your child. Set the XP reward and watch them take it on.',
        cta: 'Next',
        action: 'next',
      },
      {
        key: 'notifications',
        icon: 'notifications-outline',
        iconColor: '#6D469B',
        title: 'Stay connected',
        body: 'Turn on notifications for messages and bounty activity. You can change this anytime in Settings.',
        cta: 'Allow notifications',
        action: 'request_notifications',
      },
    ];
  }

  // Default (student, advisor)
  return [
    {
      key: 'welcome',
      icon: 'sparkles-outline',
      iconColor: '#6D469B',
      title: 'The Process Is The Goal',
      body: 'Optio celebrates curiosity and effort. Capture what you\'re doing, reflect, and build a portfolio of real work.',
      cta: 'Next',
      action: 'next',
    },
    {
      key: 'capture',
      icon: 'add-circle-outline',
      iconColor: '#E85D8A',
      title: 'Capture moments',
      body: 'Tap the center button any time to save a learning moment — photos, video, audio, or a quick note.',
      cta: 'Next',
      action: 'next',
    },
    {
      key: 'notifications',
      icon: 'notifications-outline',
      iconColor: '#6D469B',
      title: 'Stay in touch',
      body: 'Turn on notifications for messages, comments, and feedback on your work. You can change this later in Settings.',
      cta: 'Allow notifications',
      action: 'request_notifications',
    },
  ];
}

export default function OnboardingScreen() {
  const user = useAuthStore((s) => s.user);
  const role = useMemo(() => {
    if (!user) return null;
    return user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  }, [user]);

  const slides = useMemo<Slide[]>(() => {
    const base = slidesForRole(role);
    if (!needsNamePrompt(user?.first_name)) return base;
    const isParent = role === 'parent';
    return [
      {
        key: 'name',
        kind: 'name_prompt',
        icon: 'person-outline',
        iconColor: '#6D469B',
        title: isParent ? 'What should we call you?' : 'What\'s your name?',
        body: isParent
          ? 'Your family will see this on comments, bounties, and messages.'
          : 'Optio will show this on your profile, comments, and bounty submissions.',
        cta: 'Continue',
        action: 'save_name',
      },
      ...base,
    ];
  }, [role, user?.first_name]);

  const [index, setIndex] = useState(0);
  const [firstName, setFirstName] = useState(
    user?.first_name && !GENERIC_FIRST_NAMES.has(user.first_name.trim().toLowerCase())
      ? user.first_name
      : '',
  );
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [savingName, setSavingName] = useState(false);

  const finish = async () => {
    if (user?.id) {
      await markOnboardingSeen(user.id);
    }
    router.replace('/(app)/(tabs)/feed' as any);
  };

  const saveName = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first) return;
    setSavingName(true);
    try {
      const { data } = await api.put('/api/users/profile', {
        first_name: first,
        last_name: last || undefined,
      });
      // Refresh authStore user with updated name so feed/profile reflect it
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, first_name: first, last_name: last, ...(data || {}) } : s.user,
      }));
    } catch {
      // Soft-fail: still advance rather than trap the user
    } finally {
      setSavingName(false);
      setIndex(index + 1);
    }
  };

  const handleAction = async (slide: Slide) => {
    if (slide.action === 'save_name') {
      await saveName();
      return;
    }
    if (slide.action === 'request_notifications') {
      try {
        await registerForPushNotifications();
      } catch {
        // User declined — still continue
      }
      await finish();
      return;
    }
    if (index < slides.length - 1) {
      setIndex(index + 1);
    } else {
      await finish();
    }
  };

  const skip = async () => {
    await finish();
  };

  const slide = slides[index];
  const isNamePrompt = slide.kind === 'name_prompt';
  const canAdvance = isNamePrompt ? firstName.trim().length > 0 && !savingName : true;

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View className="flex-1 px-6 pt-4 pb-6">
        {/* Skip — hidden on name prompt (required field) */}
        <HStack className="justify-between items-center">
          <Image source={{ uri: OPTIO_ICON_URI }} style={{ width: 28, height: 28 }} resizeMode="contain" />
          {!isNamePrompt ? (
            <Pressable onPress={skip} hitSlop={10}>
              <UIText size="sm" className="text-typo-500">Skip</UIText>
            </Pressable>
          ) : (
            <View style={{ width: 28 }} />
          )}
        </HStack>

        {/* Slide content */}
        <View className="flex-1 items-center justify-center">
          <VStack space="lg" className="items-center max-w-sm w-full">
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: `${slide.iconColor}15`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={slide.icon} size={48} color={slide.iconColor} />
            </View>
            <Heading size="xl" className="text-center">{slide.title}</Heading>
            <UIText size="md" className="text-typo-500 text-center leading-6">
              {slide.body}
            </UIText>

            {isNamePrompt && (
              <VStack space="sm" className="w-full mt-2">
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  autoComplete="given-name"
                  autoCorrect={false}
                  returnKeyType="next"
                  className="bg-white rounded-xl px-4 py-3 text-base border border-surface-200"
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name (optional)"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  autoComplete="family-name"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => canAdvance && saveName()}
                  className="bg-white rounded-xl px-4 py-3 text-base border border-surface-200"
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
              </VStack>
            )}
          </VStack>
        </View>

        {/* Dots */}
        <HStack className="items-center justify-center gap-2 mb-6">
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === index ? 20 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? '#6D469B' : '#E5E7EB',
              }}
            />
          ))}
        </HStack>

        {/* CTA */}
        <Button
          size="lg"
          onPress={() => handleAction(slide)}
          className="w-full"
          disabled={!canAdvance}
        >
          <ButtonText>{savingName ? 'Saving…' : (slide.cta || 'Continue')}</ButtonText>
        </Button>
        {slide.action === 'request_notifications' && (
          <Pressable onPress={finish} className="items-center py-3 mt-1">
            <UIText size="sm" className="text-typo-500">Not now</UIText>
          </Pressable>
        )}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
