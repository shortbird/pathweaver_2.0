import '../global.css';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Stack } from 'expo-router';

// Suppress React Native Web warnings for native-only props
if (Platform.OS === 'web') {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('collapsable') ||
      msg.includes('transform-origin') ||
      msg.includes('transformOrigin') ||
      msg.includes('Password field is not contained in a form') ||
      msg.includes('pointerEvents is deprecated') ||
      msg.includes('aria-hidden') ||
      msg.includes('Blocked aria-hidden')
    ) return;
    originalConsoleError(...args);
  };
  const originalConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('pointerEvents is deprecated') ||
      msg.includes('shadow') ||
      msg.includes('Password field')
    ) return;
    originalConsoleWarn(...args);
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
import { useActingAsStore } from '@/src/stores/actingAsStore';
import { loadPersistedTheme } from '@/src/stores/themeStore';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loadUser = useAuthStore((s) => s.loadUser);
  const { setColorScheme } = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    // Restore acting-as state from sessionStorage before loading user
    useActingAsStore.getState().restore();
    loadUser();
    // Restore persisted theme preference
    loadPersistedTheme().then((mode) => {
      if (mode === 'dark' || mode === 'light') {
        setColorScheme(mode);
      }
    });
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
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
