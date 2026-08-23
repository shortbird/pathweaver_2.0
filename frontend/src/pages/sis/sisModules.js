/**
 * Per-org SIS module visibility — now an adapter over the building-block
 * module system (src/modules/moduleEnabled.js, ARCHITECTURE_BLOCKS 4.1).
 *
 * The exported API is unchanged: nav paths map to module keys, and a path is
 * hidden when its module is off for the active org. What changed underneath:
 * the answer comes from the org's server-computed `effective_modules` (with a
 * local fallback re-deriving the same veneer semantics from moduleKeys.json),
 * so opt-out modules (`sis_settings.hidden_modules`), the opt-ins
 * (community, prior learning, goals), and explicit `feature_flags.modules`
 * entries all flow through ONE evaluator instead of three mechanisms.
 *
 * Semantics preserved from the original module map:
 * - absent/empty config = every default-on module shows, opt-ins stay hidden;
 * - a null org (superadmin before picking one) hides nothing — the picker,
 *   not the guard, owns that moment;
 * - hiding 'timesheets' hides both Timesheets and My Time; hiding 'classes'
 *   also hides the teacher-portal class pages.
 */

import { moduleEnabled } from '../../modules/moduleEnabled'

// Nav path -> module key. A module that is off for the active org removes
// every nav item and route that maps to it. Opt-in modules (community,
// prior_learning, goals) now live in the same map as the opt-outs — the
// evaluator knows which is which from the registry defaults.
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
  '/classes': 'classes',
  '/my-classes': 'classes',
  '/my-schedule': 'classes',
  '/calendar': 'calendar',
  '/attendance': 'attendance',
  '/reports': 'reports',
  '/resources': 'resources',
  '/curriculum': 'curriculum',
  '/training': 'training',
  '/submissions': 'submissions',
  '/registration': 'registration',
  '/community': 'community',
  '/prior-learning': 'prior_learning',
  '/goals': 'goals',
}

/**
 * The set of nav-relevant module keys that are OFF for this org (empty for a
 * null org). Consumers (TeacherDashboard tiles) treat membership as "hide" —
 * with the module system this now includes opt-ins the org hasn't enabled,
 * not just the opted-out keys, which is what a tile filter actually wants.
 */
export function getHiddenModules(organization) {
  const hidden = new Set()
  if (!organization) return hidden
  for (const key of new Set(Object.values(SIS_MODULE_BY_PATH))) {
    if (!moduleEnabled(organization, key)) hidden.add(key)
  }
  return hidden
}

/** True when `path`'s module is off for the active org (null org hides nothing). */
export function isPathHidden(path, organization) {
  const mod = SIS_MODULE_BY_PATH[path]
  if (!mod || !organization) return false
  return !moduleEnabled(organization, mod)
}

/** Community Hub — opt-in (registry default 'off'; legacy community_enabled). */
export function isCommunityEnabled(organization) {
  return Boolean(organization) && moduleEnabled(organization, 'community')
}

/** Prior Learning — opt-in; the backend gates on the same module. */
export function isPriorLearningEnabled(organization) {
  return Boolean(organization) && moduleEnabled(organization, 'prior_learning')
}

/** Goals mode — opt-in alternative to CLP (legacy post_registration_flow). */
export function isGoalsEnabled(organization) {
  return Boolean(organization) && moduleEnabled(organization, 'goals')
}
