/**
 * Whether the current user may choose or change a task's XP value.
 *
 * XP is learner-editable by default. Schools can restrict it to guides with the
 * org toggle `organizations.feature_flags.lock_xp_editing` (Organization ->
 * Settings on the web app). When that flag is on, only advisors, org admins, and
 * superadmins get an XP control; everyone else gets the value the server assigns.
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

  // Effective role: org_managed users carry their real role in org_role.
  const role = user?.role === 'org_managed' ? user?.org_role : user?.role;
  return XP_GUIDE_ROLES.includes(role || '');
}

export default useCanEditXp;
