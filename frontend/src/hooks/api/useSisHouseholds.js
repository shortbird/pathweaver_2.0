import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Families, their members, and the students not yet in one.
 *
 * QF-03, 2026-09-04. HouseholdsPage fired all three requests in a Promise.all
 * and kept the results in three separate `useState`s. They stay together in one
 * query because the page is meaningless with a subset -- the unassigned list is
 * defined by what the other two contain -- and three independent queries would
 * let the page render a student as both assigned and unassigned mid-flight.
 *
 * A rejected Promise.all previously toasted once and left all three empty.
 * Under react-query the same failure surfaces as `isError` with the last good
 * data retained, which is the better behaviour for a page staff keep open.
 */
export const useSisHouseholds = (orgId, options = {}) => useQuery({
  queryKey: queryKeys.sis.households(orgId),
  queryFn: async () => {
    const [h, m, u] = await Promise.all([
      api.get(withOrg('/api/sis/households', orgId)),
      api.get(withOrg('/api/sis/members', orgId)),
      api.get(withOrg('/api/sis/unassigned-students', orgId)),
    ])
    return {
      households: h.data?.households || [],
      members: m.data?.members || [],
      unassigned: u.data?.students || [],
    }
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
  ...options,
})

export default useSisHouseholds
