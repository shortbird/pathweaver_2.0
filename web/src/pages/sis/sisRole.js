/**
 * SIS role tier for the frontend chrome. Mirrors the backend split
 * (backend/routes/sis/roles.py): org_admin, campus_coordinator and superadmin
 * get the full console, advisors (teachers) get the scoped teacher portal. The
 * backend enforces this on every endpoint — the frontend check only decides
 * which nav/pages to render.
 */

const orgRolesOf = (user) => {
  if (!user) return []
  return Array.isArray(user.org_roles) && user.org_roles.length
    ? user.org_roles
    : [user.org_role].filter(Boolean)
}

/**
 * Everyone who works at the school — the gate on the SIS console itself
 * (mirrors backend `utils/sis_roles.STAFF_ROLES`). Teachers included; what
 * they see inside is narrowed by `isSisAdmin` and by the backend's scoping.
 *
 * Reads EVERY role the user holds, never just the primary one. Staff are often
 * parents of their own students, and the primary role is simply whichever
 * entry `org_roles` happens to lead with — the order carries no meaning. A
 * teacher stored as ['parent', 'advisor'] is exactly as much a teacher as one
 * stored the other way round (iCreate, 2026-08-19: Ashley Schaupp teaches
 * eight classes and was bounced back to the web platform every time she
 * clicked "School Admin", because the gate read her primary role alone while
 * the launcher that offered her the button read all of them).
 */
const STAFF_ROLES = ['org_admin', 'campus_coordinator', 'advisor', 'superadmin']

export const isSisStaff = (user) => {
  if (!user) return false
  if (STAFF_ROLES.includes(user.role)) return true
  if (user.is_org_admin) return true
  return orgRolesOf(user).some((r) => STAFF_ROLES.includes(r))
}

export const isSisAdmin = (user) => {
  if (!user) return false
  if (user.role === 'superadmin' || user.role === 'org_admin') return true
  if (user.is_org_admin) return true
  const roles = orgRolesOf(user)
  return roles.includes('org_admin') || roles.includes('campus_coordinator')
}

/**
 * A campus coordinator, and not also an admin.
 *
 * iCreate, 2026-08-01: "we don't want the cc's to have access to all the
 * financial stuff". They run the campus — people, classes, registration,
 * attendance, paperwork — but billing, timesheets and payroll are not theirs.
 * Someone can hold both roles; holding the higher one wins.
 */
export const isCampusCoordinator = (user) => {
  if (!user) return false
  if (user.role === 'superadmin' || user.role === 'org_admin') return false
  const roles = orgRolesOf(user)
  if (roles.includes('org_admin')) return false
  return roles.includes('campus_coordinator')
}

/** False for a campus coordinator — the money pages and the pay fields. */
export const canSeeFinance = (user) => isSisAdmin(user) && !isCampusCoordinator(user)

/**
 * Who may open another member's account — "View as student" on the roster,
 * the "Viewing as" picker in the sidebar. Mirrors the backend's one rule
 * (utils/token_authority.caller_may_masquerade): a superadmin may act as
 * anyone; an org admin may act as a non-admin member of their own school.
 *
 * The roster button used to be superadmin-only while the backend had allowed
 * org admins for weeks, so the school that asked for it could not use it
 * (iCreate, 2026-09-04: "can you make it so we can view as students as well
 * so we can see what a given student is able to see?"). A coordinator is not
 * in this set for the same reason the backend leaves them out.
 */
export const canViewAs = (user) => isSisAdmin(user) && !isCampusCoordinator(user)

/**
 * Who may grant the admin role, or change somebody who holds it (backend:
 * sis_roles.ROLE_GRANT_ROLES, asked per call in sis_service).
 *
 * Same membership as canSeeFinance, kept as its own name because it is a
 * different reason: a coordinator who can grant org_admin can grant it to
 * themselves, which hands back the finance access the role exists to withhold.
 *
 * This is deliberately NOT "who may change roles at all". Every role below
 * admin — coordinator, teacher, parent, student, observer — is the whole
 * front office's to give and take (2026-09-14: "the campus coordinator role
 * needs to be able to change the roles of other users ... from CC down"). So
 * the role editors open for any isSisAdmin, and this gate decides only
 * whether the Admin option is on the list and whether an admin's own row is
 * editable.
 */
export const canGrantAdmin = (user) => isSisAdmin(user) && !isCampusCoordinator(user)

/**
 * Whether THIS caller may edit THIS person's role. False when the person is
 * an admin and the caller may not touch admins — the backend refuses that
 * write, so the control is not offered rather than offered and refused.
 */
export const canEditRolesOf = (user, roles) =>
  isSisAdmin(user) && (canGrantAdmin(user) || !(roles || []).includes('org_admin'))

/**
 * The HR store — secure documents: contracts, background checks, custody and
 * medical files (backend: sis_roles.HR_ROLES). iCreate requirements 2026-08-09:
 * coordinators get operational information, not employment paperwork. Same
 * membership as canSeeFinance, separate name for a separate reason, so neither
 * gate can be widened on the other's behalf.
 */
export const canSeeHr = (user) => isSisAdmin(user) && !isCampusCoordinator(user)
