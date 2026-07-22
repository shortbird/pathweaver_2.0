/**
 * SIS role tier for the frontend chrome. Mirrors the backend split:
 * org_admin/superadmin get the full console, advisors (teachers) get the
 * scoped teacher portal. The backend enforces this on every endpoint — the
 * frontend check only decides which nav/pages to render.
 */
export const isSisAdmin = (user) => {
  if (!user) return false
  if (user.role === 'superadmin' || user.role === 'org_admin') return true
  if (user.is_org_admin) return true
  const roles = Array.isArray(user.org_roles) && user.org_roles.length
    ? user.org_roles
    : [user.org_role].filter(Boolean)
  return roles.includes('org_admin')
}
