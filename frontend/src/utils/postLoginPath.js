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
 * Where a user lands after logging in (rewritten 2026-08-10 for role homes):
 *
 * Every in-app role now lands on /dashboard, which renders that role's own
 * Home (pages/home/RoleHome.jsx). The old forks are gone:
 * - the school-homepage opt-in no longer swaps the landing page — the school
 *   section renders INSIDE the family/student homes instead (/school remains
 *   a linkable page);
 * - superadmin no longer lands on the parent dashboard by accident;
 * - observers land straight on their feed (the welcome content is the feed's
 *   first-visit state).
 *
 * The only remaining forks hop SURFACES, not pages:
 * - staff of SIS-enabled orgs (org_admin, advisor, campus_coordinator) work
 *   in the SIS console, so they front-door through /sis-launch;
 * - simplified partner orgs keep their dedicated /onfire dashboard.
 */
export function getPostLoginPath(user) {
  const role = effectiveRole(user)
  const sisEnabled = Boolean(user?.organization?.feature_flags?.sis_enabled)

  if (role === 'org_admin') {
    if (isSimplifiedPartnerOrg(user.organization_id)) return '/onfire'
    if (sisEnabled) return '/sis-launch'
    return '/dashboard'
  }
  if (role === 'advisor' || role === 'campus_coordinator') {
    if (sisEnabled) return '/sis-launch'
    return '/dashboard'
  }
  if (role === 'observer') {
    return '/observer/feed'
  }
  return '/dashboard'
}

/**
 * The fallback in-app home for someone who can't stay where they are (missing
 * school context, back-button dead end, blocked route). Deliberately NOT
 * getPostLoginPath: this must never hop surfaces to the SIS console. Matches
 * the redirect map PrivateRoute has always used. Since role homes landed,
 * /dashboard is every role's home except observers (whose home is the feed).
 */
export function roleHomePath(role) {
  if (role === 'observer') return '/observer/feed'
  return '/dashboard'
}
