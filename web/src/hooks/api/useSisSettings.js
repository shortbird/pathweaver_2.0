import { useCallback, useEffect, useState } from 'react'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * The school's settings, read once per page and written one key at a time.
 *
 * `patchSisSettings(orgId, patch)` is the only way a settings screen writes
 * organizations.feature_flags. The body names the keys to change --
 * `{ sis_settings: { rooms } }`, `{ registration: { fee_mode } }`,
 * `{ hide_pillars: true }` -- and PATCH /api/sis/settings merges them onto the
 * stored blob server-side. Thirteen cards used to read the whole blob, spread
 * it and PUT it back whole, so two cards saving from two tabs erased each
 * other (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, H2). Send a null to
 * remove a key; never send a key you did not change.
 *
 * `useOrgSettings(orgId)` is the read the Settings and Registration pages
 * share: the organization payload (`data.organization`, with the finance
 * fields redacted for a coordinator by the server), `loading`, and `reload`
 * for after a save. The two pages had copy-pasted the fetch.
 */
export const patchSisSettings = (orgId, patch) =>
  api.patch(withOrg('/api/sis/settings', orgId), patch).then((r) => r.data?.feature_flags)

export function useOrgSettings(orgId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback((options = {}) => {
    const showSpinner = options?.showSpinner ?? false
    if (!orgId) { setData(null); setLoading(false); return Promise.resolve(null) }
    if (showSpinner) setLoading(true)
    return api.get(`/api/admin/organizations/${orgId}`)
      .then((r) => { setData(r.data); return r.data })
      .catch(() => { setData(null); return null })
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => {
    setData(null)
    reload({ showSpinner: true })
  }, [orgId, reload])

  return { data, organization: data?.organization || null, loading, reload }
}
