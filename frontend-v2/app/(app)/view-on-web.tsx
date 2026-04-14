import React from 'react';
import { View, Linking, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText, Button, ButtonText, VStack } from '@/src/components/ui';

const WEB_ORIGIN = 'https://www.optioeducation.com';

export default function ViewOnWebScreen() {
  const params = useLocalSearchParams<{ path?: string; label?: string }>();
  const path = typeof params.path === 'string' ? params.path : '/';
  const label = typeof params.label === 'string' ? params.label : 'this page';
  const url = `${WEB_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;

  const openInBrowser = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
    } catch {
      /* noop */
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <View className="flex-1 items-center justify-center px-6">
        <VStack space="lg" className="items-center max-w-sm">
          <View className="w-16 h-16 rounded-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="globe-outline" size={32} color="#6D469B" />
          </View>
          <Heading size="lg" className="text-center">Open on the web</Heading>
          <UIText size="sm" className="text-typo-500 text-center">
            {label} isn't available in the mobile app yet. Open it on optioeducation.com to continue.
          </UIText>
          <VStack space="sm" className="w-full">
            <Button size="lg" onPress={openInBrowser} className="w-full">
              <ButtonText>Open in browser</ButtonText>
            </Button>
            <Pressable
              onPress={() => router.back()}
              className="items-center py-3"
            >
              <UIText size="sm" className="text-typo-500">Go back</UIText>
            </Pressable>
          </VStack>
          {Platform.OS !== 'web' && (
            <UIText size="xs" className="text-typo-400 text-center mt-2">
              {url}
            </UIText>
          )}
        </VStack>
      </View>
    </SafeAreaView>
  );
}
