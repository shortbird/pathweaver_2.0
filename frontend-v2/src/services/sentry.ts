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
  } catch {
    // Module not installed yet — silently fall back.
    impl = makeNoopShim();
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
