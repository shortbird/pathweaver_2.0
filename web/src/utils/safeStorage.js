/**
 * Web storage that never throws.
 *
 * Some Android in-app browsers (a WebView with DOM storage turned off) expose
 * `window.localStorage` as null, and private modes can make every call throw.
 * A bare `localStorage.getItem` in a render path then takes the whole page
 * down: the login page crashed on mount for a Samsung WebView user 13 times in
 * two minutes (Sentry OPTIO-WEB-3D, 2026-10-13) and they could not sign in.
 *
 * Use these on any path a signed-out visitor can reach. Reads return null and
 * writes are dropped when storage is unavailable, so the page still works; it
 * only forgets the parked value.
 */

function store(kind) {
  try {
    return typeof window !== 'undefined' ? window[kind] : null
  } catch {
    // Accessing the property itself throws when storage is blocked.
    return null
  }
}

function get(kind, key) {
  try { return store(kind)?.getItem(key) ?? null } catch { return null }
}

function set(kind, key, value) {
  try { store(kind)?.setItem(key, value) } catch { /* storage unavailable */ }
}

function remove(kind, key) {
  try { store(kind)?.removeItem(key) } catch { /* storage unavailable */ }
}

export const safeLocal = {
  getItem: (key) => get('localStorage', key),
  setItem: (key, value) => set('localStorage', key, value),
  removeItem: (key) => remove('localStorage', key)
}

export const safeSession = {
  getItem: (key) => get('sessionStorage', key),
  setItem: (key, value) => set('sessionStorage', key, value),
  removeItem: (key) => remove('sessionStorage', key)
}
