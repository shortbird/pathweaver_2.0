import { useEffect, useState } from 'react';
import { Redirect, Stack, router, usePathname } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import {
  registerForPushNotifications,
  configurePushNotifications,
  addNotificationResponseListener,
} from '@/src/services/pushNotifications';
import { resolveDeepLink } from '@/src/services/deepLinkRouter';
import { getFlag, PrefsKeys } from '@/src/stores/prefsStore';
import { View, ActivityIndicator } from 'react-native';

// Configure notification display once at module load
configurePushNotifications();

export default function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const pathname = usePathname();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Once the user is authenticated, ask the OS for notification permission and
  // (on capable platforms) register an Expo push token. The native permission
  // prompt only ever fires once — subsequent app loads no-op.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    registerForPushNotifications();
  }, [isAuthenticated, user?.id]);

  // First-run onboarding: route students to the welcome carousel once.
  // Skip for observers and parents — their first view is already role-specific.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (onboardingChecked) return;
    const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
    const isStudent = role === 'student' || role === 'superadmin';
    if (!isStudent) { setOnboardingChecked(true); return; }
    getFlag(PrefsKeys.OnboardingSeen).then((seen) => {
      setOnboardingChecked(true);
      if (!seen && pathname && !pathname.startsWith('/onboarding')) {
        router.replace('/(app)/onboarding' as any);
      }
    });
  }, [isAuthenticated, user?.id, user?.role, user?.org_role, onboardingChecked, pathname]);

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

  if (isLoading) {
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
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="quests/[id]" />
      <Stack.Screen name="bounties/[id]" />
      <Stack.Screen name="bounties/create" />
      <Stack.Screen name="bounties/review/[id]" />
      <Stack.Screen name="observers/accept" />
      <Stack.Screen name="oea/welcome" />
      <Stack.Screen name="oea/select-pathway" />
      <Stack.Screen name="oea/credits" />
      <Stack.Screen name="view-on-web" />
    </Stack>
  );
}
