import { useCallback, useEffect, useRef } from 'react';
import { Redirect, Stack, router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import {
  registerForPushNotifications,
  configurePushNotifications,
  addNotificationResponseListener,
  getInitialNotificationLink,
} from '@/src/services/pushNotifications';
import { resolveDeepLink } from '@/src/services/deepLinkRouter';
import { View, ActivityIndicator } from 'react-native';

// Configure notification display once at module load
configurePushNotifications();

export default function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  // A notification tap can arrive before auth has finished restoring (cold
  // start). Navigating then would race the auth gate and dump the user on the
  // login screen ("tapping a notification made me log back in"). We hold the
  // link here and flush it once authenticated.
  const pendingLink = useRef<string | null>(null);
  const coldStartHandled = useRef(false);

  // Once the user is authenticated, ask the OS for notification permission and
  // (on capable platforms) register an Expo push token. The native permission
  // prompt only ever fires once — subsequent app loads no-op.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    registerForPushNotifications();
  }, [isAuthenticated, user?.id]);

  // Navigate to a deep link. resolveDeepLink never returns a non-existent
  // route, so navigation here can't land on the "no route" unmatched screen.
  const navigateToLink = useCallback((link: string | null) => {
    const resolved = resolveDeepLink(link);
    const target = resolved?.target ?? '/(app)/notifications';
    try {
      if (resolved?.params) {
        router.push({ pathname: target as any, params: resolved.params });
      } else {
        router.push(target as any);
      }
    } catch {
      router.push('/(app)/notifications' as any);
    }
  }, []);

  // Live notification taps (app already foregrounded/backgrounded). If auth
  // isn't ready yet, stash the link for the flush effect below.
  useEffect(() => {
    const cleanup = addNotificationResponseListener((link) => {
      const { isAuthenticated: authed, isLoading: loading } = useAuthStore.getState();
      if (authed && !loading) {
        navigateToLink(link);
      } else {
        pendingLink.current = link;
      }
    });
    return () => cleanup?.();
  }, [navigateToLink]);

  // Once authenticated, (a) flush any link queued before auth was ready, then
  // (b) handle a cold start where a notification tap launched the app from a
  // killed state (the live listener never fires for that).
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (pendingLink.current !== null) {
      const link = pendingLink.current;
      pendingLink.current = null;
      navigateToLink(link);
      return;
    }
    if (!coldStartHandled.current) {
      coldStartHandled.current = true;
      getInitialNotificationLink().then((link) => {
        if (link) navigateToLink(link);
      });
    }
  }, [isAuthenticated, isLoading, navigateToLink]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-50 dark:bg-dark-surface-50">
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
      <Stack.Screen name="settings" />
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
