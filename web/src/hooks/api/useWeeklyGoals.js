import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Year goals for the Goals page's Year goals tab (2026-10-08): every current
 * student with the year goals their weeks serve, read from the weekly goals
 * board, and the staff write on the weekly goals module's own door
 * (PUT /api/sis/weekly-goals/students/<id>/year), so a school without the
 * parents' goal flow can set them.
 */

export const useYearGoals = (orgId) => useQuery({
  queryKey: [...queryKeys.sis.all, 'yearGoals', orgId],
  queryFn: async () => {
    const res = await api.get(withOrg('/api/sis/weekly-goals', orgId))
    return { subjects: res.data?.subjects || [], students: res.data?.students || [] }
  },
  enabled: !!orgId,
})

export const useSaveYearGoals = (orgId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ studentId, subjects }) => (await api.put(
      withOrg(`/api/sis/weekly-goals/students/${studentId}/year`, orgId), { subjects })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...queryKeys.sis.all, 'yearGoals', orgId] }),
  })
}
