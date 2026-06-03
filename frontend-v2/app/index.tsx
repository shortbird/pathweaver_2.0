import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { landingRouteForUser } from '@/src/services/landingRoute';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-50 dark:bg-dark-surface-50">
        <ActivityIndicator size="large" color="#6D469B" />
      </View>
    );
  }

  if (isAuthenticated) {
    // Parents land on the Family tab; everyone else on Home/dashboard.
    return <Redirect href={landingRouteForUser(user) as any} />;
  }

  return <Redirect href="/(auth)/login" />;
}
