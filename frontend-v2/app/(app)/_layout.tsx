import { useEffect, useState } from 'react';
import { Redirect, Stack, router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import {
  registerForPushNotifications,
  configurePushNotifications,
  addNotificationResponseListener,
} from '@/src/services/pushNotifications';
import { resolveDeepLink } from '@/src/services/deepLinkRouter';
import { hasSeenOnboarding } from '@/src/stores/onboardingStore';

// Configure notification display once at module load
configurePushNotifications();

export default function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  // Block rendering of any (app) route until we've decided whether to send the
  // user into onboarding. Without this, callback.tsx navigates to /feed right
  // after auth, feed renders briefly, and the onboarding redirect arrives
  // too late to feel like first-run flow.
  const [onboardingDecision, setOnboardingDecision] = useState<
    'pending' | 'send' | 'allow'
  >('pending');

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setOnboardingDecision('pending');
      return;
    }
    let cancelled = false;
    (async () => {
      const seen = await hasSeenOnboarding(user.id);
      if (cancelled) return;
      if (!seen) {
        setOnboardingDecision('send');
        router.replace('/(app)/onboarding' as any);
      } else {
        setOnboardingDecision('allow');
        registerForPushNotifications();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  // Handle notification taps (navigate to link)
  useEffect(() => {
    const cleanup = addNotificationResponseListener((link) => {
      const resolved = resolveDeepLink(link);
      if (!resolved) {
        router.push('/(app)/notifications' as any);
        return;
      }
      try {
        if (resolved.params) {
          router.push({ pathname: resolved.target as any, params: resolved.params });
        } else {
          router.push(resolved.target as any);
        }
      } catch {
        /* invalid route */
      }
    });
    return () => cleanup?.();
  }, []);

  if (isLoading || (isAuthenticated && onboardingDecision === 'pending')) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-50">
        <ActivityIndicator size="large" color="#6D469B" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="quests/[id]" />
      <Stack.Screen name="courses/[id]" />
      <Stack.Screen name="bounties/[id]" />
      <Stack.Screen name="bounties/create" />
      <Stack.Screen name="bounties/review/[id]" />
      <Stack.Screen name="observers/accept" />
      <Stack.Screen name="view-on-web" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
