import '../global.css';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

// Suppress React Native Web warnings for native-only props
if (Platform.OS === 'web') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && (
      args[0].includes('non-boolean attribute `collapsable`') ||
      args[0].includes('`transform-origin`') ||
      args[0].includes('`transformOrigin`')
    )) return;
    originalConsoleError(...args);
  };
}
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { useAuthStore } from '@/src/stores/authStore';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loadUser = useAuthStore((s) => s.loadUser);

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
