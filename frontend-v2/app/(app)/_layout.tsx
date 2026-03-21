import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { View, ActivityIndicator } from 'react-native';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();

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
      <Stack.Screen name="parent" />
      <Stack.Screen name="quests/[id]" />
      <Stack.Screen name="courses/[id]" />
    </Stack>
  );
}
