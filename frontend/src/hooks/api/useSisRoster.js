import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The org's roster: every student, with their family and enrolment state.
 *
 * QF-03, 2026-09-04. RosterPage fetched this by hand -- `useState` for the
 * rows, another for `loading`, a `useCallback` to refetch, and three call sites
 * passing that callback down as `onSaved`/`onCreated`/`onDone`. It is the
 * highest-churn hand-rolled page in the SIS console (19 commits in six months),
 * which is exactly where the missing cache costs the most: the roster is the
 * page staff come back to between every other task, and each return refetched
 * the whole list.
 *
 * orgId is in the query key rather than only in the URL, so a superadmin
 * switching orgs cannot be shown the previous org's roster from cache.
 */
export const useSisRoster = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.roster(orgId),
  queryFn: async () => {
    const res = await api.get(withOrg('/api/sis/roster', orgId))
    return res.data?.roster || []
  },
  enabled: !!orgId,
  // Staff edit this list constantly -- a family gets assigned, a student is
  // withdrawn -- so it goes stale quickly, and the mutations that change it
  // call refetch() directly anyway.
  staleTime: 30 * 1000,
  ...options,
})

export default useSisRoster
