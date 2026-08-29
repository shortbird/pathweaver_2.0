import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * "Viewing as" — switch the whole session to ONE of the roles this account
 * holds, backend authorization included (POST /api/role-view/<role> sets a
 * signed httpOnly cookie; utils/roles.apply_role_view narrows every role
 * decision server-side).
 *
 * Built for staff who wear several hats: Katie at Gryffin holds parent +
 * teacher (+ admin), and the only way she had to see the teacher portal was
 * removing admin from her own account (2026-08-28). Shown only when the
 * account holds more than one viewable role.
 */

const ROLE_LABELS = {
  org_admin: 'Admin',
  campus_coordinator: 'Coordinator',
  advisor: 'Teacher',
  parent: 'Parent',
  student: 'Student',
  observer: 'Observer',
}

// Superadmin and org_managed are not views; everything else is.
const viewable = (roles = []) => roles.filter((r) => ROLE_LABELS[r])

export const startRoleView = async (role) => {
  await api.post(`/api/role-view/${role}`, {})
  // Full reload: /me must re-answer with the narrowed profile before any
  // chrome renders, and cached queries from the old view must go.
  window.location.href = '/'
}

export const exitRoleView = async () => {
  await api.post('/api/role-view/exit', {})
  window.location.href = '/'
}

const RoleViewSwitcher = ({ user }) => {
  const [busy, setBusy] = useState(false)
  const rv = user?.role_view
  const roles = viewable(rv?.available_roles)
  const active = rv?.active_role || null
  if (!active && roles.length < 2) return null

  const pick = async (role) => {
    if (busy) return
    setBusy(true)
    try {
      if (role) await startRoleView(role)
      else await exitRoleView()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not switch views')
      setBusy(false)
    }
  }

  return (
    <div className="px-3 pt-3">
      <div className="rounded-lg border border-gray-200 bg-neutral-50 p-2">
        <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Viewing as
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => active && pick(null)}
            disabled={busy}
            className={`px-2 py-1 rounded text-xs font-medium ${
              !active
                ? 'bg-optio-purple text-white'
                : 'text-neutral-600 hover:bg-white border border-transparent hover:border-gray-200'
            }`}
          >
            All roles
          </button>
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => active !== r && pick(r)}
              disabled={busy}
              className={`px-2 py-1 rounded text-xs font-medium ${
                active === r
                  ? 'bg-optio-purple text-white'
                  : 'text-neutral-600 hover:bg-white border border-transparent hover:border-gray-200'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        {active && (
          <p className="px-1 pt-1.5 text-[11px] text-neutral-500">
            The whole platform behaves as if this were your only role.
          </p>
        )}
      </div>
    </div>
  )
}

export default RoleViewSwitcher
