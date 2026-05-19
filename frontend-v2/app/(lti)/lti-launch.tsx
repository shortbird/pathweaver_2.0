/**
 * LTI launch handoff.
 *
 * Canvas → backend /lti/launch verifies the id_token and redirects the
 * iframe here with `?code=<one-time>&mode=<deep_link?>`. We exchange the
 * code via POST /lti/token, store the resulting Bearer tokens in
 * `tokenStore`, and route into the actual page (quest detail or
 * deep-link form).
 */

import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '@/src/services/api';
import { tokenStore } from '@/src/services/tokenStore';
import { useAuthStore } from '@/src/stores/authStore';
import { LtiShell } from '@/src/components/lti/LtiShell';

export default function LtiLaunch() {
  const params = useLocalSearchParams<{ code?: string; mode?: string }>();
  const [error, setError] = useState<string | null>(null);
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    const code = params.code;
    if (!code) {
      setError('Missing launch code.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post('/lti/token', { code });
        if (cancelled) return;
        if (!data?.access_token || !data?.refresh_token) {
          setError('Launch token exchange failed.');
          return;
        }
        await tokenStore.setTokens(data.access_token, data.refresh_token);
        // Hydrate user — same flow as a normal login.
        await loadUser();
        if (cancelled) return;

        const target = data.target_path || '/dashboard';
        // Routes within (lti) — strip the group prefix when navigating.
        if (params.mode === 'deep_link' || target === '/lti/deep-link') {
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
        // Fallback — no specific quest. Land on a friendly placeholder.
        router.replace({ pathname: '/(lti)/error' as any, params: { reason: 'no_target' } });
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Launch failed';
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.code, params.mode]);

  if (error) {
    return <LtiShell error={error} />;
  }

  return <LtiShell loading />;
}
