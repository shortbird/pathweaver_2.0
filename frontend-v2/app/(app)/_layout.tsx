import { useEffect } from 'react';
import { Redirect, Stack, router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import {
  registerForPushNotifications,
  configurePushNotifications,
  addNotificationResponseListener,
} from '@/src/services/pushNotifications';

// Configure notification display once at module load
configurePushNotifications();

export default function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  // Register for push notifications after auth
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    registerForPushNotifications();
  }, [isAuthenticated, user?.id]);

  // Handle notification taps (navigate to link)
  useEffect(() => {
    const cleanup = addNotificationResponseListener((link) => {
      if (link) {
        const route = link.startsWith('/') ? `/(app)${link}` : link;
        try { router.push(route as any); } catch { /* invalid route */ }
      } else {
        router.push('/(app)/notifications' as any);
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
      <Stack.Screen name="notifications" />
      <Stack.Screen name="quests/[id]" />
      <Stack.Screen name="courses/[id]" />
      <Stack.Screen name="bounties/[id]" />
      <Stack.Screen name="bounties/create" />
      <Stack.Screen name="bounties/review/[id]" />
      <Stack.Screen name="observers/accept" />
    </Stack>
  );
}
