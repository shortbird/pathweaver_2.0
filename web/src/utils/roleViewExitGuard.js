/**
 * One automatic role-view exit per short window, per tab.
 *
 * The SIS gate (SisLayout) and the API interceptor (services/api.ts) both end
 * a "view as" role view on their own when it is the only thing standing
 * between an admin and their console (tickets 0f573318, 43fee34b and the
 * Apogee 403s). Each does it with a POST and a full reload. If the exit ever
 * "succeeds" without clearing the cookie, the reload would land in the same
 * state and exit again, forever. The timestamp in sessionStorage stops that:
 * a second automatic exit inside the window is refused, and the caller falls
 * back to what it did before.
 */
const KEY = 'optio_role_view_auto_exit_at'
const WINDOW_MS = 30 * 1000

export function claimRoleViewExit(now = Date.now()) {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0)
    if (last && now - last < WINDOW_MS) return false
    window.sessionStorage.setItem(KEY, String(now))
    return true
  } catch {
    // No storage (private mode, blocked): allow it once per page load only.
    if (claimRoleViewExit._claimed) return false
    claimRoleViewExit._claimed = true
    return true
  }
}

// Set once an automatic exit has started on this page load. React may render
// the gate twice (StrictMode) or several times before the reload lands; those
// renders wait for the exit already under way instead of claiming again,
// failing the claim, and bouncing.
let inFlight = false

/**
 * Start `exit` (a promise-returning function that ends the view and reloads)
 * at most once. Returns true when an exit is under way, so the caller shows a
 * spinner; false when the guard refused it, so the caller does what it did
 * before. If `exit` rejects, `fallback` runs.
 */
export function runRoleViewExitOnce(exit, fallback = null) {
  if (inFlight) return true
  if (!claimRoleViewExit()) return false
  inFlight = true
  Promise.resolve()
    .then(exit)
    .catch(() => {
      inFlight = false
      if (fallback) fallback()
    })
  return true
}

/** Test helper: forget every claim. */
export function resetRoleViewExitGuard() {
  inFlight = false
  claimRoleViewExit._claimed = false
  try { window.sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Display name of a role in the "Exit “parent” view" label (TopNavbar, Sidebar). */
export function roleViewLabel(role) {
  if (!role) return ''
  return role === 'advisor' ? 'teacher' : role.replace('_', ' ')
}
