/**
 * Masquerade gate — what the page does between "the identity switched" and
 * "the navigation finished".
 *
 * startMasquerade swaps the session to the target's token and then navigates.
 * In the gap before the new page loads, the page that started it is still
 * mounted, and its react-query hooks keep refetching (focus, intervals,
 * invalidations) -- now as the target. On the SIS console that means an org
 * admin's People page asking /api/sis/roster, households, members and removal
 * previews as a student, and the backend answering 403, correctly. Sentry
 * filed each one as a bug (07b05221: "API 403: GET /api/sis/roster from
 * /people after View as student", and five siblings), and the admin saw the
 * page break for a moment on the way out.
 *
 * So once the switch is real: in-flight queries are cancelled, react-query is
 * taken offline (queries pause instead of fetching), and the API reporter
 * stays quiet about 403s. A back/forward-cache restore of that page is
 * reloaded, because the frozen page still thinks it is the admin's.
 *
 * Deliberately free of api.ts imports: api.ts reads this module, and
 * masqueradeService imports api.ts.
 */
import { onlineManager } from '@tanstack/react-query'
import { getAppSurface } from '../utils/appSurface'

export const MASQUERADE_STORAGE_KEY = 'masquerade_state'

let transitioning = false
let registeredClient = null

/** App.jsx hands its QueryClient over so the gate can pause it. */
export function registerMasqueradeQueryClient(client) {
  registeredClient = client
}

/** True from a successful masquerade POST until the page unloads. */
export function isMasqueradeTransitioning() {
  return transitioning
}

/** True when local masquerade state is present (active session on this origin). */
export function hasMasqueradeState() {
  try {
    return window.localStorage.getItem(MASQUERADE_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/** A masquerade is running or starting: 403s are the target's, not a bug. */
export function isMasqueradeActiveOrPending() {
  return transitioning || hasMasqueradeState()
}

/**
 * Called once the masquerade POST has succeeded and the token swapped, before
 * navigating. Stops the current page from firing requests as the target.
 */
export function beginMasqueradeTransition() {
  transitioning = true
  try {
    onlineManager.setOnline(false)
  } catch {
    // Pausing is best effort; the reporter guard still holds.
  }
  if (registeredClient) {
    try {
      registeredClient.cancelQueries()
    } catch {
      // ignore
    }
  }
}

/** Test hook: put the gate back the way a fresh page load has it. */
export function resetMasqueradeGate() {
  transitioning = false
  registeredClient = null
  try { onlineManager.setOnline(true) } catch { /* ignore */ }
}

/**
 * pageshow handler. A page restored from the back/forward cache keeps its
 * JavaScript state: either it froze mid-transition (queries paused for good),
 * or it is an SIS console page while the session now belongs to a masquerade
 * target. Both get a fresh load.
 */
export function handleMasqueradePageShow(event) {
  if (!event?.persisted) return false
  if (transitioning || (hasMasqueradeState() && getAppSurface() === 'sis')) {
    window.location.reload()
    return true
  }
  return false
}

/** Install the pageshow guard. Returns the uninstall function. */
export function installMasqueradePageShowGuard() {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('pageshow', handleMasqueradePageShow)
  return () => window.removeEventListener('pageshow', handleMasqueradePageShow)
}
