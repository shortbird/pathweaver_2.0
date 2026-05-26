/**
 * LTI launch handoff.
 *
 * Canvas → backend /lti/launch verifies the id_token and redirects the
 * iframe here with `?code=<one-time>&mode=<deep_link|pending>?`. We
 * exchange the code via POST /lti/token, store the resulting Bearer tokens
 * in `tokenStore`, and route into the actual page (quest detail or
 * deep-link form).
 *
 * `mode=pending` is the deferred student flow: the backend has NOT created
 * a `users` row yet. We deliberately do NOT auto-exchange — we render a
 * single-button "Enter Optio" landing and only call /lti/token when the
 * student clicks. That call is what materializes the Optio account, so a
 * passive Canvas iframe load (course-nav tile, embedded page) never
 * spawns a shadow user.
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { useAuthStore } from '@/src/stores/authStore';
import { LtiShell } from '@/src/components/lti/LtiShell';
import { Button, ButtonText } from '@/src/components/ui';

export default function LtiLaunch() {
  const params = useLocalSearchParams<{ code?: string; mode?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [exchangeStarted, setExchangeStarted] = useState(false);
  const loadUser = useAuthStore((s) => s.loadUser);

  const code = params.code;
  const mode = params.mode;
  const isPending = mode === 'pending';

  const runExchange = useCallback(async () => {
    if (!code || exchangeStarted) return;
    setExchangeStarted(true);
    setExchanging(true);
    try {
      const { data } = await api.post('/lti/token', { code });
      if (!data?.access_token || !data?.refresh_token) {
        setError('Launch token exchange failed.');
        return;
      }
      await tokenStore.setTokens(data.access_token, data.refresh_token);
      // Hydrate user — same flow as a normal login.
      await loadUser();

      const target = data.target_path || '/dashboard';
      // Routes within (lti) — strip the group prefix when navigating.
      if (mode === 'deep_link' || target === '/lti/deep-link') {
        router.replace({
          pathname: '/(lti)/deep-link' as any,
          params: { code },
        });
        return;
      }
      if (data.quest_id) {
        router.replace({
          pathname: '/(lti)/quest/[id]' as any,
          params: { id: data.quest_id },
        });
        return;
      }
      router.replace({ pathname: '/(lti)/error' as any, params: { reason: 'no_target' } });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Launch failed';
      setError(msg);
      // Allow retry on a soft (network) error — backend hasn't consumed
      // the code unless the request reached it.
      // (Response-bearing errors mean the code is gone, so don't unguard.)
      // @ts-expect-error — runtime shape from axios
      if (!e?.response) setExchangeStarted(false);
    } finally {
      setExchanging(false);
    }
  }, [code, exchangeStarted, loadUser, mode]);

  useEffect(() => {
    if (!code) {
      setError('Missing launch code.');
      return;
    }
    // Pending student flow: do not auto-exchange. The user's click on
    // "Enter Optio" below is what triggers the exchange and materializes
    // their Optio account.
    if (isPending) return;
    runExchange();
  }, [code, isPending, runExchange]);

  if (error) {
    return <LtiShell error={error} />;
  }
  if (!isPending || exchanging) {
    return <LtiShell loading />;
  }

  return (
    <LtiShell
      title="Welcome from Canvas"
      subtitle="Click below to enter Optio and continue with your assignment."
    >
      <View className="mt-4 items-center">
        <Button
          variant="solid"
          action="primary"
          size="md"
          onPress={runExchange}
          disabled={exchanging}
          testID="lti-launch-enter"
        >
          <ButtonText>Enter Optio</ButtonText>
        </Button>
      </View>
    </LtiShell>
  );
}
