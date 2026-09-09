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
import { userHasRole } from '@/src/utils/effectiveRole';

/**
 * Mirrors XP_GUIDE_ROLES in backend/utils/xp_permissions.py, which is the
 * authority. __tests__/useCanEditXp.roles.test.ts reads that file and fails if
 * the lists stop matching. The web app's copy drifted WIDER once and offered
 * the control to people the server turns away; exported so the test can see it.
 */
export const XP_GUIDE_ROLES = ['superadmin', 'org_admin', 'campus_coordinator', 'advisor'];

export const XP_LOCKED_HINT = 'Your school sets the XP for tasks.';

export function useCanEditXp(): boolean {
  const user = useAuthStore((s) => s.user);

  const locked = Boolean(user?.organization?.feature_flags?.lock_xp_editing);
  if (!locked) return true;

  // userHasRole checks all three shapes a role arrives in (role, org_roles[],
  // org_role) -- an org teacher who is also a parent has role='org_managed'
  // with 'advisor' in org_roles, and a primary-role check would withhold
  // their XP control.
  return userHasRole(user, ...XP_GUIDE_ROLES);
}

export default useCanEditXp;
