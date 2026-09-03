/**
 * PaperworkHost — the mobile half of the paperwork (signature) hold.
 *
 * A school can send a family a document marked REQUIRED (iCreate, Aug 2026).
 * The rule is enforced in Flask middleware (backend/middleware/signature_gate.py),
 * so it applies to EVERY client, this app included: a held guardian gets 403
 * `signature_required` on everything except /api/auth/* and the signing flow.
 *
 * Signing itself only exists on the web app. Shipping the backend gate without
 * this screen left held parents with an app that logged in and then failed
 * every screen silently — 403 is in SILENCED_API_STATUSES, so it did not even
 * reach Sentry — with no way out from inside the app (Lydia Barlow's family,
 * plus 13 other iCreate guardians, 2026-08-24). Same story, same shape as
 * PhoneVerificationHost directly beside this file.
 *
 * So this is the stopgap, deliberately: it does not render or sign anything,
 * it tells them where to go and gets out of the way once they have signed.
 *
 * Two ways in, because either alone leaves a hole:
 *   - the status endpoint, checked when they authenticate, so a held parent
 *     sees this immediately rather than after something fails;
 *   - any 403 `signature_required` from the API, which catches the parent who
 *     was already in the app when the school sent the document.
 *
 * Renders above the router rather than redirecting to a route, which keeps it
 * OTA-safe and out of the navigation tree entirely.
 *
 * Mounted once in app/_layout.tsx, alongside PhoneVerificationHost.
 */

import { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { onSignatureRequired } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { UIText } from '@/src/components/ui';

// The site root, not a deep link: the web app routes a held guardian to the
// signing page itself the moment they are logged in (frontend api.js).
const WEB_URL = 'https://www.optioeducation.com';

export function PaperworkHost() {
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
      // Allowlisted by the gate, takes no org id, answers `blocked` for
      // everybody — held or not (routes/sis/parent.py, required-documents).
      const { data } = await api.get('/api/sis/parent/required-documents');
      const blocked = !!data?.blocked;
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

  // The parent who was already inside the app when the document was sent.
  useEffect(() => onSignatureRequired(() => setHeld(true)), []);

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
      <SafeAreaView className="flex-1 bg-white dark:bg-dark-surface">
        <View className="flex-1 justify-center px-7">
          <UIText className="text-2xl font-bold text-neutral-900 dark:text-white">
            You have unfinished paperwork
          </UIText>

          <UIText className="mt-4 text-base leading-6 text-neutral-600 dark:text-neutral-300">
            Your school has sent your family a document that needs your signature before you can
            keep using Optio.
          </UIText>
          <UIText className="mt-3 text-base leading-6 text-neutral-600 dark:text-neutral-300">
            Signing is not available in the app yet. Log into www.optioeducation.com on a web
            browser — on this phone or on a computer — and you will be taken straight to the
            paperwork to finish it.
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
              Open www.optioeducation.com
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
            If you have already signed on paper or cannot sign online, contact your school office
            and they will sort your account out by hand.
          </UIText>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default PaperworkHost;
