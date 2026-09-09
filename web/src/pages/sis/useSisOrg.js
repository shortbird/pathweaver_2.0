import { useEffect, useSyncExternalStore } from 'react'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import * as orgStore from './sisOrgStore'

/**
 * Resolves the organization the SIS console operates on.
 * - org_admin / advisor: locked to their own organization (from OrganizationContext).
 * - superadmin (no org of their own): picks from all organizations via the shared
 *   store, so every surface — sidebar, route guards, and pages — switches together.
 *
 * Returns { orgId, setOrgId, orgs, isSuperadmin, loading, activeOrg }.
 * `orgId` is appended as ?organization_id to every SIS API call; `activeOrg` is the
 * full org row (with feature_flags) for the org currently in view, so callers can
 * mirror exactly what that org's admin sees.
 */
export function useSisOrg() {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const isSuperadmin = user?.role === 'superadmin'
  const snap = useSyncExternalStore(orgStore.subscribe, orgStore.getSnapshot)

  // Superadmins with no org of their own load the full org list once (shared).
  useEffect(() => {
    if (organization?.id) return
    if (isSuperadmin && !snap.fetched && !snap.loading) {
      orgStore.setLoading(true)
      api.get('/api/admin/organizations')
        .then((r) => {
          const list = r.data?.organizations || r.data?.data || (Array.isArray(r.data) ? r.data : [])
          orgStore.setOrgs(list)
        })
        .catch(() => orgStore.setOrgs([]))
    }
  }, [organization?.id, isSuperadmin, snap.fetched, snap.loading])

  // Org staff are pinned to their own org; superadmins use the shared selection.
  const orgId = organization?.id || snap.orgId
  const orgs = snap.orgs
  const activeOrg = organization?.id
    ? organization
    : (orgs.find((o) => o.id === orgId) || null)
  const loading = isSuperadmin && !organization?.id && !snap.fetched

  return { orgId, setOrgId: orgStore.setOrgId, orgs, isSuperadmin, loading, activeOrg }
}

/** Append ?organization_id to a SIS API path when an org is selected. */
export function withOrg(path, orgId) {
  if (!orgId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}organization_id=${encodeURIComponent(orgId)}`
}
