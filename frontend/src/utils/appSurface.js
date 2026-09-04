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
 * Absolute origin of the Learning app — where every family-facing link (e.g.
 * the iCreate registration link) must point. On real Optio hosts this is always
 * the www origin, even when the current page is the SIS console: links copied
 * from sis.optioeducation.com must never send families to the SIS host.
 */
export function getLearningOrigin() {
  if (typeof window === 'undefined') return LEARNING_PROD_URL
  return isRealOptioHost() ? LEARNING_PROD_URL : window.location.origin
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

// ── Reactive surface switching (same-origin, no full reload) ──────────────────
// When the Learning app and SIS console share one origin (the `?app=sis` override
// rather than a real sis. subdomain), we can swap surfaces with a client-side route
// change instead of a full page reload. That keeps the AuthProvider mounted, so the
// session is never re-initialized — no re-login, and the switch is instant.
const _surfaceListeners = new Set()

/** Subscribe to in-app surface switches. Returns an unsubscribe fn. */
export function subscribeSurface(fn) {
  _surfaceListeners.add(fn)
  return () => _surfaceListeners.delete(fn)
}

function _notifySurface(target, path) {
  _surfaceListeners.forEach((fn) => fn(target, path))
}

/**
 * Switch surfaces from a toggle button.
 * - Real sis. subdomain in prod: must cross origins → full navigation (unavoidable).
 * - Same origin (?app=sis override): persist the override and notify subscribers so
 *   App swaps the route tree in place — no reload, no re-auth.
 */
export function switchSurfaceInApp(target, path = '/') {
  if (isRealOptioHost()) {
    if (target === 'sis' && !isSisHost()) { window.location.href = SIS_PROD_URL + path; return }
    if (target === 'learning' && isSisHost()) { window.location.href = LEARNING_PROD_URL + path; return }
  }
  if (target === 'sis') safeSet(SURFACE_KEY, 'sis')
  else safeRemove(SURFACE_KEY)
  _notifySurface(target, path)
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

// ── Which surface owns a path ────────────────────────────────────────────────
//
// Notifications, emails and pushes all carry a bare path ("/school",
// "/attendance") with no idea which of the two hosts owns it. Whichever surface
// the reader happens to be on then has to hand the ones it does not own to the
// one that does — in BOTH directions, because staff read the same bell on both.
//
// Without the handoff the path falls through to a catch-all and the reader
// lands on a dashboard with no idea what they were sent (iCreate, 2026-08-26:
// "when I click on a notification, it doesn't open anythign. Instead it just
// sends me to the SIS dashboard").
//
// Listed explicitly rather than inferred, so a genuine typo still lands on a
// dashboard instead of bouncing between hosts forever.

/** Learning-app paths the SIS console hands back to www. */
export const LEARNING_SURFACE_PATHS = [
  '/school',
  '/announcements',
  '/notifications',
  '/dashboard',
  '/parent-dashboard',
  '/quests',
  '/courses',
  '/bounties',
  '/messages',
  '/communication',
  '/feed',
  '/journal',
  '/connections',
  '/credit-dashboard',
  '/profile',
  // The family portal and its paperwork: notifications point staff-parents at
  // these constantly, and none of them exist on the SIS console.
  '/family',
]

/** SIS console paths the learning app hands over to sis. — staff only. */
/**
 * Every top-level path served by the SIS console and NOT by the learning app.
 *
 * Only consulted for a path that matched no learning route (NotFoundRedirect),
 * so listing a path both surfaces serve is harmless — it is never reached.
 * Missing one is not harmless: staff following a notification link land on
 * their dashboard instead of the page they were told about. That shipped once
 * (iCreate, 2026-08-26) and then happened again, quietly, to ten more paths as
 * SIS grew — calendar, community, directory, households, my-profile,
 * onboarding, roster, settings, time and users were all real SIS routes that
 * were never added here.
 *
 * So it is no longer maintained by hand alone: appSurface.sisRoutes.test.js
 * reads the route tables out of sis/SisRoutes.jsx and App.jsx and fails if any
 * SIS-only route is missing from this list.
 */
export const SIS_SURFACE_PATHS = [
  '/attendance',
  '/billing',
  '/calendar',
  '/classes',
  '/clp',
  '/community',
  '/curriculum',
  '/directory',
  '/forms',
  '/goals',
  '/households',
  '/inbox',
  '/messaging',
  '/my-classes',
  '/my-documents',
  '/my-profile',
  '/my-schedule',
  '/my-tasks',
  '/onboarding',
  '/people',
  '/prior-learning',
  '/registration',
  '/reports',
  '/resources',
  '/roster',
  '/secure-documents',
  '/settings',
  '/submissions',
  '/tasks',
  '/time',
  '/timesheets',
  '/training',
  '/tuition',
  '/users',
]

/** True when `path` belongs to the SIS console and not the learning app. */
export function isSisSurfacePath(path) {
  const clean = String(path || '').split('?')[0].split('#')[0]
  return SIS_SURFACE_PATHS.some((p) => clean === p || clean.startsWith(`${p}/`))
}
