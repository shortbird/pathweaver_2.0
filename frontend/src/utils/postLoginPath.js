import { isSimplifiedPartnerOrg } from '../config/partnerOrgs'
import { inOptioAcademy } from '../config/optioAcademy'

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
 * A parent's home. Normally /dashboard (FamilyHome, the digest); for Optio
 * Academy it's the family dashboard itself, so the Family tab IS the home tab.
 * Shared by getPostLoginPath and the Sidebar so the nav item and the landing
 * page can never disagree.
 */
export function parentHomePath(user, school = null) {
  return inOptioAcademy({ user, school: school || user?.school })
    ? '/parent/dashboard'
    : '/dashboard'
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
 * - simplified partner orgs keep their dedicated /onfire dashboard;
 * - Optio Academy parents land on the family dashboard, which is their home
 *   (see config/optioAcademy.js).
 */
export function getPostLoginPath(user) {
  const role = effectiveRole(user)
  const sisEnabled = Boolean(user?.organization?.feature_flags?.sis_enabled)

  if (role === 'parent' && inOptioAcademy({ user, school: user?.school })) {
    return parentHomePath(user)
  }

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
