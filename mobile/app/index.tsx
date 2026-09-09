import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { landingRouteForUser } from '@/src/services/landingRoute';
import { View, ActivityIndicator } from 'react-native';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export default function Index() {
  const c = useThemeColors();
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-50 dark:bg-dark-surface-50">
        <ActivityIndicator size="large" color={c.brand} />
      </View>
    );
  }

  if (isAuthenticated) {
    // Parents land on the Family tab; everyone else on Home/dashboard.
    return <Redirect href={landingRouteForUser(user) as any} />;
  }

  return <Redirect href="/(auth)/login" />;
}
