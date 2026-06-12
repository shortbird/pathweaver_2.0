/**
 * Sentry wiring for the web app (v1).
 *
 * Initialized once from main.jsx. No-op unless VITE_SENTRY_DSN is set, so local
 * dev and any build without the env var stay silent. Mirrors the mobile setup:
 * error capture, light performance tracing, and masked session replay
 * (10% of sessions, 100% of sessions that hit an error).
 */

import * as Sentry from '@sentry/react';

let initialized = false;

function dsn() {
  return import.meta.env.VITE_SENTRY_DSN;
}

export function initSentry() {
  if (initialized) return;
  initialized = true;

  if (!dsn()) return; // No DSN → stay a no-op (local dev / unconfigured build).

  Sentry.init({
    dsn: dsn(),
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT
      || (import.meta.env.PROD ? 'production' : 'development'),
    // Release ties each issue to the deploy that produced it. The Vite plugin
    // injects one at build time; VITE_SENTRY_RELEASE overrides.
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session Replay with privacy-first masking: all text and media are
      // masked by default so we never record student PII.
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // Light tracing — surfaces slow routes / requests without burning quota.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export function captureException(err, context) {
  if (!dsn()) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // Never let error reporting throw.
  }
}

/** Attach the signed-in user (id only — no PII) so issues show user impact. */
export function setSentryUser(user) {
  if (!dsn()) return;
  try {
    Sentry.setUser(user && user.id ? { id: user.id } : null);
  } catch {
    // ignore
  }
}
