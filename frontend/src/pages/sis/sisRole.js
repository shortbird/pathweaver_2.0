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
  if (user.is_org_admin) return false
  const roles = orgRolesOf(user)
  return roles.includes('campus_coordinator') && !roles.includes('org_admin')
}

/** False for a campus coordinator — the money pages and the pay fields. */
export const canSeeFinance = (user) => isSisAdmin(user) && !isCampusCoordinator(user)

/**
 * Who may change somebody's role (backend: sis_roles.ROLE_GRANT_ROLES).
 *
 * Same membership as canSeeFinance, kept as its own name because it is a
 * different reason: a coordinator who can grant roles can grant themselves
 * org_admin, which hands back the finance access the role exists to withhold.
 */
export const canGrantRoles = (user) => isSisAdmin(user) && !isCampusCoordinator(user)

/**
 * The HR store — secure documents: contracts, background checks, custody and
 * medical files (backend: sis_roles.HR_ROLES). iCreate requirements 2026-08-09:
 * coordinators get operational information, not employment paperwork. Same
 * membership as canSeeFinance, separate name for a separate reason, so neither
 * gate can be widened on the other's behalf.
 */
export const canSeeHr = (user) => isSisAdmin(user) && !isCampusCoordinator(user)
