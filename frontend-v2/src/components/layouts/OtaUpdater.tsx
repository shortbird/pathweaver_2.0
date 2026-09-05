/**
 * OtaUpdater — silently keeps the app's over-the-air (OTA) JS bundle current.
 *
 * Renders NOTHING. There is intentionally no "a new version is ready" banner or
 * "tap to reload" button. Apple App Store Review (Guideline 4 - Design) and
 * Google Play both reject in-app prompts that tell the user to "update" the app
 * unless that button deep-links to the store listing. A previous version of this
 * file showed an OTA reload banner ("A new version of Optio is ready"), which a
 * reviewer read as a prohibited fake-update prompt. OTA updates themselves are
 * allowed — only the user-facing "update" framing was the problem — so we keep
 * the OTA delivery and drop the UI.
 *
 * How OTA works here (see EAS Update setup):
 *  - expo-updates checks for a new JS bundle on launch (`checkAutomatically:
 *    ON_LOAD` in app.json) and downloads it in the background.
 *  - This component additionally re-checks and re-downloads whenever the app
 *    returns to the foreground, so a downloaded bundle is ready sooner.
 *  - A downloaded update is applied automatically by expo-updates on the next
 *    natural cold start — no prompt, no forced mid-session reload.
 *
 * Safety:
 *  - `Updates.isEnabled` is false in Expo Go and local dev (Metro), so the
 *    check/download effect no-ops there and never interferes with development.
 *
 * Mounted once in app/_layout.tsx (alongside ToastHost / BugReportHost).
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { captureMessage } from '@/src/services/sentry';

// Android's catch-all wrapper for any failure fetching the update manifest. It
// is a fixed literal in expo-updates' FileDownloader.downloadRemoteUpdate, not
// a description of what went wrong — see the note in reportOtaIssue below.
const ANDROID_OPAQUE_FETCH_FAILURE = /failed to download remote update/i;

// Report an OTA check/download failure as a deduped warning rather than an
// exception. expo-updates hands these back as plain `{ message }` objects, and
// the same failed fetch re-fires on every foreground re-check — passing that
// non-Error object to captureException produced an "Object captured as
// exception" issue that escalated to 18 events on a single flaky device
// (NODE-4B). These are transient network conditions, not crashes, so we keep
// the diagnostic but at warning level with a stable fingerprint so a flapping
// device collapses into one issue.
function reportOtaIssue(kind: 'check' | 'download', err: unknown): void {
  const message =
    err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
  // Pure offline / connectivity failures are expected (the device just can't
  // reach the OTA server) and not actionable — don't report them at all. This
  // is the bulk of the noise: "The Internet connection appears to be offline"
  // re-fires on every foreground re-check (NODE-48). A timeout is the same
  // condition on a slow rather than absent connection ("Unknown error: The
  // request timed out", OPTIO-MOBILE-5) — the next foreground re-check gets the
  // update. Keep reporting genuine check/download failures (bad bundle, server
  // errors) below.
  if (/offline|network\s*error|internet connection|timed?\s*out/i.test(message)) return;
  // Everything above is an iOS string, and that is not a coincidence: iOS
  // propagates the underlying NSURLError, so a weak connection arrives already
  // named. Android never does. FileDownloader.downloadRemoteUpdate wraps EVERY
  // exception it can hit — socket timeout, DNS failure, connection reset, TLS
  // handshake — in a fixed `IOException("Failed to download remote update", e)`,
  // and only that outer message crosses the bridge. The cause stays on the
  // native side. So the filter above cannot match on Android however many
  // strings we add to it, and every foreground re-check on a bad connection was
  // being reported as a genuine OTA failure.
  //
  // Dropping it outright would be the wrong trade — a silently undelivered OTA
  // is the failure that cost six releases (see the isEmergencyLaunch reporter in
  // sentry.ts). But one failed manifest fetch is not that failure. The signal
  // that means "this device cannot get updates" is the device still running the
  // bundle it shipped with; a device already on an OTA bundle demonstrably
  // reached the server before and will re-check on the next foreground.
  //
  // OPTIO-MOBILE-5 was exactly this: 3 Android devices, all reporting
  // ota_embedded=false, i.e. all successfully running OTA updates the whole time
  // they were "failing".
  if (ANDROID_OPAQUE_FETCH_FAILURE.test(message) && !Updates.isEmbeddedLaunch) return;
  captureMessage(`[OTA] ${kind} failed: ${message}`, {
    level: 'warning',
    fingerprint: [`ota-${kind}-error`],
    tags: { feature: 'ota_diagnostics' },
    extra: { kind, message },
  });
}

export function OtaUpdater() {
  const { checkError, downloadError } = Updates.useUpdates();

  // Report update check/download failures so a device that can't fetch an OTA
  // tells us why (part of the OTA diagnostics; pairs with the
  // isEmergencyLaunch reporter in sentry.ts and the Profile diagnostics modal).
  useEffect(() => {
    if (checkError) reportOtaIssue('check', checkError);
  }, [checkError]);
  useEffect(() => {
    if (downloadError) reportOtaIssue('download', downloadError);
  }, [downloadError]);

  // Re-check for an update whenever the app comes back to the foreground, then
  // fetch it in the background. The downloaded bundle is applied automatically
  // on the next cold start. Network errors / "no update" are expected and stay
  // quiet.
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

  return null;
}
