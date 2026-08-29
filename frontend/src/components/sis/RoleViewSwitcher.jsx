import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { getMasqueradeState, startMasquerade, exitMasquerade } from '../../services/masqueradeService'

/**
 * "Viewing as" — switch the whole session to ONE role, backend authorization
 * included (POST /api/role-view/<role> sets a signed httpOnly cookie;
 * utils/roles.apply_role_view narrows every role decision server-side), and
 * optionally to ONE PERSON in that role, which is a masquerade: the backend
 * answers as that account, so an admin sees a teacher's real classes or a
 * family's real portal rather than a generic empty view (iCreate,
 * 2026-08-28). Masquerade is audited (admin_masquerade_log) and gated by
 * token_authority.caller_may_masquerade.
 *
 * Who gets what: the admin tiers (superadmin, org_admin) may view as ANY role
 * of the school and as any non-admin member of it. Everyone else gets the
 * roles they hold, shown only when there is more than one (Katie at Gryffin:
 * parent + teacher). A superadmin's view is pinned to the org selected.
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

const isAdminTier = (realRoles = []) => realRoles.includes('superadmin') || realRoles.includes('org_admin')

export const offeredRoles = (realRoles = []) => {
  if (isAdminTier(realRoles)) return ADMIN_TIER_OFFER
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

// Where a masqueraded session should open: staff on the console home,
// families and students on their own surfaces.
const landingFor = (role) => (role === 'parent' ? '/parent/dashboard' : role === 'student' ? '/dashboard' : '/')

const select = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-optio-purple disabled:opacity-50'

const RoleViewSwitcher = ({ user, orgId = null }) => {
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState(null)
  const rv = user?.role_view
  const real = rv?.available_roles || []
  const roles = offeredRoles(real)
  const active = rv?.active_role || null
  const masq = getMasqueradeState()
  const isSuperadmin = real.includes('superadmin')
  const adminTier = isAdminTier(real)

  // The person list for the active role — admin tiers only, and only once a
  // role is chosen (a plain multi-role user gets no person picker).
  useEffect(() => {
    if (!active || !adminTier || masq) { setPeople(null); return }
    let cancelled = false
    api.get(withOrg(`/api/role-view/people?role=${encodeURIComponent(active)}`, isSuperadmin ? orgId : null))
      .then((r) => { if (!cancelled) setPeople(r.data?.people || []) })
      .catch(() => { if (!cancelled) setPeople([]) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, adminTier, isSuperadmin, orgId, Boolean(masq)])

  // Inside a masquerade the account we see IS the target, so the real roles
  // above belong to them; render the way back instead of their switcher.
  if (masq?.target_user) {
    const t = masq.target_user
    const name = `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.display_name || t.email || 'this person'
    const leave = async () => {
      if (busy) return
      setBusy(true)
      const result = await exitMasquerade(api)
      if (result.success || !getMasqueradeState()) {
        window.location.href = '/'
      } else {
        toast.error(result.error || 'Could not exit')
        setBusy(false)
      }
    }
    return (
      <div className="px-3 pt-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Viewing as</p>
          <p className="text-sm font-medium text-neutral-900 truncate">{name}</p>
          <button onClick={leave} disabled={busy}
            className="mt-1.5 w-full rounded-lg bg-neutral-900 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? 'Leaving…' : 'Back to my account'}
          </button>
        </div>
      </div>
    )
  }

  if (!active && !roles.length) return null
  const resetLabel = isSuperadmin ? 'Superadmin' : (real.includes('org_admin') && real.length === 1 ? 'Admin' : 'All roles')
  // The Admin option is the same thing as reset for a plain org admin.
  const options = roles.filter((r) => !(r === 'org_admin' && resetLabel === 'Admin'))

  const pickRole = async (role) => {
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

  const pickPerson = async (personId) => {
    if (busy || !personId) return
    setBusy(true)
    const result = await startMasquerade(personId, `SIS view as ${active}`, api, landingFor(active))
    if (!result.success) {
      toast.error(result.error || 'Could not open that account')
      setBusy(false)
    }
  }

  return (
    <div className="px-3 pt-3 space-y-2">
      <label className="block">
        <span className="block px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Viewing as
        </span>
        <select value={active || ''} disabled={busy} onChange={(e) => pickRole(e.target.value || null)} className={select}>
          <option value="">{resetLabel}</option>
          {options.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </label>
      {active && adminTier && (
        <label className="block">
          <span className="block px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Specific {ROLE_LABELS[active] ? ROLE_LABELS[active].toLowerCase() : 'person'}
          </span>
          <select value="" disabled={busy || people === null} onChange={(e) => pickPerson(e.target.value)} className={select}>
            <option value="">
              {people === null ? 'Loading…' : people.length ? 'Open someone’s account…' : `No ${ROLE_LABELS[active]?.toLowerCase() || 'people'}s yet`}
            </option>
            {(people || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
      {active && (
        <p className="px-1 text-[11px] text-neutral-500">
          {adminTier
            ? 'Generic view of this role. Pick a person to see their actual setup.'
            : 'The whole platform behaves as if this were your only role.'}
        </p>
      )}
    </div>
  )
}

export default RoleViewSwitcher
