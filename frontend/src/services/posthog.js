import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let initialized = false

/**
 * True when this account belongs to a child whose data must never reach a
 * third-party analytics vendor at all (COPPA). Dependents are, by definition,
 * accounts a parent created for a minor; `requires_parental_consent` is the
 * backend's under-13 marker set at registration.
 *
 * Deliberately conservative about shape: the /auth/me payload has grown fields
 * over time and a missing flag must never be read as "adult".
 */
const isMinorAccount = (user) =>
  Boolean(user?.is_dependent || user?.requires_parental_consent)

/** Call a posthog-js method only if this SDK build actually has it. */
const call = (method, ...args) => {
  if (typeof posthog?.[method] === 'function') posthog[method](...args)
}

/**
 * Initialize PostHog SDK for session replay.
 * No-ops if VITE_POSTHOG_KEY is not set (local dev excluded automatically).
 */
export const initPostHog = () => {
  if (!POSTHOG_KEY || initialized) return

  posthog.init(POSTHOG_KEY, {
    // Session replay, COPPA defaults. maskAllText matters as much as
    // maskAllInputs on this platform: the replay-worthy content here is
    // RENDERED text -- student names on a roster, journal entries, evidence
    // write-ups -- not just what someone typed into a box. Without it a replay
    // is a verbatim copy of a child's schoolwork sitting in a vendor's
    // database.
    session_recording: {
      maskAllInputs: true,
      maskAllText: true,
    },
    // Disable autocapture -- we track specific business events manually
    autocapture: false,
    // Enable pageview capture for session replay timeline
    capture_pageview: true,
    // Capture page leave for replay timeline
    capture_pageleave: true,
    // Honor Do Not Track. A K-12 platform has no business overriding an
    // explicit browser-level opt-out to watch session replays.
    respect_dnt: true,
  })

  initialized = true
}

/**
 * Identify user in PostHog so sessions are searchable by user.
 * Call on login, register, and session restore.
 *
 * COPPA: this function deliberately DISCARDS the identifying fields on the
 * user object it is handed. Call sites pass the whole /auth/me user; only an
 * opaque id plus non-identifying role/org enums leave the browser. Do not add
 * email, names, usernames, avatars, or free text to the property bag -- and
 * do not "fix" a call site by pre-stripping it, because the guarantee has to
 * hold for every current and future caller.
 *
 * Minor accounts (dependents / under-13) are not identified at all: capture is
 * turned off for the session instead, so no replay, pageview, or custom event
 * is attributed to a child. Every other export here degrades to a no-op in
 * that state because posthog itself drops the calls.
 */
export const identifyUser = (user) => {
  if (!POSTHOG_KEY || !user?.id) return

  if (isMinorAccount(user)) {
    // Stop capture for this browser session and drop anything already queued
    // under the anonymous id that led here.
    call('opt_out_capturing')
    call('reset')
    return
  }

  // Undo a prior minor opt-out on a shared device (a parent signing in after
  // their child on the same browser).
  call('opt_in_capturing')

  posthog.identify(user.id, {
    role: user.role,
    org_role: user.org_role || null,
    organization_id: user.organization_id || null,
    subscription_tier: user.subscription_tier || null,
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
 * Tag subsequent PostHog events as occurring during an admin masquerade
 * session. Uses super-properties, so every captured event (pageviews,
 * web_vitals, captureEvent calls) carries the flag until cleared.
 *
 * Filter by `is_masquerade != true` in dashboards to see real user activity
 * only; filter by `is_masquerade = true` to audit what admins did while
 * impersonating.
 */
export const setMasqueradeSuperProperties = ({ adminId, targetUserId }) => {
  if (!POSTHOG_KEY) return

  posthog.register({
    is_masquerade: true,
    masquerading_admin_id: adminId || null,
    masquerade_target_user_id: targetUserId || null,
  })
}

/**
 * Clear masquerade super-properties. PostHog persists `register()` values
 * across page loads, so call this on every masquerade-status check that
 * comes back false — not just on explicit exit — to self-heal any stuck
 * flag from a prior session.
 */
export const clearMasqueradeSuperProperties = () => {
  if (!POSTHOG_KEY) return

  posthog.unregister('is_masquerade')
  posthog.unregister('masquerading_admin_id')
  posthog.unregister('masquerade_target_user_id')
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
