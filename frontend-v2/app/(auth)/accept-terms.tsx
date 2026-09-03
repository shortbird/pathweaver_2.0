/**
 * Accept Terms - consent step for OAuth (Google/Apple) sign-ups.
 *
 * The backend answers a first-time OAuth sign-in with requires_tos_acceptance
 * and a short-lived tos_acceptance_token instead of a session; the account is
 * only created once the user actually accepts. The store parks that token in
 * pendingTosToken and routes here (previously the app auto-accepted on the
 * user's behalf, which defeated the gate). Mirrors the v1 web TOS modal.
 */
import React from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { safeOpenURL } from '@/src/utils/linking';
import { toast } from '@/src/stores/toastStore';
import { VStack, Heading, UIText, Button, ButtonText } from '@/src/components/ui';

const TERMS_URL = 'https://www.optioeducation.com/terms';
const PRIVACY_URL = 'https://www.optioeducation.com/privacy';

// Same pattern as register.tsx: in-app route on web, external browser on native.
async function openLegal(url: string, webPath: string) {
  if (Platform.OS === 'web') {
    router.push(webPath as any);
    return;
  }
  const opened = await safeOpenURL(url);
  if (!opened) toast.error("Couldn't open the page. You can find it at optioeducation.com.");
}

export default function AcceptTermsScreen() {
  const pendingTosToken = useAuthStore((s) => s.pendingTosToken);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const acceptPendingTos = useAuthStore((s) => s.acceptPendingTos);
  const declinePendingTos = useAuthStore((s) => s.declinePendingTos);

  // Deep-linked here with nothing pending (or after a decline) — nothing to do.
  if (!pendingTosToken) {
    return <Redirect href="/(auth)/login" />;
  }

  const handleAccept = async () => {
    try {
      await acceptPendingTos();
    } catch {
      // Store already surfaced the error message below.
    }
  };

  const handleDecline = () => {
    declinePendingTos();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <View className="flex-1 justify-center px-7 max-w-lg w-full self-center">
        <VStack space="md">
          <Heading size="xl">One last step</Heading>
          <UIText className="text-typo-500 dark:text-dark-typo-500">
            To create your Optio account, please review and accept our{' '}
            <UIText
              className="text-optio-purple underline"
              onPress={() => openLegal(TERMS_URL, '/terms')}
            >
              Terms of Service
            </UIText>
            {' '}and{' '}
            <UIText
              className="text-optio-purple underline"
              onPress={() => openLegal(PRIVACY_URL, '/privacy')}
            >
              Privacy Policy
            </UIText>
            .
          </UIText>

          {error ? <UIText size="sm" className="text-red-500">{error}</UIText> : null}

          <Button size="lg" className="mt-4" onPress={handleAccept} loading={isLoading} disabled={isLoading}>
            <ButtonText>I agree — create my account</ButtonText>
          </Button>
          <Button size="lg" variant="outline" onPress={handleDecline} disabled={isLoading}>
            <ButtonText>Cancel</ButtonText>
          </Button>
        </VStack>
      </View>
    </SafeAreaView>
  );
}
