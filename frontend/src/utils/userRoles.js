/**
 * Role helpers for the learning-app chrome.
 *
 * A user's role can arrive in three shapes: the platform `role` column, the
 * `org_roles` array (multi-role org users), or the legacy `org_role` field.
 * Anything that gates chrome on a role has to check all three — an iCreate
 * teacher who is also a parent has role='org_managed' with 'advisor' in
 * org_roles, so a plain `user.role === 'advisor'` check misses them.
 */

export const userHasRole = (user, role) => {
  if (!user || !role) return false
  if (user.role === role) return true
  if (Array.isArray(user.org_roles) && user.org_roles.includes(role)) return true
  if (user.org_role === role) return true
  return false
}

/**
 * School staff: teachers (advisors), org admins, campus coordinators,
 * superadmin. Includes parents who teach — `has_advisor_assignments` marks a
 * guardian who advises students, and `is_org_admin` marks org admins whose
 * role column says org_managed. Coordinators don't set `is_org_admin` (the
 * trigger reserves it for org_admin), so they must match by org role here.
 */
export const isStaffUser = (user) => {
  if (!user) return false
  if (user.role === 'superadmin' || user.is_org_admin) return true
  if (user.has_advisor_assignments) return true
  return ['advisor', 'org_admin', 'campus_coordinator'].some((role) => userHasRole(user, role))
}
