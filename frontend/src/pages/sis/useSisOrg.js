import { useEffect, useState } from 'react'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'

const STORE_KEY = 'optio_sis_org_id'

/**
 * Resolves the organization the SIS console operates on.
 * - org_admin / advisor: locked to their own organization.
 * - superadmin (no org of their own): exposes a picker over all organizations,
 *   remembering the last choice in localStorage.
 *
 * Returns { orgId, setOrgId, orgs, isSuperadmin, loading }.
 * `orgId` is appended as ?organization_id to every SIS API call.
 */
export function useSisOrg() {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const isSuperadmin = user?.role === 'superadmin'

  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgIdState] = useState(() => {
    return organization?.id || (() => { try { return localStorage.getItem(STORE_KEY) } catch { return null } })()
  })
  const [loading, setLoading] = useState(isSuperadmin && !organization?.id)

  const setOrgId = (id) => {
    setOrgIdState(id)
    try { localStorage.setItem(STORE_KEY, id) } catch { /* ignore */ }
  }

  useEffect(() => {
    if (organization?.id) {
      setOrgIdState(organization.id)
      return
    }
    if (isSuperadmin) {
      setLoading(true)
      api.get('/api/admin/organizations')
        .then((r) => {
          const list = r.data?.organizations || r.data?.data || (Array.isArray(r.data) ? r.data : [])
          setOrgs(list)
          setOrgIdState((prev) => prev || list[0]?.id || null)
        })
        .catch(() => { /* surfaced as empty picker */ })
        .finally(() => setLoading(false))
    }
  }, [organization?.id, isSuperadmin])

  return { orgId, setOrgId, orgs, isSuperadmin, loading }
}

/** Append ?organization_id to a SIS API path when an org is selected. */
export function withOrg(path, orgId) {
  if (!orgId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}organization_id=${encodeURIComponent(orgId)}`
}
