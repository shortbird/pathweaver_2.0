import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TextInput, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
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
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const themeMode = useThemeStore((state) => state.mode);

  const [fontsLoaded] = useFonts({
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-Medium': Poppins_500Medium,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
  });

  useEffect(() => {
    loadUser();
    hydrateTheme();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      setDefaultFont();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.colors.background }}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={Platform.OS === 'web' ? { flex: 1, height: '100dvh' as any } : { flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppNavigator />
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
