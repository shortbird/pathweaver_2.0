import React from 'react';
import { View, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Heading, UIText, Button, ButtonText, VStack, toast } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { safeOpenURL } from '@/src/utils/linking';

/** The web build is one SPA on two hosts: the learning app and the staff SIS
 *  console. deepLinkRouter says which one owns the path — sending a SIS path to
 *  www offers a page that host does not serve, which is what an iCreate
 *  coordinator hit tapping her inbox notifications (2026-09-03). */
const LEARNING_ORIGIN = 'https://www.optioeducation.com';
const SIS_ORIGIN = 'https://sis.optioeducation.com';

export default function ViewOnWebScreen() {
  const c = useThemeColors();
  const params = useLocalSearchParams<{ path?: string; label?: string; surface?: string }>();
  const path = typeof params.path === 'string' ? params.path : '/';
  const label = typeof params.label === 'string' ? params.label : 'this page';
  // Default to the learning app: an unknown/absent surface is far more likely
  // to be a www page, and that was the only behaviour before.
  const origin = params.surface === 'sis' ? SIS_ORIGIN : LEARNING_ORIGIN;
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;

  const openInBrowser = async () => {
    // safeOpenURL, not Linking.openURL: it guards the scheme and never throws.
    // The old catch swallowed failures silently, so a link that refused to open
    // looked identical to a button that did nothing.
    const opened = await safeOpenURL(url);
    if (!opened) toast.error(`Couldn't open the page. You can find it at ${url.replace('https://', '')}.`);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <View className="flex-1 items-center justify-center px-6">
        <VStack space="lg" className="items-center max-w-sm">
          <View className="w-16 h-16 rounded-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="globe-outline" size={32} color={c.brand} />
          </View>
          <Heading size="lg" className="text-center">Open on the web</Heading>
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 text-center">
            {label} isn't available in the mobile app yet. Open it in your browser to continue.
          </UIText>
          <VStack space="sm" className="w-full">
            <Button size="lg" onPress={openInBrowser} className="w-full">
              <ButtonText>Open in browser</ButtonText>
            </Button>
            <Pressable
              onPress={() => router.back()}
              className="items-center py-3"
            >
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Go back</UIText>
            </Pressable>
          </VStack>
          {Platform.OS !== 'web' && (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center mt-2">
              {url}
            </UIText>
          )}
        </VStack>
      </View>
    </SafeAreaView>
  );
}
