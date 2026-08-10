/**
 * Shared store for the SIS console's "active organization".
 *
 * The org picker is rendered on many pages, but each page used to keep its own
 * copy of the selection — so the persistent sidebar (and other pages) never
 * reacted when a superadmin switched orgs. This module holds the selection once
 * and notifies every subscriber, so the whole console — sidebar, route guards,
 * and pages — updates together the moment a superadmin picks a different org.
 *
 * Only superadmins choose an org here; org_admins/advisors are always locked to
 * their own org (resolved from OrganizationContext in useSisOrg).
 */

const STORE_KEY = 'optio_sis_org_id'

const read = () => {
  try { return localStorage.getItem(STORE_KEY) } catch { return null }
}
const persist = (id) => {
  try { if (id) localStorage.setItem(STORE_KEY, id) } catch { /* ignore */ }
}

let state = { orgId: read(), orgs: [], fetched: false, loading: false }

const listeners = new Set()
const emit = () => { for (const l of listeners) l() }

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return state
}

export function setOrgId(id) {
  if (state.orgId === id) return
  state = { ...state, orgId: id }
  persist(id)
  emit()
}

export function setLoading(v) {
  if (state.loading === v) return
  state = { ...state, loading: v }
  emit()
}

// With no prior selection, land on iCreate — the active customer, and what a
// superadmin opening the school-page preview or the console wants first.
const preferredDefault = (orgs) =>
  orgs.find((o) => (o.slug || '').toLowerCase() === 'icreate')?.id
  ?? orgs.find((o) => /icreate/i.test(o.name || ''))?.id
  ?? orgs[0]?.id
  ?? null

/** Store the fetched org list; default the selection to iCreate, else the first org. */
export function setOrgs(list) {
  const orgs = Array.isArray(list) ? list : []
  const orgId = state.orgId || preferredDefault(orgs)
  persist(orgId)
  state = { ...state, orgs, orgId, fetched: true, loading: false }
  emit()
}
