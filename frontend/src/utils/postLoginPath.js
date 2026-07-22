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
 * - advisor (teacher) -> the advisor dashboard
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
    return '/advisor/dashboard'
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
