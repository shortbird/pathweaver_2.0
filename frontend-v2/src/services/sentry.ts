/**
 * Sentry wiring (E1).
 *
 * We call `initSentry()` once at app startup. When `@sentry/react-native` is
 * installed and `EXPO_PUBLIC_SENTRY_DSN` is configured, we initialize real
 * Sentry. Otherwise we fall back to a no-op shim so the rest of the app can
 * always call `captureException` / `captureMessage` without branching.
 *
 * Deliberately does NOT add `@sentry/react-native` as a hard dependency —
 * install + configure the DSN when you're ready to ship crash reporting.
 */

import Constants from 'expo-constants';

type Extras = Record<string, unknown>;

interface SentryShim {
  init(opts: { dsn: string; release?: string; environment?: string }): void;
  captureException(err: unknown, extras?: Extras): void;
  captureMessage(msg: string, extras?: Extras): string | undefined;
  setUser(user: { id: string; email?: string } | null): void;
}

let impl: SentryShim | null = null;
let initialized = false;

function makeNoopShim(): SentryShim {
  return {
    init: () => {},
    captureException: () => {},
    captureMessage: () => undefined,
    setUser: () => {},
  };
}

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    impl = makeNoopShim();
    return;
  }

  try {
    // Dynamic require so the app builds cleanly without @sentry/react-native installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/react-native');
    const release =
      (Constants.expoConfig?.version as string | undefined) ||
      (Constants.expoConfig?.extra?.appVersion as string | undefined);
    Sentry.init({
      dsn,
      release,
      environment: __DEV__ ? 'development' : 'production',
      // Don't ship events from local Metro dev sessions — those produced pure
      // noise (Metro ConnectException, simulator "Network Error" blips) that
      // buried real reports. Release/TestFlight builds run with __DEV__ === false
      // and still report normally.
      enabled: !__DEV__,
      enableAutoSessionTracking: true,
      tracesSampleRate: __DEV__ ? 1.0 : 0.1,
      // Session Replay: record 10% of all sessions and 100% of sessions that hit
      // an error. The SDK masks all text/images/vectors by default (privacy-safe);
      // mobileReplayIntegration keeps that default masking.
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [Sentry.mobileReplayIntegration()],
      // Last-line filter for known-benign transport noise that can still slip
      // through in a release build (e.g. a transient offline blip). Real backend
      // 5xx/regressions are unaffected — they carry a response/status.
      beforeSend(event: any) {
        const type = event?.exception?.values?.[0]?.type ?? '';
        const value = event?.exception?.values?.[0]?.value ?? '';
        if (/ConnectException/i.test(type) && /:8081|metro|packager/i.test(value)) {
          return null;
        }
        return event;
      },
    });
    impl = Sentry as SentryShim;
    tagOtaContext(Sentry);
  } catch {
    // Module not installed yet — silently fall back.
    impl = makeNoopShim();
  }
}

/**
 * Tag every event with which JS bundle the device is actually running: the
 * embedded build vs a downloaded OTA update (and its id/channel/runtime). This
 * is how we tell, from a real device, whether an OTA "stuck" — if a session that
 * just tapped the reload banner still reports `ota_embedded: true`, the update
 * rolled back. Also tags the bundle onto the document-scanner failures so we know
 * which version produced them. All reads are guarded; expo-updates is absent in
 * Expo Go / web preview.
 */
function tagOtaContext(Sentry: any): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates = require('expo-updates');
    const tags: Record<string, string> = {
      ota_enabled: String(!!Updates.isEnabled),
      ota_embedded: String(!!Updates.isEmbeddedLaunch),
      ota_update_id: Updates.updateId ?? 'embedded',
      ota_channel: Updates.channel ?? 'unknown',
      ota_runtime: Updates.runtimeVersion ?? 'unknown',
    };
    if (typeof Sentry.setTag === 'function') {
      for (const [k, v] of Object.entries(tags)) Sentry.setTag(k, v);
    }
  } catch {
    // expo-updates not available (Expo Go / web) — skip.
  }
}

export function captureException(err: unknown, extras?: Extras): void {
  (impl ?? makeNoopShim()).captureException(err, extras);
}

export function captureMessage(msg: string, extras?: Extras): string | undefined {
  return (impl ?? makeNoopShim()).captureMessage(msg, extras);
}

export function setSentryUser(user: { id: string; email?: string } | null): void {
  (impl ?? makeNoopShim()).setUser(user);
}

/**
 * Report an in-app "shake to report a bug" submission as its OWN Sentry issue.
 *
 * Plain captureMessage groups every report under one issue (Sentry fingerprints
 * by the identical call stack), so 36 reports collapsed into ~3 issues and were
 * effectively invisible. We give each report a unique fingerprint so it lands as
 * a distinct issue titled with the user's words, tag it `feature:bug_report` so
 * the whole inbox is one filter (`is:unresolved feature:bug_report`), and attach
 * the diagnostics so the issue is actionable without opening the DB. The returned
 * event id is stored on the bug_reports row, so a Sentry issue cross-links back
 * to its full record (incl. screenshot) via that id.
 */
export function captureBugReport(
  message: string,
  meta: {
    reportId: string;
    route?: string | null;
    platform?: string;
    build?: string | null;
    appVersion?: string | null;
    diagnostics?: Extras;
  },
): string | undefined {
  return captureMessage(`[Bug] ${message.slice(0, 120)}`, {
    level: 'warning',
    // Unique per submission → one Sentry issue per report (no stack-based merge).
    fingerprint: ['bug-report', meta.reportId],
    tags: {
      feature: 'bug_report',
      report_route: meta.route ?? 'unknown',
      report_platform: meta.platform ?? 'unknown',
      report_build: meta.build ?? 'unknown',
    },
    contexts: {
      bug_report: {
        report_id: meta.reportId,
        route: meta.route ?? null,
        platform: meta.platform ?? null,
        build: meta.build ?? null,
        app_version: meta.appVersion ?? null,
      },
      diagnostics: meta.diagnostics ?? {},
    },
  });
}
