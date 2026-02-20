import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let initialized = false

/**
 * Initialize PostHog SDK for session replay.
 * No-ops if VITE_POSTHOG_KEY is not set (local dev excluded automatically).
 */
export const initPostHog = () => {
  if (!POSTHOG_KEY || initialized) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Session replay with COPPA-safe defaults
    session_recording: {
      maskAllInputs: true,
    },
    // Disable autocapture -- already have ActivityTracker + GA4
    autocapture: false,
    // Disable pageview capture -- already tracked by GA4
    capture_pageview: false,
    // Capture page leave for replay timeline
    capture_pageleave: true,
    // Honor Do Not Track
    respect_dnt: true,
  })

  initialized = true
}

/**
 * Identify user in PostHog so sessions are searchable by user.
 * Call on login, register, and session restore.
 */
export const identifyUser = (user) => {
  if (!POSTHOG_KEY || !user?.id) return

  posthog.identify(user.id, {
    role: user.role,
    org_role: user.org_role || null,
    organization_id: user.organization_id || null,
    subscription_tier: user.subscription_tier || null,
    display_name: user.display_name || null,
    email: user.email || null,
  })
}

/**
 * Reset PostHog identity on logout.
 * Starts a new anonymous session.
 */
export const resetUser = () => {
  if (!POSTHOG_KEY) return

  posthog.reset()
}

/**
 * Capture an error event in PostHog for correlation with session replays.
 * Call from ErrorBoundary.componentDidCatch.
 */
export const captureError = (error, errorInfo) => {
  if (!POSTHOG_KEY) return

  posthog.capture('$exception', {
    $exception_message: error?.message || String(error),
    $exception_stack_trace_raw: error?.stack || null,
    $exception_component_stack: errorInfo?.componentStack || null,
  })
}
