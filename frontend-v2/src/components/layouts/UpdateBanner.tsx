/**
 * UpdateBanner — tells the user when an over-the-air (OTA) update has been
 * downloaded and is ready, and lets them apply it with one tap.
 *
 * How OTA works here (see BUG_TRIAGE / EAS Update setup):
 *  - expo-updates checks for a new JS bundle on launch (`checkAutomatically:
 *    ON_LOAD` in app.json) and downloads it in the background.
 *  - When a bundle is downloaded and ready, `useUpdates().isUpdatePending`
 *    flips true. We surface this banner; tapping it calls `reloadAsync()`,
 *    which restarts into the new bundle instantly.
 *  - We also re-check when the app returns to the foreground, so someone in a
 *    long session gets prompted without a full cold start.
 *
 * Safety:
 *  - `Updates.isEnabled` is false in Expo Go and local dev (Metro), so this
 *    renders nothing there and never interferes with development.
 *  - Dismissing only hides the banner; the pending update still applies on the
 *    next natural cold start.
 *
 * Mounted once in app/_layout.tsx (alongside ToastHost / BugReportHost).
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable, AppState, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { UIText } from '@/src/components/ui/text';
import { captureException } from '@/src/services/sentry';

export function UpdateBanner() {
  const { isUpdatePending, checkError, downloadError } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Report update check/download failures so a device that can't fetch or apply
  // an OTA tells us why (part of the OTA diagnostics; pairs with the
  // isEmergencyLaunch reporter in sentry.ts and the Profile diagnostics modal).
  useEffect(() => {
    if (checkError) captureException(checkError, { context: 'Updates.checkError' });
  }, [checkError]);
  useEffect(() => {
    if (downloadError) captureException(downloadError, { context: 'Updates.downloadError' });
  }, [downloadError]);

  // Re-check for an update whenever the app comes back to the foreground, then
  // fetch it in the background. A successful fetch flips `isUpdatePending` and
  // shows the banner. Network errors / "no update" are expected and stay quiet.
  useEffect(() => {
    if (!Updates.isEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      Updates.checkForUpdateAsync()
        .then((res) => {
          if (res.isAvailable) return Updates.fetchUpdateAsync();
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);

  if (!Updates.isEnabled || !isUpdatePending || dismissed) return null;

  const reload = async () => {
    setReloading(true);
    try {
      await Updates.reloadAsync();
      // On success the app restarts, so nothing below runs.
    } catch (err) {
      captureException(err, { context: 'UpdateBanner.reloadAsync' });
      setReloading(false);
    }
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: 16,
        backgroundColor: '#6D469B',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        zIndex: 1000,
        elevation: 1000,
      }}
    >
      <Pressable
        onPress={reload}
        disabled={reloading}
        accessibilityRole="button"
        accessibilityLabel="Reload to apply the latest update"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
      >
        {reloading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="sparkles" size={16} color="#FFFFFF" />
        )}
        <UIText
          size="sm"
          numberOfLines={1}
          style={{ color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', flexShrink: 1 }}
        >
          {reloading ? 'Updating…' : 'A new version of Optio is ready'}
        </UIText>
        {!reloading && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.18)',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            <UIText size="xs" style={{ color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' }}>
              Tap to reload
            </UIText>
          </View>
        )}
      </Pressable>
      {!reloading && (
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notice"
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
        </Pressable>
      )}
    </View>
  );
}
