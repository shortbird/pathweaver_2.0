import api, { tokenStore } from './api'
import logger from '../utils/logger'

/**
 * Re-mint the acting-as token BEFORE anything asks who the user is.
 *
 * Acting as a dependent ends in `window.location.href = '/dashboard'`, and
 * tokens are memory-only (C2), so the reload starts with an empty token store
 * and only `acting_as_dependent` in sessionStorage. Two things then race:
 *
 *   AuthContext        GET /api/auth/me            -> answers on the parent's
 *                                                     httpOnly cookie: PARENT
 *   ActingAsProvider   POST /dependents/:id/act-as -> installs the CHILD token
 *
 * /me won, so /dashboard rendered the parent's FamilyHome; by the time its
 * queries went out the token was the child's, and the child is not a parent.
 * The parent watched their own dashboard 403 (Sentry OPTIO-WEB-C:
 * /api/dependents/my-dependents, "Only parent accounts can manage dependent
 * profiles", once per reload while they were inside the child's account).
 *
 * The fix is ordering, not error handling: whoever asks who the user is must
 * wait for the token that answers it. AuthContext awaits this before /me, so
 * /me is asked as the dependent and the right home renders. It is the same
 * treatment the LTI pages already get, for the same reason -- a Bearer token
 * being minted must not race the session check.
 *
 * Lives outside ActingAsContext because AuthContext has to await it and
 * ActingAsContext imports AuthContext; the promise is shared so the two
 * callers mint one token between them, not one each.
 */

const STORAGE_KEY = 'acting_as_dependent'

let restorePromise = null

/**
 * Resolves with the stored dependent once its token is in the token store, or
 * null when there is nothing to restore (the common case) or the parent is no
 * longer authorized. Never rejects: a failed restore means "not acting as
 * anybody", which is a valid state, not an error the caller must handle.
 */
export function restoreActingAs() {
  if (restorePromise) return restorePromise

  restorePromise = (async () => {
    // Purge any token persisted by an older build (FE-M12): a JWT in web
    // storage is stealable by any XSS, which in this COPPA-sensitive flow
    // meant child-account impersonation for the token's lifetime.
    try {
      sessionStorage.removeItem('acting_as_token')
    } catch {
      // Private mode / storage disabled: nothing to purge.
    }

    let stored = null
    try {
      stored = sessionStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
    if (!stored) return null

    try {
      const dependent = JSON.parse(stored)
      // The backend re-verifies that this parent owns this dependent, so the
      // re-mint is an authorization check, not just a token refresh.
      const response = await api.post(`/api/dependents/${dependent.id}/act-as`, {})
      const freshToken = response.data?.acting_as_token
      if (!freshToken) throw new Error('No acting_as_token returned on restore')

      await tokenStore.setTokens(freshToken, tokenStore.getRefreshToken() || '')
      logger.debug('[actingAsRestore] Re-minted acting-as token on reload')
      return { dependent, token: freshToken }
    } catch (error) {
      // Parent session unavailable or no longer authorized: drop the state and
      // fall back to the parent's own session / re-auth.
      console.warn('[actingAsRestore] Could not restore acting-as on reload:', error.message)
      clearStoredActingAs()
      return null
    }
  })()

  return restorePromise
}

/** Whether a restore is pending, without starting one. */
export function hasStoredActingAs() {
  try {
    return Boolean(sessionStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

export function clearStoredActingAs() {
  // Includes the legacy parent_* token values written by older builds.
  for (const key of ['acting_as_dependent', 'acting_as_token', 'acting_as_parent_name',
                     'parent_access_token', 'parent_refresh_token']) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Nothing to clear.
    }
  }
  restorePromise = null
}

/** Test seam: forget the shared promise between cases. */
export function resetActingAsRestore() {
  restorePromise = null
}
