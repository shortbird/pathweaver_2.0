import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * "Viewing as" — switch the whole session to ONE role, backend authorization
 * included (POST /api/role-view/<role> sets a signed httpOnly cookie;
 * utils/roles.apply_role_view narrows every role decision server-side).
 *
 * Who gets what: the admin tiers (superadmin, org_admin) may view as ANY role
 * of the school — that is the "what does a teacher / a family see" preview
 * the front office keeps asking for. Everyone else gets the roles they hold,
 * shown only when there is more than one (Katie at Gryffin: parent + teacher,
 * 2026-08-28). A superadmin's view is pinned to the org currently selected.
 */

const ROLE_LABELS = {
  org_admin: 'Admin',
  campus_coordinator: 'Coordinator',
  advisor: 'Teacher',
  parent: 'Parent',
  student: 'Student',
}

// Everything an admin tier may step down into, in nav order.
const ADMIN_TIER_OFFER = ['org_admin', 'campus_coordinator', 'advisor', 'parent', 'student']

const viewable = (roles = []) => roles.filter((r) => ROLE_LABELS[r])

export const offeredRoles = (realRoles = []) => {
  if (realRoles.includes('superadmin') || realRoles.includes('org_admin')) return ADMIN_TIER_OFFER
  const held = viewable(realRoles)
  return held.length > 1 ? held : []
}

export const startRoleView = async (role, orgId = null) => {
  await api.post(`/api/role-view/${role}`, orgId ? { organization_id: orgId } : {})
  // Full reload: /me must re-answer with the narrowed profile before any
  // chrome renders, and cached queries from the old view must go.
  window.location.href = '/'
}

export const exitRoleView = async () => {
  await api.post('/api/role-view/exit', {})
  window.location.href = '/'
}

const RoleViewSwitcher = ({ user, orgId = null }) => {
  const [busy, setBusy] = useState(false)
  const rv = user?.role_view
  const real = rv?.available_roles || []
  const roles = offeredRoles(real)
  const active = rv?.active_role || null
  if (!active && !roles.length) return null
  const isSuperadmin = real.includes('superadmin')
  const resetLabel = isSuperadmin ? 'Superadmin' : (real.includes('org_admin') && real.length === 1 ? 'Admin' : 'All roles')
  // The Admin button is the same thing as "reset" for a plain org admin.
  const options = roles.filter((r) => !(r === 'org_admin' && resetLabel === 'Admin'))

  const pick = async (role) => {
    if (busy) return
    if (role && isSuperadmin && !orgId) {
      toast.error('Pick a school first')
      return
    }
    setBusy(true)
    try {
      if (role) await startRoleView(role, isSuperadmin ? orgId : null)
      else await exitRoleView()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not switch views')
      setBusy(false)
    }
  }

  return (
    <div className="px-3 pt-3">
      <label className="block">
        <span className="block px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Viewing as
        </span>
        <select
          value={active || ''}
          disabled={busy}
          onChange={(e) => pick(e.target.value || null)}
          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-optio-purple disabled:opacity-50"
        >
          <option value="">{resetLabel}</option>
          {options.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </label>
      {active && (
        <p className="px-1 pt-1 text-[11px] text-neutral-500">
          The whole platform behaves as if this were your only role.
        </p>
      )}
    </div>
  )
}

export default RoleViewSwitcher
