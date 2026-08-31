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
  '/tuition': 'billing',
  // The unified task surfaces. 'tasks' is the module an org hides to turn the
  // whole thing off; '/forms' and '/onboarding' keep their own keys because an
  // org that hid one of them before this merge must stay hidden — the config is
  // a promise already made, not a name we get to reuse.
  '/my-tasks': 'tasks',
  '/tasks': 'tasks',
  '/forms': 'forms',
  '/onboarding': 'onboarding',
  '/secure-documents': 'secure_documents',
  '/timesheets': 'timesheets',
  '/time': 'timesheets',
  // 'classes' also hides the teacher-portal class pages: with no classes
  // there are no sections to teach or schedule.
  '/classes': 'classes',
  '/my-classes': 'classes',
  '/my-schedule': 'classes',
  '/calendar': 'calendar',
  '/attendance': 'attendance',
  '/reports': 'reports',
  '/resources': 'resources',
  '/curriculum': 'curriculum',
  '/training': 'training',
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

/**
 * Community Hub is OPT-IN (unlike the opt-out modules above): it shows only for
 * orgs that set `feature_flags.sis_settings.community_enabled === true`. This keeps
 * the experimental section off every existing org's console until they turn it on.
 * A null org (superadmin before selecting one) sees it hidden.
 */
export function isCommunityEnabled(organization) {
  return organization?.feature_flags?.sis_settings?.community_enabled === true
}

/**
 * Prior Learning is OPT-IN for the same reason: it's Optio Academy's only, for
 * now. The backend gates on the same flag, so a school can never end up with a
 * review queue nobody can file into (or a family form with nowhere to land).
 */
export function isPriorLearningEnabled(organization) {
  return organization?.feature_flags?.sis_settings?.prior_learning_enabled === true
}

/**
 * CLPs are iCreate's, and only iCreate's.
 *
 * A Customized Learning Plan is a specific thing iCreate does: a meeting where a
 * family's schedule is finalised, which is what seeds their tuition. Because
 * '/clp' was registered as an opt-OUT module above, every other school saw the
 * nav item, the page, and — worse — CLP wording on shared screens like Tuition
 * ("Mark a CLP done and the student appears here"), which is advice they cannot
 * act on and a workflow they do not run (Optio Academy, 2026-08-31).
 *
 * Opt-in, like Community Hub and Prior Learning: a school sees CLPs only when it
 * sets `feature_flags.sis_settings.clp_enabled`. The opt-out `hidden_modules`
 * entry for 'clp' is kept as well, so an org that had already hidden it stays
 * hidden even if somebody later turns the flag on.
 */
export function isClpEnabled(organization) {
  if (organization?.feature_flags?.sis_settings?.clp_enabled !== true) return false
  return !isPathHidden('/clp', organization)
}
