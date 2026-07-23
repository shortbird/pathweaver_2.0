/**
 * Per-org SIS module visibility.
 *
 * Some orgs don't use every SIS module (e.g. a microschool that tracks goals
 * instead of Customized Learning Plans, and doesn't run staff timesheets). An
 * org can hide specific modules by listing their keys in
 * `organizations.feature_flags.sis_settings.hidden_modules`. Absent/empty =
 * every module shows (the default, so existing orgs are unaffected).
 *
 * This is nav + route visibility only; the backend endpoints stay available.
 * Visibility follows the ACTIVE org — for a superadmin that is whichever org
 * they've selected in the picker, so the console mirrors exactly what that org's
 * admin sees. With no active org (superadmin before a selection), nothing hides.
 */

// Nav path -> module key. A module hidden in config removes every nav item and
// route that maps to it (e.g. 'timesheets' hides both Timesheets and My Time).
export const SIS_MODULE_BY_PATH = {
  '/clp': 'clp',
  '/billing': 'billing',
  '/forms': 'forms',
  '/onboarding': 'onboarding',
  '/timesheets': 'timesheets',
  '/time': 'timesheets',
}

/** The set of module keys this org has hidden (empty when unset). */
export function getHiddenModules(organization) {
  const list = organization?.feature_flags?.sis_settings?.hidden_modules
  return new Set(Array.isArray(list) ? list : [])
}

/** True when `path`'s module is hidden for the active org (null org hides nothing). */
export function isPathHidden(path, organization) {
  const mod = SIS_MODULE_BY_PATH[path]
  return Boolean(mod) && getHiddenModules(organization).has(mod)
}
