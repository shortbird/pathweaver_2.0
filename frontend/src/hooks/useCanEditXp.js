import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { OrganizationContext } from '../contexts/OrganizationContext'

/**
 * Whether the current user may choose or change a task's XP value.
 *
 * XP is learner-editable by default. Schools can restrict it to guides with the
 * org toggle `organizations.feature_flags.lock_xp_editing` (Organization ->
 * Settings). When that flag is on, only advisors, org admins, and superadmins
 * see an XP control; everyone else sees the value read-only.
 *
 * The server enforces the same rule (backend/utils/xp_permissions.py) -- this
 * hook exists so a locked org never shows a control that would fail on save.
 *
 * Reads both contexts directly rather than via useAuth()/useOrganization(),
 * which throw when a provider is absent. A missing provider means "no org", so
 * the safe answer is the platform default: XP stays editable.
 */

const XP_GUIDE_ROLES = ['superadmin', 'org_admin', 'advisor']

export const XP_LOCKED_HINT = 'Your school sets the XP for tasks.'

export default function useCanEditXp() {
  const auth = useContext(AuthContext)
  const org = useContext(OrganizationContext)

  const locked = Boolean(org?.organization?.feature_flags?.lock_xp_editing)
  if (!locked) return true

  // Effective role: org_managed users carry their real role in org_role.
  const user = auth?.user
  const role = user?.role === 'org_managed' ? user?.org_role : user?.role
  return XP_GUIDE_ROLES.includes(role)
}
