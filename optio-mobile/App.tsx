import React, { useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TextInput, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { NavigationContainer, NavigationState } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useAuthStore } from './src/stores/authStore';
import { useThemeStore } from './src/stores/themeStore';
import { useOnboardingStore } from './src/stores/onboardingStore';
import { initPostHog, identifyUser, captureScreen } from './src/services/posthog';
import { tokens } from './src/theme/tokens';

// Apply Poppins globally to ALL Text and TextInput components
function setDefaultFont() {
  const defaultStyle = { fontFamily: 'Poppins-Regular' };

  const origTextRender = (Text as any).render;
  if (origTextRender) {
    (Text as any).render = function (props: any, ref: any) {
      const style = [defaultStyle, props.style];
      return origTextRender.call(this, { ...props, style }, ref);
    };
  }

  const origInputRender = (TextInput as any).render;
  if (origInputRender) {
    (TextInput as any).render = function (props: any, ref: any) {
      const style = [defaultStyle, props.style];
      return origInputRender.call(this, { ...props, style }, ref);
    };
  }
}

export default function App() {
  const loadUser = useAuthStore((state) => state.loadUser);
  const user = useAuthStore((state) => state.user);
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const hydrateOnboarding = useOnboardingStore((state) => state.hydrate);
  const themeMode = useThemeStore((state) => state.mode);

  const [fontsLoaded] = useFonts({
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-Medium': Poppins_500Medium,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
  });

  useEffect(() => {
    initPostHog();
    loadUser();
    hydrateTheme();
    hydrateOnboarding();
  }, []);

  // Identify user in PostHog when auth state changes
  useEffect(() => {
    if (user) {
      identifyUser(user);
    }
  }, [user?.id]);

  // Track screen views in PostHog
  const routeNameRef = useRef<string | undefined>();
  const onNavigationStateChange = useCallback((state: NavigationState | undefined) => {
    if (!state) return;
    const getActiveRouteName = (s: any): string => {
      const route = s.routes[s.index];
      if (route.state) return getActiveRouteName(route.state);
      return route.name;
    };
    const currentRoute = getActiveRouteName(state);
    if (currentRoute !== routeNameRef.current) {
      routeNameRef.current = currentRoute;
      captureScreen(currentRoute);
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      setDefaultFont();
    }
  }, [fontsLoaded]);

  // Prevent browser-level scrolling on web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const style = document.documentElement.style;
      const bodyStyle = document.body.style;
      style.overflow = 'hidden';
      style.height = '100%';
      bodyStyle.overflow = 'hidden';
      bodyStyle.height = '100%';
      bodyStyle.margin = '0';
      return () => {
        style.overflow = '';
        style.height = '';
        bodyStyle.overflow = '';
        bodyStyle.height = '';
      };
    }
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.colors.background }}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={Platform.OS === 'web' ? styles.rootWeb : styles.rootNative}>
      <SafeAreaProvider>
        <NavigationContainer onStateChange={onNavigationStateChange}>
          <AppNavigator />
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  rootWeb: {
    flex: 1,
    height: '100dvh' as any,
    overflow: 'hidden',
  },
  rootNative: {
    flex: 1,
  },
});
