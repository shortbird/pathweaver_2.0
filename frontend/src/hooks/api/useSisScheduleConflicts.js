import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

const EMPTY = { data: {} }

/**
 * The advisory teacher/room double-booking rows, live and already-answered.
 *
 * Both halves live here: the READ (this query, QF-03) and the WRITE that
 * answers a warning (acknowledgeScheduleConflict, below). They arrived from two
 * directions on the same day and were briefly two files; one concept, one
 * module.
 *
 * Keys on orgId, not just the URL -- a superadmin switches orgs inside one
 * session, and a cache keyed only by path would show them the previous school's
 * clashes.
 */
export const useSisScheduleConflicts = (orgId) => useQuery({
  queryKey: queryKeys.sis.scheduleConflicts(orgId),
  queryFn: async () => {
    const [tc, rs] = await Promise.all([
      api.get(withOrg('/api/sis/teacher-conflicts', orgId)).catch(() => EMPTY),
      api.get(withOrg('/api/sis/room-schedule', orgId)).catch(() => EMPTY),
    ])
    return {
      teacherConflicts: tc.data?.conflicts || [],
      ackedTeacher: tc.data?.acknowledged || [],
      roomConflicts: rs.data?.conflicts || [],
      ackedRoom: rs.data?.acknowledged || [],
      roomOccupancy: rs.data?.occupancy || {},
    }
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

/**
 * Move a row between the live and answered lists without a round trip, so the
 * banner responds to "that's fine" immediately. The server is the record; the
 * next load reads it back.
 */
export const useConflictsPatch = (orgId) => {
  const qc = useQueryClient()
  return useCallback((fn) => {
    qc.setQueryData(queryKeys.sis.scheduleConflicts(orgId), (old) => (old ? fn(old) : old))
  }, [qc, orgId])
}

/**
 * Answering a schedule double-booking warning.
 *
 * iCreate, 2026-09-05 (8479edee): "I'd like to have a button to hit that allows
 * me to acknowledge I've seen it, but I think it's ok, so clear it from the
 * warnings."
 *
 * A plain function rather than a hook: this is a write with no cached read of
 * its own — the Classes page already holds the conflict lists, and the server
 * returns them split into live and acknowledged on the next load. It lives here
 * rather than inline on the page so pages/ keeps no request of its own (see
 * __tests__/dataFetchingParadigm.test.js).
 *
 * The acknowledgement is org-wide and reversible; the key comes from the
 * conflict row and carries the day and hour, so rescheduling either class
 * raises the warning again.
 */
export const acknowledgeScheduleConflict = (orgId, key, acknowledged = true) =>
  api.post(withOrg('/api/sis/schedule-conflicts/acknowledge', orgId), { key, acknowledged })

export default useSisScheduleConflicts
