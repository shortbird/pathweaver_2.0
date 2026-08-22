/**
 * PhoneVerificationHost — the mobile half of the phone-verification hold.
 *
 * An org can require every adult account to verify a phone number by SMS
 * before using Optio (feature_flags.sis_settings.require_adult_phone_verification
 * — iCreate, Aug 2026). The rule is enforced in Flask middleware
 * (backend/middleware/phone_verification_gate.py), so it applies to EVERY
 * client, this app included: a held adult gets 403
 * `phone_verification_required` on everything except /api/auth/*.
 *
 * The verification flow itself only exists on the web app. Shipping the
 * backend gate without this screen left held adults with an app that logged in
 * and then failed every screen silently — 403 is in SILENCED_API_STATUSES, so
 * it did not even reach Sentry — with no way out from inside the app. 66
 * iCreate adults were using the native app at the time.
 *
 * So this is the stopgap, deliberately: it does not verify anything, it tells
 * them where to go and gets out of the way once they have been. The full flow
 * (enter a number, type back the code, here in the app) is the real fix and is
 * still to come.
 *
 * Two ways in, because either alone leaves a hole:
 *   - the status endpoint, checked when they authenticate, so a held adult
 *     sees this immediately rather than after something fails;
 *   - any 403 `phone_verification_required` from the API, which catches the
 *     adult who was already in the app when the school turned the flag on.
 *
 * Renders above the router rather than redirecting to a route, which keeps it
 * OTA-safe and out of the navigation tree entirely.
 *
 * Mounted once in app/_layout.tsx, alongside ToastHost / OtaUpdater.
 */

import { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { onPhoneVerificationRequired } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { UIText } from '@/src/components/ui';

const WEB_URL = 'https://www.optioeducation.com/verify-phone';

export function PhoneVerificationHost() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const logout = useAuthStore((s) => s.logout);
  const [held, setHeld] = useState(false);
  const [checking, setChecking] = useState(false);

  // `held` is per-account: signing out, or switching accounts, must not carry
  // one person's hold onto the next.
  useEffect(() => {
    if (!isAuthenticated) setHeld(false);
  }, [isAuthenticated, userId]);

  const check = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await api.get('/api/phone-verification/status');
      const blocked = !!(data?.required && !data?.verified);
      setHeld(blocked);
      return blocked;
    } catch {
      // A failed lookup is not a hold. The middleware still holds the real
      // line, and a network blip must not lock somebody out of their app.
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    void check();
  }, [isAuthenticated, userId, check]);

  // The adult who was already inside the app when the flag flipped.
  useEffect(() => onPhoneVerificationRequired(() => setHeld(true)), []);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      await check();
    } finally {
      setChecking(false);
    }
  }, [check]);

  if (!held || !isAuthenticated) return null;

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => {}}>
      <SafeAreaView className="flex-1 bg-white dark:bg-surface-dark">
        <View className="flex-1 justify-center px-7">
          <UIText className="text-2xl font-bold text-neutral-900 dark:text-white">
            Verify your phone number
          </UIText>

          <UIText className="mt-4 text-base leading-6 text-neutral-600 dark:text-neutral-300">
            Your school now asks every adult to verify a phone number before using Optio.
          </UIText>
          <UIText className="mt-3 text-base leading-6 text-neutral-600 dark:text-neutral-300">
            You cannot do that step in the app yet. Open the Optio website on this phone or on a
            computer, sign in, and follow the prompt. It takes about a minute and you only do it
            once.
          </UIText>
          <UIText className="mt-3 text-base leading-6 text-neutral-600 dark:text-neutral-300">
            Once you have finished, come back here and tap Check again.
          </UIText>

          <Pressable
            accessibilityRole="button"
            onPress={() => Linking.openURL(WEB_URL)}
            className="mt-8 rounded-xl bg-optio-purple px-5 py-4 active:opacity-80"
          >
            <UIText className="text-center text-base font-semibold text-white">
              Open the Optio website
            </UIText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={checking}
            onPress={recheck}
            className="mt-3 rounded-xl border border-neutral-300 px-5 py-4 active:opacity-80"
          >
            <UIText className="text-center text-base font-semibold text-optio-purple">
              {checking ? 'Checking…' : 'Check again'}
            </UIText>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => logout()} className="mt-6">
            <UIText className="text-center text-sm text-neutral-500">Sign out</UIText>
          </Pressable>

          <UIText className="mt-8 text-center text-xs leading-5 text-neutral-400">
            If you cannot receive text messages, contact your school office and they will sort your
            account out by hand.
          </UIText>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default PhoneVerificationHost;
