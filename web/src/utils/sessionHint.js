/**
 * AuthContext writes a `session_sync` record to localStorage on every login and
 * logout (it exists for cross-tab conflict detection). These helpers reuse that
 * record as a fast, synchronous signal for code that must pick what to render
 * before the async /api/auth/me check resolves:
 *
 * - hasLocalSessionHint: "this browser probably has a signed-in user". Lets the
 *   / route hold a loader instead of flashing the marketing page at a signed-in
 *   user, while anonymous visitors (and crawlers, which have no hint) still get
 *   the marketing page on first paint.
 * - isDifferentAccountActiveElsewhere: the one situation that justifies the
 *   "Continue as / switch account" interstitial on the login pages — the most
 *   recent login in this browser belongs to a different account than the one
 *   this tab is authenticated as. Possible under the Safari in-memory token
 *   fallback, where tabs don't share tokens.
 *
 * Hints only: the API session check remains the source of truth. A missing or
 * stale record must never lock anyone out — worst case is a brief loader or a
 * one-frame marketing flash.
 */

const SESSION_SYNC_KEY = 'session_sync'

export function readSessionSync() {
  try {
    const raw = localStorage.getItem(SESSION_SYNC_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function hasLocalSessionHint() {
  const sync = readSessionSync()
  return Boolean(sync && sync.action === 'login' && sync.userId)
}

export function isDifferentAccountActiveElsewhere(user) {
  const sync = readSessionSync()
  return Boolean(sync && sync.action === 'login' && sync.userId && user?.id && sync.userId !== user.id)
}
