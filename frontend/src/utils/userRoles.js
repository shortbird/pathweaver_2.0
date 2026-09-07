/**
 * Role helpers for the learning-app chrome.
 *
 * The rule itself — how a role resolves out of `role` / `org_role` /
 * `org_roles` — lives in `@shared/roles`, generated against and conformance
 * tested against `backend/utils/roles.py`. This file holds only the web app's
 * own compositions of it.
 *
 * An iCreate teacher who is also a parent has role='org_managed' with
 * 'advisor' in org_roles, so a plain `user.role === 'advisor'` check misses
 * them. That is what userHasRole is for.
 */

import { userHasRole as sharedUserHasRole, effectiveRoleOf, effectiveRolesOf } from '@shared/roles'

export { effectiveRoleOf, effectiveRolesOf }

/**
 * True when the user holds the role, in any of the three shapes it can arrive
 * in. Kept at this arity — `(user, role)` — because every call site in the web
 * app passes exactly one; the shared implementation is variadic.
 */
export const userHasRole = (user, role) => sharedUserHasRole(user, role)

/**
 * School staff: teachers (advisors), org admins, campus coordinators,
 * superadmin. Includes parents who teach — `has_advisor_assignments` marks a
 * guardian who advises students, and `is_org_admin` marks org admins whose
 * role column says org_managed. Coordinators don't set `is_org_admin` (the
 * trigger reserves it for org_admin), so they must match by org role here.
 *
 * Chrome only. This is deliberately wider than any server gate — notably
 * `has_advisor_assignments`, which is a count of rows in
 * advisor_student_assignments and puts nothing into get_effective_roles. Do
 * not use it to decide whether a request will be allowed; see useCanEditXp,
 * which used to and offered a control the server refused.
 */
export const isStaffUser = (user) => {
  if (!user) return false
  if (user.role === 'superadmin' || user.is_org_admin) return true
  if (user.has_advisor_assignments) return true
  return ['advisor', 'org_admin', 'campus_coordinator'].some((role) => userHasRole(user, role))
}

/**
 * Mirrors the backend's `require_school_admin`: superadmin, an `org_admin`
 * role, or the `is_org_admin` flag. Deliberately NARROWER than isStaffUser —
 * advisors and campus coordinators are staff but are not org admins, and the
 * decorator turns them away with "Organization admin access required".
 *
 * Use this before calling an admin-gated endpoint from a shared component.
 * Overview sections are rendered for students, parents and observers as well as
 * admins, and a component that fetched unconditionally sent every parent into a
 * guaranteed 403 (Sentry OPTIO-WEB-3, 23 parents).
 */
export const isSchoolAdminUser = (user) => {
  if (!user) return false
  if (user.role === 'superadmin' || user.is_org_admin) return true
  return userHasRole(user, 'org_admin')
}
