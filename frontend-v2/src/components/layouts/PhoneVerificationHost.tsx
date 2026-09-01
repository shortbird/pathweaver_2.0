/**
 * PhoneVerificationHost — the mobile half of the phone-verification hold.
 *
 * An org can require every adult account to verify a phone number by SMS
 * before using Optio (feature_flags.sis_settings.require_adult_phone_verification
 * — iCreate, Aug 2026). The rule is enforced in Flask middleware
 * (backend/middleware/phone_verification_gate.py), so it applies to EVERY
 * client, this app included: a held adult gets 403
 * `phone_verification_required` on everything except /api/auth/* and
 * /api/phone-verification/*.
 *
 * This used to be a stopgap that could not verify anything — it told people to
 * go find a browser. That was shipped knowingly, to stop held adults sitting in
 * an app that failed every screen in silence (403 is in SILENCED_API_STATUSES,
 * so it never even reached Sentry). It was never a good answer: the people most
 * likely to be held are parents, the app is where parents live, and "open a
 * computer" is the one instruction a phone cannot follow well.
 *
 * The flow now runs here. Same two steps and the same endpoints as the web
 * screen (pages/PhoneVerificationPage.jsx): send a code to a number, type the
 * code back. The backend allowlists /api/phone-verification for held callers
 * precisely so this can work from inside the hold.
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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { onPhoneVerificationRequired } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { UIText, toast } from '@/src/components/ui';

/** Matches the server's own resend cooldown, so the button and the API agree. */
const RESEND_SECONDS = 60;

export function PhoneVerificationHost() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const logout = useAuthStore((s) => s.logout);

  const [held, setHeld] = useState(false);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<TextInput>(null);

  // `held` is per-account: signing out, or switching accounts, must not carry
  // one person's hold onto the next.
  useEffect(() => {
    if (!isAuthenticated) {
      setHeld(false);
      setStep('phone');
      setCode('');
    }
  }, [isAuthenticated, userId]);

  const check = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await api.get('/api/phone-verification/status');
      const blocked = !!(data?.required && !data?.verified);
      setHeld(blocked);
      // The number the school already holds for them — their own row, else the
      // one a parent typed into the registration funnel. Saves retyping the
      // number we are about to text.
      if (blocked && data?.prefill) setPhone((p) => p || String(data.prefill));
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

  useEffect(() => {
    if (!cooldown) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/api/phone-verification/send-code', { phone });
      setMaskedPhone(data?.phone || null);
      // Local dev only: with SMS_PROVIDER=console the code went to the server
      // log, not to a handset, so there is no other way to finish the flow.
      setDevCode(data?.dev_code || null);
      setCode('');
      setStep('code');
      setCooldown(RESEND_SECONDS);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err: any) {
      const data = err?.response?.data;
      // 429 carries how long the server wants us to wait; honour it rather
      // than letting them hammer a button that cannot succeed.
      if (data?.retry_after) setCooldown(data.retry_after);
      toast.error(data?.error || 'Could not send the code');
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const verify = useCallback(async () => {
    setBusy(true);
    try {
      await api.post('/api/phone-verification/verify', { code });
      toast.success('Phone number verified');
      // The middleware never caches a held answer, so the very next request is
      // already free — dismissing is all that is left to do.
      setHeld(false);
      setStep('phone');
      setCode('');
      setDevCode(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  }, [code]);

  if (!held || !isAuthenticated) return null;

  const onPhoneStep = step === 'phone';

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => {}}>
      <SafeAreaView className="flex-1 bg-white dark:bg-dark-surface">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28 }}
            keyboardShouldPersistTaps="handled"
          >
            <UIText className="text-2xl font-bold text-neutral-900 dark:text-white">
              Verify your phone number
            </UIText>
            <UIText className="mt-4 text-base leading-6 text-neutral-600 dark:text-neutral-300">
              Your school asks every adult to verify a phone number, so they can reach you when it
              matters. It takes about a minute and you only do it once.
            </UIText>

            {onPhoneStep ? (
              <View className="mt-7">
                <UIText className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  Mobile phone number
                </UIText>
                <TextInput
                  testID="phone-input"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="801-555-0123"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  editable={!busy}
                  className="mt-2 rounded-xl border border-neutral-300 px-4 py-3.5 text-base text-neutral-900 dark:text-white dark:border-dark-surface-300"
                />
                <UIText className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  We&rsquo;ll text a 6-digit code to this number.
                </UIText>

                <Pressable
                  accessibilityRole="button"
                  disabled={busy || !phone.trim() || cooldown > 0}
                  onPress={sendCode}
                  className={`mt-6 rounded-xl bg-optio-purple px-5 py-4 active:opacity-80 ${
                    busy || !phone.trim() || cooldown > 0 ? 'opacity-50' : ''
                  }`}
                >
                  <UIText className="text-center text-base font-semibold text-white">
                    {busy ? 'Sending…' : cooldown > 0 ? `Wait ${cooldown}s` : 'Text me a code'}
                  </UIText>
                </Pressable>
              </View>
            ) : (
              <View className="mt-7">
                <UIText className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  {maskedPhone ? `Enter the code we sent to ${maskedPhone}` : 'Enter the code we sent'}
                </UIText>
                <TextInput
                  testID="code-input"
                  ref={codeRef}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  // The OS offers the code straight from the text message on
                  // both platforms; typing it by hand is the fallback, not the
                  // expected path.
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  editable={!busy}
                  className="mt-2 rounded-xl border border-neutral-300 px-4 py-3.5 text-center text-2xl tracking-[8px] text-neutral-900 dark:text-white dark:border-dark-surface-300"
                />

                {devCode ? (
                  <UIText className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Local dev: the code is {devCode}
                  </UIText>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={busy || code.length !== 6}
                  onPress={verify}
                  className={`mt-6 rounded-xl bg-optio-purple px-5 py-4 active:opacity-80 ${
                    busy || code.length !== 6 ? 'opacity-50' : ''
                  }`}
                >
                  <UIText className="text-center text-base font-semibold text-white">
                    {busy ? 'Checking…' : 'Verify'}
                  </UIText>
                </Pressable>

                <View className="mt-4 flex-row items-center justify-between">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => { setStep('phone'); setCode(''); setDevCode(null); }}
                  >
                    <UIText className="text-sm text-neutral-500 dark:text-neutral-400">
                      Use a different number
                    </UIText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || cooldown > 0}
                    onPress={sendCode}
                  >
                    <UIText
                      className={`text-sm font-semibold text-optio-purple ${
                        busy || cooldown > 0 ? 'opacity-50' : ''
                      }`}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </UIText>
                  </Pressable>
                </View>
              </View>
            )}

            <Pressable accessibilityRole="button" onPress={() => logout()} className="mt-8">
              <UIText className="text-center text-sm text-neutral-500">Sign out</UIText>
            </Pressable>

            {/* The way out for somebody who genuinely cannot receive a text.
                Nobody should be stuck on a screen whose only exit is the one
                action they cannot take. */}
            <UIText className="mt-6 text-center text-xs leading-5 text-neutral-400">
              No mobile phone, or not receiving the text? Contact your school office and they will
              sort your account out by hand.
            </UIText>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export default PhoneVerificationHost;
