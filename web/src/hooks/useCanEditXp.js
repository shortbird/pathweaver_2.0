import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { OrganizationContext } from '../contexts/OrganizationContext'
import { userHasRole } from '../utils/userRoles'
import { useFamilyScope } from '../contexts/FamilyScopeContext'
import useTaskAuthoringRules from './useTaskAuthoringRules'

/**
 * Whether the current user may choose or change a task's XP value.
 *
 * XP is learner-editable by default. Schools can restrict it to teachers with the
 * org toggle `organizations.feature_flags.lock_xp_editing` (Organization ->
 * Settings). When that flag is on, only teachers (the `advisor` role, which
 * displays as Teacher), org admins, and superadmins see an XP control;
 * everyone else sees the value read-only.
 *
 * The server enforces the same rule (backend/utils/xp_permissions.py) -- this
 * hook exists so a locked org never shows a control that would fail on save.
 *
 * Reads both contexts directly rather than via useAuth()/useOrganization(),
 * which throw when a provider is absent. A missing provider means "no org", so
 * the safe answer is the platform default: XP stays editable.
 *
 * Family scope is the exception. A parent working as their child is writing
 * the CHILD's task at the CHILD's school, and neither context knows that
 * school -- they describe the signed-in parent. Until 2026-09-25 this answered
 * for the parent's school, so a platform parent saw an XP picker the child's
 * locked school would refuse (and an org parent could be shown the reverse).
 * When scope is delegated the server's answer (`can_edit_xp` from
 * GET /api/tasks/authoring-rules, resolved against the child) wins; while it
 * loads, or if it fails, the context answer below stands in.
 */

/**
 * Mirrors XP_GUIDE_ROLES in backend/utils/xp_permissions.py, which is the
 * authority. useCanEditXp.roles.test.jsx reads that file and fails if the two
 * lists stop matching -- a client list that is WIDER shows a control the server
 * refuses, and one that is NARROWER hides a control a teacher is entitled to.
 */
export const XP_GUIDE_ROLES = ['superadmin', 'org_admin', 'campus_coordinator', 'advisor']

export const XP_LOCKED_HINT = 'Your school sets the XP for tasks.'

export default function useCanEditXp() {
  const auth = useContext(AuthContext)
  const org = useContext(OrganizationContext)
  // Safe without a provider: useFamilyScope falls back to "not scoped".
  const { selectedChildId } = useFamilyScope()
  const delegated = Boolean(selectedChildId)
  const { rules } = useTaskAuthoringRules({ enabled: delegated })

  if (delegated && typeof rules?.can_edit_xp === 'boolean') return rules.can_edit_xp

  const locked = Boolean(org?.organization?.feature_flags?.lock_xp_editing)
  if (!locked) return true

  // Exactly the server's XP_GUIDE_ROLES, not "staff".
  //
  // This used isStaffUser until 2026-09-03, which is wider in two ways. One of
  // them turned out to be right and the SERVER moved to match: coordinators are
  // XP guides as of 2026-09-04. The other did not -- isStaffUser also passes
  // anyone carrying has_advisor_assignments, which is a count of rows in
  // advisor_student_assignments and puts no role into get_effective_roles, so
  // the API still refuses them and this must not offer them the control.
  //
  // userHasRole checks every shape a role arrives in -- `role`, the `org_roles`
  // array, and legacy `org_role` -- so an org teacher who is also a parent keeps
  // the XP control. A plain `role === 'advisor'` check would miss them.
  return XP_GUIDE_ROLES.some((role) => userHasRole(auth?.user, role))
}
