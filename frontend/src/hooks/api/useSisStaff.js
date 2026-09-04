import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The org's staff list.
 *
 * QF-03, 2026-09-04. StaffPage hand-rolled this: rows in `useState`, a second
 * `useState` for loading, a `useCallback` to refetch after an edit. Sixteen
 * commits in six months, and the list is small and rarely changes -- so a cache
 * is nearly free and every navigation back to the page was paying for a request
 * that would return the same rows.
 *
 * orgId is in the key, not only the URL: a superadmin switching orgs must not
 * be shown the previous org's staff from cache.
 */
export const useSisStaff = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.staff(orgId),
  queryFn: async () => {
    const res = await api.get(withOrg('/api/sis/staff', orgId))
    return res.data?.staff || []
  },
  enabled: !!orgId,
  staleTime: 60 * 1000,
  ...options,
})

export default useSisStaff
