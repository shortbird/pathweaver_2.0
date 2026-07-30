/**
 * Session recovery helpers for the v1 response interceptor.
 *
 * Why this exists: the interceptor used to treat *every* failed
 * /api/auth/refresh as "your session is over" — it cleared the in-memory
 * tokens and hard-redirected to /login. That is right for a rejected refresh
 * token and wrong for everything else.
 *
 * The user-visible bug ("I get logged out when I close the app"): the access
 * cookie lives 15 minutes but the refresh cookie lives 30 days. So *any*
 * return visit after a short break starts with a 401 on the first request and
 * leans entirely on one un-retried refresh POST. If that POST hit a cold
 * Render worker (502/503), a timeout, or the per-IP refresh throttle (429 —
 * one school NAT is one IP), the client threw away a session the backend would
 * still have honoured for weeks, and bounced the user to /login.
 *
 * v2 already solved this (E4 + isUnrecoverableAuthFailure in
 * frontend-v2/src/services/api.ts and refreshRetry.ts); v1 never got the fix.
 * These two helpers are the v1 port, kept in their own module so they are
 * unit-testable without standing up the whole axios instance.
 */

/**
 * POST /api/auth/refresh with one jittered retry on a transient failure
 * (network error / timeout / 5xx). A 4xx is a real answer from the backend and
 * fails fast — retrying a rejected refresh token just doubles the latency
 * before the login redirect.
 *
 * @param {object} body request body (may carry refresh_token for header-mode browsers)
 * @param {{post: Function, sleep?: Function}} deps injected for testing
 */
export async function postRefreshWithRetry(body, deps) {
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  try {
    return await deps.post('/api/auth/refresh', body)
  } catch (firstErr) {
    const status = firstErr?.response?.status
    // No response at all → network error or timeout. Retriable.
    const retriable = status === undefined || status >= 500
    if (!retriable) throw firstErr
    await sleep(150 + Math.random() * 200)
    return await deps.post('/api/auth/refresh', body)
  }
}

/**
 * Whether a failed refresh means the session is genuinely over.
 *
 * Only two things qualify:
 *   - the backend actively rejected the refresh token (401/403), or
 *   - the refresh never produced a usable response body (no tokens, and no
 *     error to classify) — treated as unrecoverable so we can't spin forever.
 *
 * Everything else is recoverable and MUST leave the refresh cookie alone:
 *   - no response (network down, DNS, timeout, user closed the laptop lid)
 *   - 5xx (Render cold start, worker restart on the 512MB prod instance)
 *   - 429 (the per-IP refresh throttle; a computer lab behind one NAT can trip
 *     it with entirely legitimate traffic)
 * In those cases the next request retries and the user never notices.
 */
export function isUnrecoverableAuthFailure(error) {
  if (error && error.__sessionOver === true) return true
  const status = error?.response?.status
  return status === 401 || status === 403
}
