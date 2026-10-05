/**
 * The school setup link a visitor opened before they had an account.
 *
 * /start-school/:token saves the token here and sends the visitor to sign up or
 * sign in. Signing up can leave the app entirely (email verification, Google,
 * Apple) and come back on a different page, so the token waits in localStorage
 * until a signed-in page (PendingSchoolSetupRedirect, in Layout) sends them
 * back to the form. Same shape as pendingOffer.js.
 *
 * Storage can be missing outright (Safari with site data blocked), so every
 * access is guarded; without it the visitor just opens the link again.
 */
const KEY = 'optioPendingSchoolSetup'

export function getPendingSchoolSetup() {
  try { return window.localStorage.getItem(KEY) } catch { return null }
}

export function setPendingSchoolSetup(token) {
  try { window.localStorage.setItem(KEY, token) } catch { /* no storage */ }
}

export function clearPendingSchoolSetup() {
  try { window.localStorage.removeItem(KEY) } catch { /* no storage */ }
}
