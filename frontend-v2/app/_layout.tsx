import '../global.css';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Stack } from 'expo-router';

// S4: Suppress React Native Web warnings for native-only props. Match exact,
// known-benign warning prefixes rather than substrings so genuine errors that
// happen to contain these tokens (e.g. user data with the word "shadow") still
// surface in dev and Sentry.
if (Platform.OS === 'web') {
  const ERROR_PREFIXES = [
    'Warning: Received `false` for a non-boolean attribute `collapsable`',
    'Warning: Unknown property `transformOrigin`',
    'Warning: Unknown property `transform-origin`',
    'Warning: Password field is not contained in a form',
    'Warning: pointerEvents is deprecated',
    'Blocked aria-hidden on an element',
    'aria-hidden',
  ];
  const WARN_PREFIXES = [
    'pointerEvents is deprecated',
    '"shadow*" style props are deprecated',
    'Password field is not contained in a form',
  ];
  const matches = (msg: string, prefixes: string[]) =>
    prefixes.some((p) => msg.startsWith(p));

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (matches(msg, ERROR_PREFIXES)) return;
    originalConsoleError(...args);
  };
  const originalConsoleWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (matches(msg, WARN_PREFIXES)) return;
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
import { initSentry } from '@/src/services/sentry';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();
initSentry();

// D6: hard cap on how long the splash can remain visible. If /api/auth/me or
// font loading hangs (Render cold start, flaky network), we still let the user
// into the app instead of trapping them on the logo.
const SPLASH_TIMEOUT_MS = 5000;

export default function RootLayout() {
  const loadUser = useAuthStore((s) => s.loadUser);
  const { setColorScheme } = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [splashTimedOut, setSplashTimedOut] = useState(false);

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

    const timer = setTimeout(() => {
      setSplashTimedOut(true);
      SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded && !splashTimedOut) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="invite/[code]" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
