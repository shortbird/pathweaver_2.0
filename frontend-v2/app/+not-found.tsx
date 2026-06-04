import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { getInitialNotificationLink } from '@/src/services/pushNotifications';
import { resolveDeepLink } from '@/src/services/deepLinkRouter';

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
 */
export default function NotFound() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const link = await getInitialNotificationLink();
        const resolved = resolveDeepLink(link);
        if (!cancelled && resolved?.target) {
          setHref(resolved.target);
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
        <ActivityIndicator size="large" color="#6D469B" />
      </View>
    );
  }

  return <Redirect href={href as any} />;
}
