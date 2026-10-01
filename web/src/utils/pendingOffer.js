/**
 * The class link a visitor opened before they had an account.
 *
 * /offer/:slug saves the slug here and sends the visitor to sign up or sign in.
 * Signing up can leave the app entirely (email verification, Google, Apple) and
 * come back on a different page, so the slug waits in localStorage until a
 * signed-in page (PendingOfferRedirect, in Layout) sends them back to claim it.
 *
 * Storage can be missing outright (Safari with site data blocked), so every
 * access is guarded; without it the visitor just opens the link again.
 */
const KEY = 'optioPendingOffer'

export function getPendingOffer() {
  try { return window.localStorage.getItem(KEY) } catch { return null }
}

export function setPendingOffer(slug) {
  try { window.localStorage.setItem(KEY, slug) } catch { /* no storage */ }
}

export function clearPendingOffer() {
  try { window.localStorage.removeItem(KEY) } catch { /* no storage */ }
}
