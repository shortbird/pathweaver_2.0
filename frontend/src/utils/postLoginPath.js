import { isSimplifiedPartnerOrg } from '../config/partnerOrgs'

/**
 * Effective role for landing decisions (resolves org_managed to org role).
 * Mirrors AuthContext.getEffectiveRole; kept here so the post-login landing
 * map lives in exactly one place instead of being duplicated per login method.
 */
function effectiveRole(user) {
  if (!user) return null
  if (user.role === 'superadmin') return 'superadmin'
  if (user.role === 'org_managed') {
    if (Array.isArray(user.org_roles) && user.org_roles.length > 0) {
      return user.org_roles[0]
    }
    if (user.org_role) return user.org_role
  }
  return user.role
}

/**
 * Where a user lands after logging in, by role:
 * - org_admin -> their organization console (or partner-simplified dashboard)
 * - advisor (teacher) in a SIS org -> the SIS console (via /sis-launch)
 * - advisor (teacher) otherwise -> the advisor dashboard
 * - parent / student in a school that opted in -> the school's page (/school)
 * - parent / superadmin -> parent dashboard
 * - observer -> feed (or welcome on first visit)
 * - student and everything else -> student dashboard
 */
export function getPostLoginPath(user) {
  const role = effectiveRole(user)

  if (role === 'org_admin') {
    return isSimplifiedPartnerOrg(user.organization_id) ? '/onfire' : '/organization'
  }
  if (role === 'advisor') {
    // Teachers in a SIS-enabled org work in the SIS console, not the learning
    // app. /sis-launch hops surfaces (cross-host in prod); on the SIS surface
    // itself the route falls through to the dashboard.
    if (user.organization?.feature_flags?.sis_enabled) {
      return '/sis-launch'
    }
    return '/advisor/dashboard'
  }
  // Schools that opted in (feature_flags.sis_settings.school_homepage — iCreate,
  // 2026-08-06) front-door their families through the school's own page. Only
  // families: staff run the school from the SIS console, and an observer's
  // whole account is about one student, not one school. `school` rides on the
  // login payload and on /me (routes/auth/login/core.py).
  if ((role === 'parent' || role === 'student') && user.school?.homepage) {
    return '/school'
  }
  if (role === 'superadmin' || role === 'parent') {
    return '/parent/dashboard'
  }
  if (role === 'observer') {
    const hasSeenWelcome = localStorage.getItem('observerWelcomeSeen')
    return hasSeenWelcome ? '/observer/feed' : '/observer/welcome'
  }
  return '/dashboard'
}

/**
 * The fallback in-app home for someone who can't stay where they are (missing
 * school context, back-button dead end, blocked route). Deliberately NOT
 * getPostLoginPath: this must never point at an optional surface like /school
 * — SchoolPage bounces here exactly when school context is missing, so pointing
 * back at /school would loop — and never hop surfaces to the SIS console.
 * Matches the redirect map PrivateRoute has always used.
 */
export function roleHomePath(role) {
  if (role === 'parent') return '/parent/dashboard'
  if (role === 'observer') return '/observer/feed'
  return '/dashboard'
}
