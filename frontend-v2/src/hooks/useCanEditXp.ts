/**
 * Whether the current user may choose or change a task's XP value.
 *
 * XP is learner-editable by default. Schools can restrict it to teachers with the
 * org toggle `organizations.feature_flags.lock_xp_editing` (Organization ->
 * Settings on the web app). When that flag is on, only teachers (the `advisor`
 * role, which displays as Teacher), org admins, and superadmins get an XP
 * control; everyone else gets the value the server assigns.
 *
 * The server enforces the same rule (backend/utils/xp_permissions.py) -- this
 * hook only stops a locked org from showing a control that would be ignored.
 */

import { useAuthStore } from '@/src/stores/authStore';

const XP_GUIDE_ROLES = ['superadmin', 'org_admin', 'advisor'];

export const XP_LOCKED_HINT = 'Your school sets the XP for tasks.';

export function useCanEditXp(): boolean {
  const user = useAuthStore((s) => s.user);

  const locked = Boolean(user?.organization?.feature_flags?.lock_xp_editing);
  if (!locked) return true;

  // A role can arrive in three shapes: the platform `role` column, the
  // `org_roles` array (multi-role org users), or the legacy `org_role`. Check
  // all three -- an org teacher who is also a parent has role='org_managed' with
  // 'advisor' in org_roles, and a primary-role check would withhold their XP
  // control. Mirrors userHasRole in the web app's utils/userRoles.
  return XP_GUIDE_ROLES.some(
    (role) =>
      user?.role === role ||
      (Array.isArray(user?.org_roles) && user.org_roles.includes(role)) ||
      user?.org_role === role,
  );
}

export default useCanEditXp;
