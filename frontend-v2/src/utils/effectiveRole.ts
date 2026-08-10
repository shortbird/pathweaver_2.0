/**
 * The one place that answers "what role is this user, really".
 *
 * Users come in two shapes (see CLAUDE.md, Role System): platform users carry
 * their role in `role`; org-managed users carry `role='org_managed'` with the
 * actual role in `org_role` (and possibly several in `org_roles`). Before this
 * existed, five call sites re-derived the same rule inline — keep them (and any
 * new gate) on these helpers.
 *
 * Plain functions, not hooks, so non-React paths (landingRoute, authStore) can
 * share them. The superadmin preview shell (previewRoleStore) is deliberately
 * NOT handled here — only useIsObserver/useIsParent layer that on.
 */

interface RoleShape {
  role?: string | null;
  org_role?: string | null;
  org_roles?: string[] | null;
}

/** The user's actual role: org_role for org_managed users, role otherwise. */
export function effectiveRoleOf(user: RoleShape | null | undefined): string | null {
  if (!user) return null;
  if (user.role === 'org_managed' && user.org_role) return user.org_role;
  return user.role ?? null;
}

/**
 * True when the user holds ANY of the given roles, in any of the three shapes
 * a role can arrive in: the platform `role`, the `org_roles` array (multi-role
 * org users), or the legacy `org_role`. Mirrors userHasRole in the web app's
 * utils/userRoles.
 */
export function userHasRole(user: RoleShape | null | undefined, ...roles: string[]): boolean {
  if (!user) return false;
  return roles.some(
    (role) =>
      user.role === role ||
      (Array.isArray(user.org_roles) && user.org_roles.includes(role)) ||
      user.org_role === role,
  );
}
