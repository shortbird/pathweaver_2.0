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
  captureMessage(msg: string, extras?: Extras): void;
  setUser(user: { id: string; email?: string } | null): void;
}

let impl: SentryShim | null = null;
let initialized = false;

function makeNoopShim(): SentryShim {
  return {
    init: () => {},
    captureException: () => {},
    captureMessage: () => {},
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
      enableAutoSessionTracking: true,
      tracesSampleRate: __DEV__ ? 1.0 : 0.1,
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

export function captureMessage(msg: string, extras?: Extras): void {
  (impl ?? makeNoopShim()).captureMessage(msg, extras);
}

export function setSentryUser(user: { id: string; email?: string } | null): void {
  (impl ?? makeNoopShim()).setUser(user);
}
