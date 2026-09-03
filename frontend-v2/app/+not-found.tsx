import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { getInitialNotificationLink } from '@/src/services/pushNotifications';
import { resolveDeepLink } from '@/src/services/deepLinkRouter';
import { useThemeColors } from '@/src/hooks/useThemeColors';

/**
 * Catch-all for unmatched routes.
 *
 * A notification tap can cold-start the app with a raw launch URL (e.g. the bare
 * scheme "optio:///") that expo-router's native linking can't match — landing
 * here on what used to be the default "Unmatched Route" screen (reads as a
 * crash). Rather than just bouncing home, we recover the notification that
 * brought the user here and send them to its real destination (the messages
 * tab, a bounty, etc.). If there's no notification link to recover, fall back to
 * the index, which routes to the user's auth-appropriate landing.
 *
 * The resolved PARAMS travel with the target. This path used to keep only the
 * target, so a cold start — which is what a push tap does when the app is not
 * already running — dropped them: a DM notification lost its ?user= and landed
 * on the conversation list rather than the conversation, and a view-on-web
 * handoff lost the path it was supposed to offer and fell back to the site
 * root. The warm handlers in (app)/_layout.tsx and notifications.tsx have
 * always passed params through; this one was the odd one out.
 */
export default function NotFound() {
  const c = useThemeColors();
  const [href, setHref] = useState<
    string | { pathname: string; params?: Record<string, string> } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const link = await getInitialNotificationLink();
        const resolved = resolveDeepLink(link);
        if (!cancelled && resolved?.target) {
          setHref(resolved.params
            ? { pathname: resolved.target, params: resolved.params }
            : resolved.target);
          return;
        }
      } catch {
        // fall through to the home fallback
      }
      if (!cancelled) setHref('/');
    })();
    return () => { cancelled = true; };
  }, []);

  if (!href) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-50 dark:bg-dark-surface-50">
        <ActivityIndicator size="large" color={c.brand} />
      </View>
    );
  }

  return <Redirect href={href as any} />;
}
