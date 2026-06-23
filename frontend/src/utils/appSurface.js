/**
 * App Surface — one codebase, two products.
 *
 * The same built SPA serves both the Learning app (on www.optioeducation.com) and
 * the SIS console (on sis.optioeducation.com). This module decides which surface to
 * render, and provides helpers to hop between them.
 *
 * SAFETY: getAppSurface() returns 'learning' for every real host until
 * sis.optioeducation.com actually resolves. So all SIS code can ship to prod while
 * being unreachable by normal users. For local/dev testing, use the ?app=sis override
 * (persisted to localStorage) — no DNS required.
 */

const SIS_PROD_URL = 'https://sis.optioeducation.com'
const LEARNING_PROD_URL = 'https://www.optioeducation.com'
const SURFACE_KEY = 'optio_surface'
const SIS_FLAG_KEY = 'optio_sis_flag'

function safeGet(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function safeSet(key, val) {
  try { window.localStorage.setItem(key, val) } catch { /* ignore */ }
}
function safeRemove(key) {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

/** True when the page is loaded on the real SIS host. */
export function isSisHost() {
  return typeof window !== 'undefined' && window.location.hostname.startsWith('sis.')
}

function isRealOptioHost() {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('optioeducation.com')
}

/**
 * Returns 'sis' | 'learning'.
 * - Real sis. host  -> always 'sis'
 * - ?app=sis|learning -> sets the override (persisted) and applies it
 * - localStorage override -> applies it
 * - otherwise -> 'learning'
 */
export function getAppSurface() {
  if (typeof window === 'undefined') return 'learning'
  if (isSisHost()) return 'sis'

  const params = new URLSearchParams(window.location.search)
  const q = params.get('app')
  if (q === 'sis' || q === 'learning') safeSet(SURFACE_KEY, q)

  return safeGet(SURFACE_KEY) === 'sis' ? 'sis' : 'learning'
}

/**
 * Local-dev override for the per-org `sis_enabled` flag, so the carve-out can be
 * tested without writing the flag to a real org. Toggle via ?sisflag=1 / ?sisflag=0.
 * Has NO effect on production hosts (real flag comes from organizations.feature_flags).
 */
export function getSisFlagOverride() {
  if (typeof window === 'undefined') return false
  if (isRealOptioHost()) return false
  const params = new URLSearchParams(window.location.search)
  const q = params.get('sisflag')
  if (q === '1') safeSet(SIS_FLAG_KEY, '1')
  if (q === '0') safeRemove(SIS_FLAG_KEY)
  return safeGet(SIS_FLAG_KEY) === '1'
}

/** Navigate to the SIS surface (prod: change host; local/dev: set override + reload). */
export function goToSisSurface(path = '/') {
  if (isRealOptioHost() && !isSisHost()) {
    window.location.href = SIS_PROD_URL + path
  } else {
    safeSet(SURFACE_KEY, 'sis')
    window.location.assign('/')
  }
}

/** Navigate back to the Learning surface (prod: change host; local/dev: clear override). */
export function goToLearningSurface(path = '/') {
  if (isSisHost()) {
    window.location.href = LEARNING_PROD_URL + path
  } else {
    safeRemove(SURFACE_KEY)
    window.location.assign(path)
  }
}
