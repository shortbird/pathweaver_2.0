import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import SearchSelect from '../ui/SearchSelect'
import { withOrg } from '../../pages/sis/useSisOrg'
import { getMasqueradeState, startMasquerade, exitMasquerade } from '../../services/masqueradeService'

/**
 * "Viewing as" — for the admin tiers (superadmin, org_admin) this is ONE
 * searchable person picker: choose anyone at the school and the backend
 * answers as that account (a masquerade — audited in admin_masquerade_log,
 * gated by token_authority.caller_may_masquerade). The role dropdown that
 * used to sit above it is gone: the generic role view showed an empty
 * account, and admins only ever wanted a real person's setup (2026-08-31).
 *
 * Non-admins who hold several roles (Katie at Gryffin: parent + teacher)
 * keep the role view instead — they may not masquerade, so narrowing their
 * own session to one role (POST /api/role-view/<role>, signed httpOnly
 * cookie, utils/roles.apply_role_view) is their switcher.
 */

const ROLE_LABELS = {
  org_admin: 'Admin',
  campus_coordinator: 'Coordinator',
  advisor: 'Teacher',
  parent: 'Parent',
  student: 'Student',
  observer: 'Observer',
}

const viewable = (roles = []) => roles.filter((r) => ROLE_LABELS[r])

const isAdminTier = (realRoles = []) => realRoles.includes('superadmin') || realRoles.includes('org_admin')

export const offeredRoles = (realRoles = []) => {
  if (isAdminTier(realRoles)) return []
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
const landingFor = (roles = []) => {
  if (roles.includes('campus_coordinator') || roles.includes('advisor')) return '/'
  if (roles.includes('parent')) return '/parent/dashboard'
  if (roles.includes('student')) return '/dashboard'
  return '/'
}

const personLabel = (p) => {
  const roles = (p.roles || []).map((r) => ROLE_LABELS[r]).filter(Boolean)
  return roles.length ? `${p.name} — ${roles.join(', ')}` : p.name
}

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
  const orgReady = !isSuperadmin || Boolean(orgId)

  // The person list — everyone at the school an admin may open.
  useEffect(() => {
    if (!adminTier || masq || !orgReady) { setPeople(null); return }
    let cancelled = false
    api.get(withOrg('/api/role-view/people', isSuperadmin ? orgId : null))
      .then((r) => { if (!cancelled) setPeople(r.data?.people || []) })
      .catch(() => { if (!cancelled) setPeople([]) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTier, isSuperadmin, orgId, orgReady, Boolean(masq)])

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

  const pickPerson = async (personId) => {
    if (busy || !personId) return
    const person = (people || []).find((p) => p.id === personId)
    setBusy(true)
    const result = await startMasquerade(personId, 'SIS viewing-as picker', api, landingFor(person?.roles))
    if (!result.success) {
      toast.error(result.error || 'Could not open that account')
      setBusy(false)
    }
  }

  if (adminTier) {
    return (
      <div className="px-3 pt-3 space-y-2">
        <label className="block">
          <span className="block px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Viewing as
          </span>
          <SearchSelect
            value=""
            onChange={pickPerson}
            options={people || []}
            getId={(p) => p.id}
            getLabel={personLabel}
            placeholder={!orgReady ? 'Pick a school first' : people === null ? 'Loading…' : 'Search people…'}
          />
        </label>
        {/* Role views are no longer started from here, but one can still be
            active (older session, TopNavbar); leave a way back. */}
        {active && (
          <button
            onClick={async () => { if (!busy) { setBusy(true); try { await exitRoleView() } catch { setBusy(false) } } }}
            disabled={busy}
            className="w-full rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50"
          >
            Exit {ROLE_LABELS[active] || active} view
          </button>
        )}
        <p className="px-1 text-[11px] text-neutral-500">
          Open someone&rsquo;s account to see the platform exactly as they do.
        </p>
      </div>
    )
  }

  // Non-admin, several roles: narrow the session to one of them.
  if (!active && !roles.length) return null

  const pickRole = async (role) => {
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
    <div className="px-3 pt-3 space-y-2">
      <label className="block">
        <span className="block px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Viewing as
        </span>
        <select value={active || ''} disabled={busy} onChange={(e) => pickRole(e.target.value || null)} className={select}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </label>
      {active && (
        <p className="px-1 text-[11px] text-neutral-500">
          The whole platform behaves as if this were your only role.
        </p>
      )}
    </div>
  )
}

export default RoleViewSwitcher
