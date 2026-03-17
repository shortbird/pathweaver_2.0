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
    // Disable autocapture -- we track specific business events manually
    autocapture: false,
    // Enable pageview capture for session replay timeline
    capture_pageview: true,
    // Capture page leave for replay timeline
    capture_pageleave: true,
    // DNT disabled -- beta platform with consented users, not public website
    respect_dnt: false,
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
    display_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.display_name || null,
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
 * Capture a custom business event in PostHog.
 * COPPA: Only pass IDs and predefined enums as properties -- no free-text.
 */
export const captureEvent = (eventName, properties = {}) => {
  if (!POSTHOG_KEY) return
  posthog.capture(eventName, properties)
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

/**
 * Capture an error toast event for debugging in PostHog.
 * Auto-called via the toast.error() patch in App.jsx -- no manual calls needed.
 */
export const captureErrorToast = (message) => {
  if (!POSTHOG_KEY) return

  // Extract readable text from string, React element, or object
  let errorText = ''
  if (typeof message === 'string') {
    errorText = message
  } else if (message?.props?.children) {
    // React element (from showErrorToast's JSX)
    const children = Array.isArray(message.props.children)
      ? message.props.children
      : [message.props.children]
    errorText = children
      .map(child => {
        if (typeof child === 'string') return child
        if (child?.props?.children) return child.props.children
        return ''
      })
      .filter(Boolean)
      .join(' -- ')
  } else if (message != null) {
    errorText = String(message)
  }

  posthog.capture('error_toast_shown', {
    error_message: errorText.substring(0, 500),
    page_path: window.location.pathname,
  })
}
